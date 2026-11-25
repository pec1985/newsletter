import { sql } from '#lib/server/db.js';
import { unsubscribeCopy } from '#lib/server/unsubscribe-copy.js';
import { reasons } from '#lib/unsubscribe.js';
import { unsubscribeContact, recordUnsubscribe } from '#lib/server/unsubscribe-contact.js';
import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params, setHeaders, locals }) => {
	setHeaders({ 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' });
	const c = await unsubscribeContact(params.token);
	const [company] = await sql`select value->>'companyName' as name from settings where id=1`;
	const localized = await unsubscribeCopy(c.locale, c.campaign_id);
	locals.pageLanguage = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(localized.lang)
		? localized.lang
		: 'en';
	return {
		companyName: (company?.name as string | undefined)?.trim() || '',
		unsubscribed: Boolean(c.unsubscribed),
		...localized
	};
};
export const actions: Actions = {
	unsubscribe: async ({ params, request }) => {
		const c = await unsubscribeContact(params.token);
		const reason = (await request.formData()).get('reason');
		if (typeof reason !== 'string' || !Object.hasOwn(reasons, reason))
			return fail(400, { invalid: true });
		await recordUnsubscribe(c.id, c.email, reason);
	},
	resubscribe: async ({ params }) => {
		const c = await unsubscribeContact(params.token);
		await sql`update contacts set unsubscribed=false,unsubscribed_at=null,unsubscribe_reason=null
			where id=${c.id} and email=${c.email} and unsubscribed`;
		return { subscribed: true };
	}
};
