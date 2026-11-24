import { sql } from '#lib/server/db.js';
import { error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
async function delivery(token: string) {
	if (!/^[a-f0-9]{64}$/.test(token)) error(404);
	const [d] = await sql`select contact_id from deliveries where token=${token}`;
	if (!d) error(404);
	return d;
}
export const load: PageServerLoad = async ({ params }) => {
	await delivery(params.token);
	return {};
};
export const actions: Actions = {
	default: async ({ params }) => {
		const d = await delivery(params.token);
		await sql`update contacts set unsubscribed=true,unsubscribed_at=now() where id=${d.contact_id}`;
		return { success: true };
	}
};
