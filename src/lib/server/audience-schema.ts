import { sql } from './db';

export async function migrateAudiences() {
	await sql.begin(async (tx) => {
		await tx`alter table contacts
			add column if not exists plan text,
			add column if not exists usage jsonb check (jsonb_typeof(usage) in ('string','number')),
			add column if not exists last_used_at timestamptz`;
		await tx`create table if not exists audiences (
			id uuid primary key default gen_random_uuid(),
			name text not null unique,
			plan text,
			usage_label text,
			min_usage numeric,
			max_usage numeric,
			active_within_days integer check (active_within_days > 0),
			inactive_days integer check (inactive_days > 0),
			check (usage_label is null or (min_usage is null and max_usage is null)),
			check (min_usage <= max_usage)
		)`;
		await tx`alter table audiences add column if not exists min_exclusive boolean not null default false,
			add column if not exists max_exclusive boolean not null default false`;
		await tx`alter table campaigns add column if not exists audience_id uuid references audiences(id) on delete set null`;
		await tx`do $$ begin
			if exists (select 1 from pg_constraint where conrelid='campaigns'::regclass and conname='campaigns_audience_id_fkey' and confdeltype <> 'n') then
				alter table campaigns drop constraint campaigns_audience_id_fkey,
					add constraint campaigns_audience_id_fkey foreign key (audience_id) references audiences(id) on delete set null;
			end if;
		end $$`;
		await tx`alter table campaigns add column if not exists all_users boolean not null default false`;
		await tx`create table if not exists campaign_audiences (
			campaign_id uuid not null references campaigns(id) on delete cascade,
			audience_id uuid not null references audiences(id) on delete cascade,
			primary key(campaign_id,audience_id)
		)`;
		await tx`insert into campaign_audiences select id,audience_id from campaigns where audience_id is not null on conflict do nothing`;
		await tx`alter table campaigns alter column locales set default '{}'::text[]`;
		await tx`update campaigns set locales='{}' where status='draft' and not all_users and not exists(select 1 from campaign_audiences where campaign_id=campaigns.id) and cardinality(locales)>0`;
		await tx`create index if not exists contacts_audience_plan_idx on contacts(plan) where not unsubscribed and not suppressed`;
		await tx`create index if not exists contacts_audience_usage_idx on contacts(usage) where not unsubscribed and not suppressed`;
		await tx`create index if not exists contacts_audience_activity_idx on contacts(last_used_at) where not unsubscribed and not suppressed`;
	});
}
