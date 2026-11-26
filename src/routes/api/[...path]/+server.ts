import { audienceMatch } from '#lib/server/audiences.js';
import { updateContact } from '#lib/server/contacts.js';
import {
	validationFields,
	validationConfig,
	validateService,
	type Service
} from '#lib/server/validate-service.js';
import { draftWithKnowledge } from '#lib/server/drafting-agent.js';
import { json, error } from '@sveltejs/kit';
import { sql } from '#lib/server/db.js';
import { settings, saveSettings } from '#lib/server/settings.js';
import { token } from '#lib/server/security.js';
import { prepareTranslation } from '#lib/server/translations.js';
import type { RequestHandler } from './$types';
import { audienceLocales, emailLocale, validLocale } from '#lib/email-locale.js';
export const POST: RequestHandler = async ({ request, locals, params, url }) => {
	const path = params.path;
	if (!locals.user) error(401, 'Sign in to continue.');
	if (request.headers.get('origin') !== url.origin) error(403, 'Invalid request origin.');
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
				form.set('folder', '/newsletter/images');
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
		if (path === 'validate-service') {
			if (typeof input.service !== 'string' || !Object.hasOwn(validationFields, input.service))
				error(400, 'Choose a supported service.');
			if (!input.config || typeof input.config !== 'object' || Array.isArray(input.config))
				error(400, 'Provide connection settings.');
			const service = input.service as Service;
			const config = validationConfig(service, input.config, await settings(true));
			return json(await validateService(service, config), {
				headers: { 'Cache-Control': 'no-store' }
			});
		}
		if (path === 'settings') {
			await saveSettings(input);
			return json({ ok: true });
		}
		if (path === 'api-key') error(410, 'Create named keys at /api/api-keys.');
		if (path === 'edit-contact') {
			await updateContact(String(input.id || ''), {
				name: input.name,
				email: input.email,
				locale: input.locale
			});
			return json({ ok: true });
		}
		if (path === 'unsubscribe-contact') {
			await sql`update contacts set unsubscribed=true,unsubscribed_at=coalesce(unsubscribed_at,now()),unsubscribe_reason=coalesce(unsubscribe_reason,'other') where id=${input.id}`;
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
		if (path === 'cancel-schedule') {
			await sql.begin(async (tx) => {
				const [locked] = await tx`select * from campaigns where id=${input.id} for update`;
				if (locked.status !== 'scheduled')
					error(409, 'This campaign is no longer scheduled. Delivery may have started.');
				await tx`delete from deliveries where campaign_id=${input.id} and status='queued'`;
				await tx`update campaigns set status='draft',locales=${audienceLocales(locked.locales)},source_locale=${emailLocale(locked.source_locale)},updated_at=now() where id=${input.id}`;
			});
			return json({ ok: true });
		}
		if (campaign.status !== 'draft') error(400, 'Sent campaigns are read-only.');
		if (path === 'save') {
			if (
				typeof input.subject !== 'string' ||
				typeof input.body !== 'string' ||
				input.body.length > 100000 ||
				(input.audience_id !== null &&
					(typeof input.audience_id !== 'string' ||
						!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input.audience_id))) ||
				!validLocale(input.source_locale)
			)
				error(400, 'Provide a subject, body, source language and a saved audience selection.');
			await sql.begin(async (tx) => {
				const [locked] = await tx`select * from campaigns where id=${input.id} for update`;
				if (locked.status !== 'draft') error(409, 'This campaign has already been queued.');
				const locales: string[] = [];
				if (input.audience_id) {
					const [audience] =
						await tx`select id from audiences where id=${input.audience_id} for share`;
					if (!audience) error(400, 'Choose an existing audience.');
					const rows =
						await tx`select distinct c.locale from audiences a join contacts c on ${audienceMatch} where a.id=${audience.id} order by c.locale`;
					locales.push(...rows.map((row) => row.locale));
				}
				const parseDate = (value: unknown) => {
					if (value === null || value === '') return null;
					if (
						typeof value !== 'string' ||
						!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
						!Number.isFinite(Date.parse(value))
					)
						error(400, 'Choose a valid date and time.');
					return new Date(value).toISOString();
				};
				const scheduledAt =
					input.scheduled_at === undefined ? locked.scheduled_at : parseDate(input.scheduled_at);
				await tx`update campaigns set scheduled_at=${scheduledAt} where id=${input.id}`;
				await tx`update campaigns set title=${input.subject.trim().slice(0, 500) || 'Untitled campaign'},subject=${input.subject.trim().slice(0, 500)},body=${input.body},audience_id=${input.audience_id},locales=${locales},source_locale=${emailLocale(input.source_locale)},updated_at=now() where id=${input.id} and status='draft'`;
				if (
					locked.subject !== input.subject.trim().slice(0, 500) ||
					locked.body !== input.body ||
					locked.source_locale !== emailLocale(input.source_locale)
				)
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
				const [locked] = await tx`select * from campaigns where id=${input.id} for update`;
				if (locked.status !== 'draft') error(409, 'This campaign has already been queued.');
				await tx`update campaigns set title=${result.subject.trim() || 'Untitled campaign'},subject=${result.subject},body=${result.body},messages=${sql.json(messages)},updated_at=now() where id=${input.id} and status='draft'`;
				if (locked.subject !== result.subject || locked.body !== result.body)
					await tx`delete from versions where campaign_id=${input.id}`;
			});
			return json({ ok: true });
		}
		if (path === 'edit-version') {
			if (
				typeof input.version_id !== 'string' ||
				typeof input.subject !== 'string' ||
				!input.subject.trim() ||
				input.subject.length > 500 ||
				typeof input.body !== 'string' ||
				!input.body.trim() ||
				input.body.length > 100000
			)
				error(
					400,
					'Provide a subject (up to 500 characters) and email body (up to 100,000 characters).'
				);
			await sql.begin(async (tx) => {
				const [locked] = await tx`select status from campaigns where id=${input.id} for update`;
				if (!locked || locked.status !== 'draft') error(409, 'This campaign is no longer a draft.');
				const [version] =
					await tx`select * from versions where id=${input.version_id} and campaign_id=${input.id} and status='ready'`;
				if (!version)
					error(409, 'This preview has changed. Cancel editing and review the latest version.');
				if (version.subject !== input.subject.trim() || version.body !== input.body)
					// Rotate the ID so an older preview cannot approve or overwrite this edit.
					await tx`update versions set id=gen_random_uuid(),subject=${input.subject.trim()},body=${input.body},approved_at=null,approved_by=null where id=${version.id}`;
			});
			return json({ ok: true });
		}
		if (path === 'approve-all') {
			if (
				!Array.isArray(input.version_ids) ||
				!input.version_ids.length ||
				input.version_ids.some((id: unknown) => typeof id !== 'string')
			)
				error(400, 'Choose the previews to approve.');
			const versionIds = new Set(input.version_ids);
			await sql.begin(async (tx) => {
				const [locked] =
					await tx`select status, locales from campaigns where id=${input.id} for update`;
				if (!locked || locked.status !== 'draft') error(409, 'This campaign is no longer a draft.');
				const ready =
					await tx`select id from versions where campaign_id=${input.id} and locale=any(${locked.locales}) and status='ready' for update`;
				if (
					ready.length !== locked.locales.length ||
					ready.length !== versionIds.size ||
					ready.some((v) => !versionIds.has(v.id))
				)
					error(409, 'The language previews have changed. Review them before approving all.');
				await tx`update versions set approved_at=now(), approved_by=${locals.user!.id} where campaign_id=${input.id} and id=any(${ready.map((v) => v.id)}) and approved_at is null`;
			});
			return json({ ok: true });
		}
		if (path === 'approve-version') {
			if (typeof input.version_id !== 'string' || typeof input.approved !== 'boolean')
				error(400, 'Choose a preview and its approval status.');
			await sql.begin(async (tx) => {
				const [locked] = await tx`select status from campaigns where id=${input.id} for update`;
				if (!locked || locked.status !== 'draft') error(409, 'This campaign is no longer a draft.');
				const [version] =
					await tx`update versions set approved_at=${input.approved ? new Date() : null},approved_by=${input.approved ? locals.user!.id : null} where id=${input.version_id} and campaign_id=${input.id} and status='ready' returning id`;
				if (!version) error(409, 'This preview has changed. Reopen the review before approving.');
			});
			return json({ ok: true });
		}
		if (path === 'translate') {
			if (input.locale !== undefined && !validLocale(input.locale))
				error(400, 'Choose a valid locale.');
			const locales = input.locale ? [emailLocale(input.locale)] : campaign.locales;
			for (const locale of locales)
				await prepareTranslation(input.id, locale, input.retry === true);
			return json({ ok: true });
		}
		if (path === 'send') {
			const config = await settings(true);
			// Delivery mode is server-controlled; development must never queue real email.
			const mode = import.meta.env.DEV ? 'local' : 'ses';
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
				if (locked.scheduled_at && new Date(locked.scheduled_at).getTime() <= Date.now())
					error(
						400,
						'The scheduled send time has passed. Choose a future time, or clear it to send now.'
					);
				const versions = await tx`select * from versions where campaign_id=${input.id}`;
				if (
					!locked.subject.trim() ||
					!locked.body.trim() ||
					!locked.locales.length ||
					locked.locales.some(
						(l: string) =>
							!versions.some((v) => v.locale === l && v.status === 'ready' && v.approved_at)
					)
				)
					error(400, 'Review and approve every language preview before sending.');
				const contacts =
					await tx`select c.* from audiences a join contacts c on ${audienceMatch} where a.id=${locked.audience_id}`;
				if (!contacts.length) error(400, 'There are no subscribed contacts in this audience.');
				if (contacts.some((c) => !locked.locales.includes(c.locale)))
					error(
						409,
						'The audience now includes another language. Return to the draft and review the new preview.'
					);
				for (const c of contacts) {
					const v = versions.find((v) => v.locale === c.locale)!;
					await tx`insert into deliveries (campaign_id,contact_id,email,name,locale,subject,body,token,mode) values (${input.id},${c.id},${c.email},${c.name},${c.locale},${v.subject},${v.body},${token()},${mode})`;
				}
				await tx`update campaigns set status=${locked.scheduled_at ? 'scheduled' : 'sending'},mode=${mode},updated_at=now() where id=${input.id}`;
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
