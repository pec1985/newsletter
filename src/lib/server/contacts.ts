import { error, json } from '@sveltejs/kit';
import { authenticateApiKey } from './api-keys';
import { sql } from './db';

export const maxContacts = 20000;
const maxBytes = 16 * 1024 * 1024;
export const contactColumns = sql`id,name,email,locale,not unsubscribed as subscribed,suppressed,
 (not unsubscribed and not suppressed) as can_email,unsubscribed_at,created_at`;
export const contactJson = (data: unknown, status = 200) =>
	json(data, { status, headers: { 'Cache-Control': 'no-store' } });

export async function authorizeContacts(request: Request, user: App.Locals['user'], url: URL) {
	const authorization = request.headers.get('authorization');
	if (authorization !== null) {
		const key = /^Bearer (\S+)$/i.exec(authorization)?.[1];
		if (!key || !(await authenticateApiKey(key)))
			error(401, 'Invalid or revoked contacts API key.');
		return;
	}
	if (!user) error(401, 'Provide a bearer API key or sign in.');
	if (!['GET', 'HEAD'].includes(request.method) && request.headers.get('origin') !== url.origin)
		error(403, 'Invalid request origin.');
}

export async function contactBody(request: Request): Promise<unknown> {
	if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
		error(415, 'Send contacts as application/json.');
	if (Number(request.headers.get('content-length')) > maxBytes)
		error(413, 'Contact requests must be at most 16 MB.');
	const reader = request.body?.getReader();
	if (!reader) error(400, 'Provide a JSON body.');
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > maxBytes) {
				await reader.cancel();
				error(413, 'Contact requests must be at most 16 MB.');
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	try {
		return JSON.parse(Buffer.concat(chunks).toString('utf8'));
	} catch {
		error(400, 'The request body must be valid JSON.');
	}
}

export function normalizeEmail(value: unknown): string {
	if (typeof value !== 'string') error(400, 'Provide a valid email address.');
	const email = value.trim().toLowerCase();
	if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
		error(400, 'Provide a valid email address.');
	return email;
}
export function contactId(value: string) {
	if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))
		error(400, 'Provide a valid contact ID.');
	return value;
}
export type ContactInput = { name: string; email: string; locale: string; subscribed?: boolean };
export function parseContact(input: unknown, partial: false): ContactInput;
export function parseContact(input: unknown, partial: true): Partial<ContactInput>;
export function parseContact(input: unknown, partial: boolean): Partial<ContactInput> {
	if (!input || typeof input !== 'object' || Array.isArray(input))
		error(400, 'Each contact must be an object.');
	const row = input as Record<string, unknown>;
	const result: Partial<ContactInput> = {};
	if (!partial || row.name !== undefined) {
		if (typeof row.name !== 'string' || row.name.length > 200)
			error(400, 'Name must be a string of at most 200 characters.');
		result.name = row.name.trim();
	}
	if (!partial || row.email !== undefined) result.email = normalizeEmail(row.email);
	if (!partial || row.locale !== undefined) {
		if (
			typeof row.locale !== 'string' ||
			!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(row.locale) ||
			row.locale.length > 40
		)
			error(400, 'Provide a valid locale, such as en or es.');
		result.locale = row.locale;
	}
	for (const field of ['subscribed', 'unsubscribed']) {
		if (row[field] !== undefined && typeof row[field] !== 'boolean')
			error(400, `${field} must be a boolean.`);
	}
	if (
		typeof row.subscribed === 'boolean' &&
		typeof row.unsubscribed === 'boolean' &&
		row.subscribed === row.unsubscribed
	)
		error(400, 'subscribed and unsubscribed contradict each other.');
	if (typeof row.subscribed === 'boolean') result.subscribed = row.subscribed;
	else if (typeof row.unsubscribed === 'boolean') result.subscribed = !row.unsubscribed;
	if (Object.hasOwn(row, 'suppressed'))
		error(400, 'Suppression cannot be changed through the contacts API.');
	if (partial && !Object.keys(result).length)
		error(400, 'Provide a name, email, locale, or subscribed field to update.');
	return result;
}

