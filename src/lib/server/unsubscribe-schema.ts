import { sql } from './db';

export async function migrateUnsubscribeReasons() {
	await sql.begin(async (tx) => {
		await tx`alter table contacts add column if not exists unsubscribe_reason text`;
		await tx`update contacts set unsubscribe_reason='other' where unsubscribed and unsubscribe_reason is null`;
	});
}
