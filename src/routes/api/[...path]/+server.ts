import { draftWithKnowledge } from '#lib/server/drafting-agent.js';
import { json, error } from '@sveltejs/kit';
import { sql } from '#lib/server/db.js';
import { settings, saveSettings } from '#lib/server/settings.js';
import { token, digest } from '#lib/server/security.js';
import { generate } from '#lib/server/ai.js';
import type { RequestHandler } from './$types';
const validLocale = (s: unknown): s is string =>
	typeof s === 'string' && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(s);
export const POST: RequestHandler = async ({ request, locals, params, url }) => {
	const path = params.path;
	let apiAccess = false;
	if (path === 'contacts' && !locals.user) {
		const config = await settings(true);
		const bearer = request.headers.get('authorization')?.replace(/^Bearer /, '');
		apiAccess =
			!!bearer && !!config.contactsApiKey && digest(bearer) === digest(config.contactsApiKey);
	}
	if (!locals.user && !apiAccess) error(401, 'Sign in to continue.');
	if (!apiAccess && request.headers.get('origin') !== url.origin)
		error(403, 'Invalid request origin.');
	try {
		if (path === 'media') {
			const data = await request.formData();
			const file = data.get('file');
			if (
				!(file instanceof File) ||
				!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) ||
				file.size > 5 * 1024 * 1024
			)
				error(400, 'Choose a PNG, JPG, WebP, or GIF under 5 MB.');
			const config = await settings(true);
			let remoteUrl = null;
			let fileId = null;
			if (config.imagekitKey) {
				const form = new FormData();
				form.set('file', file);
				form.set('fileName', file.name);
				form.set('useUniqueFileName', 'true');
				const response = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
					method: 'POST',
					headers: {
						Authorization: `Basic ${Buffer.from(config.imagekitKey + ':').toString('base64')}`
					},
					body: form,
					signal: AbortSignal.timeout(60000)
				});
				if (!response.ok) error(400, 'ImageKit upload failed. Check the private key.');
				const result = await response.json();
				remoteUrl = result.url;
				fileId = result.fileId;
			}
			const [media] =
				await sql`insert into media (filename,mime,data,remote_url,file_id) values (${file.name},${file.type},${remoteUrl ? null : Buffer.from(await file.arrayBuffer())},${remoteUrl},${fileId}) returning id`;
			return json({
				url: `${url.origin}/media/${media.id}`,
				storage: remoteUrl ? 'ImageKit' : 'local'
			});
		}
		const input = await request.json();
		if (path === 'settings') {
			await saveSettings(input);
			return json({ ok: true });
		}
		if (path === 'api-key') {
			const key = token();
			await saveSettings({ contactsApiKey: key });
			return json({ key });
		}
		if (path === 'contacts') {
			const rows = Array.isArray(input) ? input : [input];
			if (rows.length > 1000) error(400, 'Import at most 1,000 contacts per request.');
			for (const c of rows)
				if (
					typeof c.name !== 'string' ||
					c.name.length > 200 ||
					typeof c.email !== 'string' ||
					c.email.length > 254 ||
					!/^\S+@\S+\.\S+$/.test(c.email) ||
					!validLocale(c.locale) ||
					(c.unsubscribed !== undefined && typeof c.unsubscribed !== 'boolean')
				)
					error(
						400,
						'Every contact needs a name, valid email, locale, and optional boolean unsubscribed.'
					);
			const ids = await sql.begin(async (tx) => {
				const ids = [];
				for (const c of rows) {
					const [row] =
						await tx`insert into contacts (name,email,locale,unsubscribed,unsubscribed_at) values (${c.name},${c.email.toLowerCase().trim()},${c.locale},${c.unsubscribed === true},${c.unsubscribed ? new Date() : null}) on conflict(email) do update set name=excluded.name,locale=excluded.locale,unsubscribed=contacts.unsubscribed or excluded.unsubscribed,unsubscribed_at=case when excluded.unsubscribed then coalesce(contacts.unsubscribed_at,now()) else contacts.unsubscribed_at end returning id`;
					ids.push(row.id);
				}
				return ids;
			});
			return json({ ids });
		}
		if (path === 'edit-contact') {
			if (
				typeof input.name !== 'string' ||
				input.name.length > 200 ||
				typeof input.email !== 'string' ||
				!/^\S+@\S+\.\S+$/.test(input.email) ||
				!validLocale(input.locale)
			)
				error(400, 'Enter a valid name, email and locale.');
			const [contact] =
				await sql`update contacts set name=${input.name},email=${input.email.toLowerCase().trim()},locale=${input.locale} where id=${input.id} returning id`;
			if (!contact) error(404, 'Contact not found.');
			return json({ ok: true });
		}
		if (path === 'unsubscribe-contact') {
			await sql`update contacts set unsubscribed=true,unsubscribed_at=now() where id=${input.id}`;
			return json({ ok: true });
		}
		if (path === 'campaigns') {
			const [c] =
				await sql`insert into campaigns (title,messages) values (${String(input.title || 'Untitled campaign').slice(0, 200)},${sql.json([{ role: 'assistant', content: 'What’s this email about? Tell me what you’re sharing and what you’d like your readers to do.' }])}) returning id`;
			return json(c);
		}
		if (path === 'delete-draft') {
			await sql.begin(async (tx) => {
				const [draft] = await tx`select status from campaigns where id=${input.id} for update`;
				if (!draft) error(404, 'Campaign not found.');
				if (draft.status !== 'draft') error(409, 'Only unsent drafts can be deleted.');
				const [delivery] =
					await tx`select id from deliveries where campaign_id=${input.id} limit 1`;
				if (delivery) error(409, 'A campaign with delivery records cannot be deleted.');
				// Prepared versions cascade; uploaded images remain available to other campaigns.
				await tx`delete from campaigns where id=${input.id}`;
			});
			return json({ ok: true });
		}
		const [campaign] = await sql`select * from campaigns where id=${input.id}`;
		if (!campaign) error(404, 'Campaign not found.');
		if (campaign.status !== 'draft') error(400, 'Sent campaigns are read-only.');
		if (path === 'save') {
			if (
				typeof input.subject !== 'string' ||
				typeof input.body !== 'string' ||
				input.body.length > 100000 ||
				!Array.isArray(input.locales) ||
				!input.locales.every(validLocale) ||
				!validLocale(input.source_locale)
			)
				error(400, 'Provide a subject, body, source language and audience locales.');
			await sql.begin(async (tx) => {
				const [locked] = await tx`select status from campaigns where id=${input.id} for update`;
				if (locked.status !== 'draft') error(409, 'This campaign has already been queued.');
				await tx`update campaigns set title=${input.subject.trim().slice(0, 500) || 'Untitled campaign'},subject=${input.subject.trim().slice(0, 500)},body=${input.body},locales=${input.locales},source_locale=${input.source_locale},updated_at=now() where id=${input.id} and status='draft'`;
				await tx`delete from versions where campaign_id=${input.id}`;
			});
			return json({ ok: true });
		}
		if (path === 'chat') {
			const config = await settings(true);
			const message = String(input.message || '').slice(0, 10000);
			if (!message.trim()) error(400, 'Write a message first.');
			const messages = [...campaign.messages, { role: 'user', content: message }];
			const result = await draftWithKnowledge(
				campaign as { id: string; source_locale: string; subject: string; body: string },
				messages,
				config
			);
			messages.push({
				role: 'assistant',
				sources: result.sources,
				content:
					result.message ||
					'I’ve updated your draft. Take a look and tell me what you’d like to change.'
			});
			await sql.begin(async (tx) => {
				const [locked] = await tx`select status from campaigns where id=${input.id} for update`;
				if (locked.status !== 'draft') error(409, 'This campaign has already been queued.');
				await tx`update campaigns set title=${result.subject.trim() || 'Untitled campaign'},subject=${result.subject},body=${result.body},messages=${sql.json(messages)},updated_at=now() where id=${input.id} and status='draft'`;
				await tx`delete from versions where campaign_id=${input.id}`;
			});
			return json({ ok: true });
		}
		if (path === 'translate') {
			const config = await settings(true);
			const versions: { locale: string; subject: string; body: string }[] = [];
			for (const locale of campaign.locales) {
				let subject = campaign.subject,
					body = campaign.body;
				if (locale !== campaign.source_locale) {
					const result = await generate(
						[
							{
								role: 'system',
								content:
									'Translate this email faithfully. Preserve every URL and Markdown image. Return JSON with subject and body. Do not add content.'
							},
							{ role: 'user', content: JSON.stringify({ targetLocale: locale, subject, body }) }
						],
						{ campaignId: input.id, task: 'translate', locale }
					);
					subject = result.subject;
					body = result.body;
				}
				body +=
					'\n\n' +
					(locale.startsWith('es') && config.signatureEs
						? config.signatureEs
						: config.signature || ''
					).replaceAll('\\n', '\n');
				versions.push({ locale, subject, body });
			}
			await sql.begin(async (tx) => {
				const [locked] = await tx`select * from campaigns where id=${input.id} for update`;
				if (
					locked.status !== 'draft' ||
					locked.updated_at.getTime() !== campaign.updated_at.getTime()
				)
					error(409, 'The draft changed. Prepare the previews again.');
				await tx`delete from versions where campaign_id=${input.id}`;
				for (const v of versions)
					await tx`insert into versions (campaign_id,locale,subject,body) values (${input.id},${v.locale},${v.subject},${v.body})`;
			});
			return json({ ok: true });
		}
		if (path === 'send') {
			const config = await settings(true);
			const mode = input.mode === 'ses' ? 'ses' : 'local';
			if (
				mode === 'ses' &&
				(!process.env.APP_ORIGIN?.startsWith('https://') ||
					/localhost|127\.0\.0\.1/.test(process.env.APP_ORIGIN))
			)
				error(400, 'Set APP_ORIGIN to your public HTTPS app URL before sending real emails.');
			if (mode === 'ses' && (!config.awsAccessKey || !config.awsSecretKey || !config.senderEmail))
				error(400, 'Configure AWS SES and the sender before sending.');
			const count = await sql.begin(async (tx) => {
				const [locked] = await tx`select * from campaigns where id=${input.id} for update`;
				if (locked.status !== 'draft') error(409, 'This campaign has already been queued.');
				const versions = await tx`select * from versions where campaign_id=${input.id}`;
				if (
					!locked.subject.trim() ||
					!locked.body.trim() ||
					locked.locales.some((l: string) => !versions.some((v) => v.locale === l))
				)
					error(400, 'Prepare and review every language preview first.');
				const contacts =
					await tx`select * from contacts where not unsubscribed and not suppressed and locale=any(${locked.locales})`;
				if (!contacts.length) error(400, 'There are no subscribed contacts in this audience.');
				for (const c of contacts) {
					const v = versions.find((v) => v.locale === c.locale)!;
					await tx`insert into deliveries (campaign_id,contact_id,email,name,locale,subject,body,token,mode) values (${input.id},${c.id},${c.email},${c.name},${c.locale},${v.subject},${v.body},${token()},${mode})`;
				}
				await tx`update campaigns set status='sending',mode=${mode},updated_at=now() where id=${input.id}`;
				return contacts.length;
			});
			return json({ count });
		}
		error(404, 'Unknown action.');
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		console.error('API action failed:', e instanceof Error ? e.message : 'Unknown error');
		return json(
			{ message: e instanceof Error ? e.message : 'Something went wrong.' },
			{ status: 400 }
		);
	}
};
