import { error } from '@sveltejs/kit';
import { sql } from '#lib/server/db.js';
import {
	authorizeContacts,
	contactBody,
	contactColumns,
	contactId,
	contactJson,
	normalizeEmail,
	upsertContacts
} from '#lib/server/contacts.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals, url }) => {
	await authorizeContacts(request, locals.user, url);
	return contactJson(await upsertContacts(await contactBody(request)));
};
export const GET: RequestHandler = async ({ request, locals, url }) => {
	await authorizeContacts(request, locals.user, url);
	if (url.searchParams.has('email')) {
		const email = normalizeEmail(url.searchParams.get('email'));
		const [contact] = await sql`select ${contactColumns} from contacts where email=${email}`;
		if (!contact) error(404, 'Contact not found.');
		return contactJson({ contact });
	}
	const limit = Number(url.searchParams.get('limit') || '100');
	if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
		error(400, 'limit must be between 1 and 1,000.');
	const cursor = url.searchParams.get('cursor');
	if (cursor) contactId(cursor);
	const contacts =
		await sql`select ${contactColumns} from contacts where id>${cursor || '00000000-0000-0000-0000-000000000000'}::uuid order by id limit ${limit + 1}`;
	const hasMore = contacts.length > limit;
	const page = contacts.slice(0, limit);
	return contactJson({ contacts: page, next_cursor: hasMore ? page[page.length - 1].id : null });
};
