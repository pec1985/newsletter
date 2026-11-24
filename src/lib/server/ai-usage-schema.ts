import { sql } from './db';
export async function migrateAiUsage() {
	await sql`
 create table if not exists ai_usage (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete set null,
  campaign_subject text not null,
  task text not null check (task in ('draft', 'translate')),
  locale text,
  model text not null,
  endpoint text not null,
  status text not null default 'pending',
  input_tokens bigint,
  cached_input_tokens bigint,
  output_tokens bigint,
  rates jsonb not null,
  cost_usd numeric(24,12),
  pricing_status text not null default 'unknown_usage',
  created_at timestamptz not null default now()
 );
 create index if not exists ai_usage_campaign_idx on ai_usage(campaign_id);
 `.simple();
}
