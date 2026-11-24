import { sql } from './db';
import { decrypt, digest } from './security';

export async function migrateApiKeys() {
	await sql.begin(async (tx) => {
		await tx`create table if not exists api_keys (
   id uuid primary key default gen_random_uuid(),
   name text not null,
   key_hash text unique not null,
   prefix text not null,
   created_at timestamptz not null default now(),
   created_by uuid references users(id) on delete set null,
   last_used_at timestamptz,
   revoked_at timestamptz
  )`;
		const [row] = await tx`select value from settings where id=1 for update`;
		if (row?.value?.contactsApiKey) {
			const key = decrypt(row.value.contactsApiKey);
			await tx`insert into api_keys(name,key_hash,prefix) values('Existing API key',${digest(key)},${key.slice(0, 12)}) on conflict(key_hash) do nothing`;
			await tx`update settings set value=value-'contactsApiKey' where id=1`;
		}
	});
}
