import { sql } from './db';
import { error } from '@sveltejs/kit';

export async function unsubscribeContact(token: string) {
	if (!/^[a-f0-9]{64}$/.test(token)) error(404);
	const [row] =
		await sql`select c.id,c.email,c.locale,c.unsubscribed,d.campaign_id from deliveries d
		join contacts c on c.id=d.contact_id and lower(c.email)=lower(d.email) where d.token=${token}`;
	if (!row) error(404);
	return row;
}

export async function recordUnsubscribe(id: string, email: string, reason: string) {
	await sql`update contacts set unsubscribed=true,unsubscribed_at=now(),unsubscribe_reason=${reason}
		where id=${id} and email=${email} and not unsubscribed`;
}
