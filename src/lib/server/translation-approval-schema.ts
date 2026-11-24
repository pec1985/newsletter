import { sql } from './db';

export async function migrateTranslationApprovals() {
	await sql`alter table versions add column if not exists approved_at timestamptz,
		add column if not exists approved_by uuid references users(id) on delete set null,
		add column if not exists status text not null default 'ready',
		add column if not exists started_at timestamptz,
		add column if not exists error text`;
}
