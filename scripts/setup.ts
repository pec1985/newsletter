import { migrateAudiences } from '../src/lib/server/audience-schema';
import { migrateUnsubscribeReasons } from '../src/lib/server/unsubscribe-schema';
import { migrateEmailLocales } from '../src/lib/server/email-locale-migration';
import { migrateApiKeys } from '../src/lib/server/api-key-schema';
import { migrateCampaignSchedule } from '../src/lib/server/campaign-schedule-schema';
import { migrateTranslationApprovals } from '../src/lib/server/translation-approval-schema';
import { migrateKnowledge } from '../src/lib/server/knowledge-schema';
import { migrateAiUsage } from '../src/lib/server/ai-usage-schema';
import { sql } from '../src/lib/server/db';
import { hashPassword } from '../src/lib/server/security';
const production = process.argv.includes('--production');
if (process.env.NODE_ENV === 'production' && !production) {
	throw new Error('Use db:init in production; db:setup creates demo data.');
}
const username = production ? process.env.ADMIN_USERNAME : 'admin';
const password = production ? process.env.ADMIN_PASSWORD : 'admin';
if (!username || !password || (production && password.length < 8)) {
	throw new Error('Set ADMIN_USERNAME and ADMIN_PASSWORD (at least 8 characters).');
}
await sql`
create table if not exists users (id uuid primary key default gen_random_uuid(), username text unique not null, password_hash text not null);
create table if not exists sessions (token_hash text primary key, user_id uuid references users(id) on delete cascade, expires_at timestamptz not null);
create table if not exists settings (id integer primary key, value jsonb not null default '{}');
create table if not exists contacts (id uuid primary key default gen_random_uuid(), name text not null, email text unique not null, locale text not null default 'en', unsubscribed boolean not null default false, unsubscribed_at timestamptz, suppressed boolean not null default false, created_at timestamptz not null default now());
create table if not exists campaigns (id uuid primary key default gen_random_uuid(), title text not null, subject text not null default '', body text not null default '', source_locale text not null default 'en', locales text[] not null default '{en}', status text not null default 'draft', mode text not null default 'local', messages jsonb not null default '[]', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), sent_at timestamptz);
create table if not exists versions (id uuid primary key default gen_random_uuid(), campaign_id uuid references campaigns(id) on delete cascade, locale text not null, subject text not null, body text not null, unique(campaign_id,locale));
create table if not exists deliveries (id uuid primary key default gen_random_uuid(), campaign_id uuid references campaigns(id), contact_id uuid references contacts(id), email text not null, name text not null, locale text not null, subject text not null, body text not null, token text unique not null, status text not null default 'queued', mode text not null default 'local', sent_at timestamptz, first_opened_at timestamptz, last_opened_at timestamptz, open_count integer not null default 0, error text, provider_id text, unique(campaign_id,contact_id));
create table if not exists events (id bigserial primary key, delivery_id uuid references deliveries(id), type text not null, created_at timestamptz not null default now());
create table if not exists media (id uuid primary key default gen_random_uuid(), file_id text, filename text not null, mime text not null, data bytea, remote_url text, created_at timestamptz not null default now());
create index if not exists deliveries_campaign_idx on deliveries(campaign_id);
create index if not exists events_delivery_idx on events(delivery_id);
`.simple();
await migrateUnsubscribeReasons();
await migrateTranslationApprovals();
await migrateCampaignSchedule();
await migrateApiKeys();
await migrateEmailLocales();
await migrateAiUsage();
await migrateKnowledge();
await migrateAudiences();
await sql`insert into users (username,password_hash) select ${username},${hashPassword(password)} where not exists (select 1 from users) on conflict(username) do nothing`;
if (production) {
	await sql`insert into settings (id,value) values (1,'{}') on conflict(id) do nothing`;
	console.log('Production database ready. Existing users and settings preserved.');
	await sql.end();
	process.exit(0);
}
await sql`insert into settings (id,value) values (1,${sql.json({ companyName: 'Your company', companyContext: 'We build thoughtful software that makes everyday work simpler. Write like a person: warm, clear, and useful. Avoid hype.', senderName: 'Alex', senderEmail: 'alex@example.com', signature: 'Alex\nFounder, Your company', signatureEs: 'Alex\nFundador, Your company', awsRegion: 'eu-west-1', aiModel: 'gpt-4.1-mini' })}) on conflict(id) do nothing`;
const [count] = await sql`select count(*)::int as n from contacts`;
if (!count.n) {
	for (const [name, email, locale] of [
		['Jamie Chen', 'jamie@example.com', 'en'],
		['Sofia García', 'sofia@example.com', 'es'],
		['Oliver James', 'oliver@example.com', 'en'],
		['Lucía Martín', 'lucia@example.com', 'es'],
		['Emma Wilson', 'emma@example.com', 'en'],
		['Mateo López', 'mateo@example.com', 'es']
	])
		await sql`insert into contacts (name,email,locale) values (${name},${email},${locale})`;
}
const [campaigns] = await sql`select count(*)::int as n from campaigns`;
if (!campaigns.n) {
	await sql`insert into campaigns (title,subject,body,messages) values ('A little less busywork','A little less busywork. A little more flow.',${'Hi there,\n\nWe’ve been working on something small that makes a big difference: a simpler way to get through your day.\n\nOur latest update brings everything you need into one place, so you can spend less time switching tabs and more time on the work you love.\n\n**Here’s what’s new**\n\n• A calmer, more focused workspace\n• The details you need, right where you need them\n• A few thoughtful improvements, inspired by your feedback\n\n[Take a look at what’s new](https://example.com)\n\nWe’d love to hear what you think. Just hit reply.'},${sql.json([{ role: 'assistant', content: 'What would you like to share with your audience? Tell me about the update, who it’s for, and what you’d like them to do next.' }])})`;
	await sql`insert into campaigns (title,subject,body) values ('A warm welcome','Good to have you here',${'Hi there,\n\nThanks for being here. We’re excited to share what we’re building with you.'})`;
}
console.log('Database ready. Local test login: admin / admin.');
await sql.end();
