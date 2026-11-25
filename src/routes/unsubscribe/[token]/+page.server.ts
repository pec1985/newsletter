import { sql } from '#lib/server/db.js';
import { unsubscribeCopy } from '#lib/server/unsubscribe-copy.js';
import { reasons } from '#lib/unsubscribe.js';
import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

async function contact(token: string) {
	if (!/^[a-f0-9]{64}$/.test(token)) error(404);
	const [row] =
		await sql`select c.id,c.email,c.locale,c.unsubscribed,d.campaign_id from deliveries d
		join contacts c on c.id=d.contact_id and lower(c.email)=lower(d.email) where d.token=${token}`;
	if (!row) error(404);
	return row;
}
export const load: PageServerLoad = async ({ params, setHeaders, locals }) => {
	setHeaders({ 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' });
	const c = await contact(params.token);
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
		const c = await contact(params.token);
		const reason = (await request.formData()).get('reason');
		if (typeof reason !== 'string' || !Object.hasOwn(reasons, reason))
			return fail(400, { invalid: true });
		await sql`update contacts set unsubscribed=true,unsubscribed_at=now(),unsubscribe_reason=${reason}
			where id=${c.id} and email=${c.email} and not unsubscribed`;
	},
	resubscribe: async ({ params }) => {
		const c = await contact(params.token);
		await sql`update contacts set unsubscribed=false,unsubscribed_at=null,unsubscribe_reason=null
			where id=${c.id} and email=${c.email} and unsubscribed`;
		return { subscribed: true };
	}
};
