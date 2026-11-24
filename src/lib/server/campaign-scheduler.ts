import { sql } from './db';
// Scheduling snapshots approved content and recipients. Only due campaigns release their queue.
export async function releaseDueCampaigns() {
	return await sql`update campaigns set status='sending',updated_at=now()
 where status='scheduled' and scheduled_at<=now() returning id`;
}