export async function upsertContacts(input: unknown) {
	const rows = Array.isArray(input) ? input : [input];
	if (!rows.length || rows.length > maxContacts)
		error(400, 'Provide between 1 and 20,000 contacts.');
	const contacts = rows.map((row, index) => {
		try {
			return parseContact(row, false);
		} catch (cause) {
			if (cause && typeof cause === 'object' && 'body' in cause)
				error(400, `Contact ${index + 1}: ${(cause.body as { message: string }).message}`);
			throw cause;
		}
	});
	const unique = new Map<string, ContactInput>();
	for (const contact of contacts) {
		const previous = unique.get(contact.email);
		// Last name/locale wins, but an opt-out anywhere in the request is preserved.
		unique.set(contact.email, {
			...contact,
			subscribed: previous?.subscribed === false ? false : contact.subscribed
		});
	}
	const ordered = [...unique.values()].sort((a, b) => a.email.localeCompare(b.email));
	const ids = await sql.begin(async (tx) => {
		const byEmail = new Map<string, string>();
		for (let offset = 0; offset < ordered.length; offset += 1000) {
			const batch = ordered.slice(offset, offset + 1000).map((c) => ({
				name: c.name,
				email: c.email,
				locale: c.locale,
				unsubscribed: c.subscribed === false
			}));
			const saved =
				await tx`insert into contacts(name,email,locale,unsubscribed,unsubscribed_at,unsubscribe_reason)
    select name,email,locale,unsubscribed,case when unsubscribed then now() else null end,case when unsubscribed then 'other' end
    from jsonb_to_recordset(${tx.json(batch)}::jsonb) as incoming(name text,email text,locale text,unsubscribed boolean)
    on conflict(email) do update set name=excluded.name,locale=excluded.locale,
     unsubscribed=contacts.unsubscribed or excluded.unsubscribed,
     unsubscribe_reason=coalesce(contacts.unsubscribe_reason,excluded.unsubscribe_reason),
     unsubscribed_at=case when excluded.unsubscribed then coalesce(contacts.unsubscribed_at,now()) else contacts.unsubscribed_at end
    returning id,email`;
			for (const row of saved) byEmail.set(row.email, row.id);
		}
		return contacts.map((c) => byEmail.get(c.email)!);
	});
	return { ids, processed: contacts.length, upserted: unique.size };
}

export async function updateContact(id: string, input: unknown) {
	contactId(id);
	const patch = parseContact(input, true);
	try {
		return await sql.begin(async (tx) => {
			const [existing] = await tx`select * from contacts where id=${id} for update`;
			if (!existing) error(404, 'Contact not found.');
			const subscribed = patch.subscribed ?? !existing.unsubscribed;
			const [contact] =
				await tx`update contacts set name=${patch.name ?? existing.name},email=${patch.email ?? existing.email},locale=${patch.locale ?? existing.locale},
    unsubscribed=${!subscribed},unsubscribe_reason=${subscribed ? null : (existing.unsubscribe_reason ?? 'other')},unsubscribed_at=${subscribed ? null : existing.unsubscribed_at || new Date()}
    where id=${id} returning ${contactColumns}`;
			return contact;
		});
	} catch (cause) {
		if (cause && typeof cause === 'object' && 'code' in cause && cause.code === '23505')
			error(409, 'Another contact already uses that email address.');
		throw cause;
	}
}

export async function deleteContact(id: string) {
	contactId(id);
	await sql.begin(async (tx) => {
		const [contact] = await tx`select id from contacts where id=${id} for update`;
		if (!contact) error(404, 'Contact not found.');
		// Lock deliveries so the worker cannot claim a queued email during deletion.
		const deliveries =
			await tx`select id,status from deliveries where contact_id=${id} order by id for update`;
		if (deliveries.some((d) => d.status === 'processing'))
			error(409, 'A delivery to this contact is in progress. Retry deletion after it finishes.');
		// Keep campaign snapshots and events. The worker skips detached queued deliveries.
		await tx`update deliveries set contact_id=null where contact_id=${id}`;
		await tx`delete from contacts where id=${id}`;
	});
}
