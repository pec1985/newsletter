import { sql } from './db';
export async function migrateCampaignSchedule() {
	await sql`alter table campaigns add column if not exists scheduled_at timestamptz`;
	await sql`alter table campaigns add column if not exists reminder_sent_at timestamptz, add column if not exists reminder_retry_at timestamptz`;
	await sql`create index if not exists campaigns_due_idx on campaigns(scheduled_at) where status='scheduled'`;
}
