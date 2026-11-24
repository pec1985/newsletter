import { sql } from './db';
export async function migrateKnowledge() {
	await sql.begin(async (tx) => {
		await tx`create extension if not exists vector`;
		await tx`
   create table if not exists knowledge_documents (
    id uuid primary key default gen_random_uuid(), title text not null, filename text not null,
    markdown text not null, content_hash text not null, revision integer not null default 1,
    status text not null default 'pending', chunk_count integer not null default 0,
    indexed_chunks integer not null default 0, embedding_profile text, embedding_model text,
    error text, heartbeat_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
   );
   create table if not exists knowledge_chunks (
    id uuid primary key default gen_random_uuid(), document_id uuid not null references knowledge_documents(id) on delete cascade,
    revision integer not null, position integer not null, heading text not null, content text not null, content_hash text not null,
    embedding vector not null, dimensions integer not null, embedding_profile text not null,
    search_text tsvector generated always as (to_tsvector('simple',heading || ' ' || content)) stored,
    unique(document_id, position)
   );
   create index if not exists knowledge_chunks_document_idx on knowledge_chunks(document_id);
   create index if not exists knowledge_chunks_text_idx on knowledge_chunks using gin(search_text);
   create index if not exists knowledge_chunks_cache_idx on knowledge_chunks(embedding_profile,content_hash);
   alter table ai_usage drop constraint if exists ai_usage_task_check;
   alter table ai_usage add constraint ai_usage_task_check check(task in ('draft','translate','embedding_index','embedding_search'));
   alter table ai_usage add column if not exists document_id uuid references knowledge_documents(id) on delete set null;
  `.simple();
	});
}
