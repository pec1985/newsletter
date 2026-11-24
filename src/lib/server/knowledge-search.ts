import { sql } from './db';
import { settings } from './settings';
import { embedTexts, embeddingConnection } from './embeddings';
import type { KnowledgeSource } from '../knowledge';
export async function searchKnowledge(
	query: string,
	options: { campaignId?: string } = {},
	configOverride?: Record<string, string>,
	request: typeof fetch = fetch
): Promise<{ sources: KnowledgeSource[]; notice?: string }> {
	query = query.trim();
	if (!query || query.length > 2000)
		throw new Error('Search queries must contain 1–2,000 characters.');
	const config = configOverride || (await settings(true)),
		connection = embeddingConnection(config);
	const [count] =
		await sql`select count(*)::int as n from knowledge_documents where status='ready' and embedding_profile=${connection.profile}`;
	if (!count.n)
		return {
			sources: [],
			notice:
				'No ready documents match the configured embedding model. Upload or reindex documents in Knowledge base.'
		};
	const embedded = await embedTexts(
		[query],
		{ task: 'embedding_search', campaignId: options.campaignId },
		config,
		request
	);
	const vector = JSON.stringify(embedded.vectors[0]);
	const rows = await sql`
 with candidates as materialized (
  select c.*,d.title,d.filename from knowledge_chunks c join knowledge_documents d on d.id=c.document_id
  where d.status='ready' and c.embedding_profile=${connection.profile} and c.dimensions=${embedded.dimensions}
 ), semantic as (
  select id,row_number() over(order by embedding <=> ${vector}::vector) as rank from candidates
  where embedding <=> ${vector}::vector < 0.7 order by embedding <=> ${vector}::vector limit 30
 ), keywords as (
  select id,row_number() over(order by ts_rank_cd(search_text,websearch_to_tsquery('simple',${query})) desc) as rank from candidates
  where search_text @@ websearch_to_tsquery('simple',${query}) order by ts_rank_cd(search_text,websearch_to_tsquery('simple',${query})) desc limit 30
 ), ranked as (
  select coalesce(s.id,k.id) as id,coalesce(1.0/(60+s.rank),0)+coalesce(1.0/(60+k.rank),0) as score
  from semantic s full outer join keywords k on s.id=k.id
 )
 select c.id,c.document_id,c.title,c.filename,c.heading,c.content,c.revision from ranked r join candidates c on c.id=r.id order by r.score desc limit 6`;
	return {
		sources: rows.map((row) => ({
			id: row.id,
			documentId: row.document_id,
			title: row.title,
			filename: row.filename,
			heading: row.heading,
			content: row.content,
			revision: row.revision
		}))
	};
}
