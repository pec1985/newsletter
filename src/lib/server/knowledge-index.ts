import { sql } from './db';
import { digest } from './security';
import { settings } from './settings';
import { chunkMarkdown } from '../knowledge';
import { embedTexts, embeddingConnection } from './embeddings';
export async function indexNextDocument(
	configOverride?: Record<string, string>,
	request: typeof fetch = fetch,
	documentId?: string
) {
	// A timed-out worker is marked explicitly; retrying remains a user action to avoid surprise charges.
	await sql`update knowledge_documents set status='error',error='Indexing was interrupted. Retry to continue.',updated_at=now() where status='indexing' and heartbeat_at < now()-interval '10 minutes'`;
	const document = await sql.begin(async (tx) => {
		const [row] =
			await tx`select * from knowledge_documents where status='pending' and (${documentId ?? null}::uuid is null or id=${documentId ?? null}) order by created_at for update skip locked limit 1`;
		if (row)
			await tx`update knowledge_documents set status='indexing',heartbeat_at=now(),indexed_chunks=0,error=null where id=${row.id}`;
		return row;
	});
	if (!document) return false;
	try {
		const config = configOverride || (await settings(true)),
			connection = embeddingConnection(config);
		const chunks = chunkMarkdown(document.markdown);
		if (!chunks.length) throw new Error('This document contains no indexable text.');
		if (chunks.length > 10000)
			throw new Error(
				'Document exceeds the 10,000-section indexing limit. Split it into smaller files.'
			);
		await sql`update knowledge_documents set chunk_count=${chunks.length} where id=${document.id} and revision=${document.revision}`;
		const cached =
			await sql`select content_hash,embedding::text as vector,dimensions from knowledge_chunks where embedding_profile=${connection.profile}`;
		const cache = new Map(
			cached.map((row) => [
				row.content_hash,
				{ vector: row.vector as string, dimensions: row.dimensions as number }
			])
		);
		const prepared: {
			heading: string;
			content: string;
			hash: string;
			vector: string;
			dimensions: number;
		}[] = [];
		for (let i = 0; i < chunks.length; i += 8) {
			const [current] = await sql`select revision from knowledge_documents where id=${document.id}`;
			if (!current || current.revision !== document.revision) return true;
			const batch = chunks
				.slice(i, i + 8)
				.map((chunk) => ({ ...chunk, hash: digest(chunk.heading + '\n' + chunk.content) }));
			const missing = batch.filter((chunk) => !cache.has(chunk.hash));
			if (missing.length) {
				const embedded = await embedTexts(
					missing.map((chunk) => chunk.heading + '\n' + chunk.content),
					{ task: 'embedding_index', documentId: document.id },
					config,
					request
				);
				missing.forEach((chunk, index) =>
					cache.set(chunk.hash, {
						vector: JSON.stringify(embedded.vectors[index]),
						dimensions: embedded.dimensions
					})
				);
			}
			for (const chunk of batch) prepared.push({ ...chunk, ...cache.get(chunk.hash)! });
			await sql`update knowledge_documents set indexed_chunks=${prepared.length},heartbeat_at=now() where id=${document.id} and revision=${document.revision}`;
		}
		await sql.begin(async (tx) => {
			const [current] =
				await tx`select revision from knowledge_documents where id=${document.id} for update`;
			if (!current || current.revision !== document.revision) return;
			await tx`delete from knowledge_chunks where document_id=${document.id}`;
			for (let position = 0; position < prepared.length; position++) {
				const chunk = prepared[position];
				await tx`insert into knowledge_chunks(document_id,revision,position,heading,content,content_hash,embedding,dimensions,embedding_profile)
    values (${document.id},${document.revision},${position},${chunk.heading},${chunk.content},${chunk.hash},${chunk.vector}::vector,${chunk.dimensions},${connection.profile})`;
			}
			await tx`update knowledge_documents set status='ready',embedding_profile=${connection.profile},embedding_model=${connection.model},error=null,updated_at=now(),heartbeat_at=null where id=${document.id}`;
		});
	} catch (error) {
		await sql`update knowledge_documents set status='error',error=${error instanceof Error ? error.message : 'Indexing failed.'},updated_at=now() where id=${document.id} and revision=${document.revision}`;
	}
	return true;
}
