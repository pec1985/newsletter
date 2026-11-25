# Company instructions and knowledge base

Ground the drafting model in your own company context and documents.

## Company instructions

`/settings/context` contains the company description, tone, audience, writing rules, and terminology. These fields are included in every drafting request; each has a 20,000-character limit. Existing company context is preserved.

## Knowledge base

`/settings/knowledge` accepts Markdown/text files up to 10 MB. Uploads enter a persistent queue and are split by Markdown headings into bounded overlapping passages. A separate worker embeds these passages and saves them in Postgres using pgvector. No email worker is needed:

```bash
bun run knowledge:worker
```

Configure an embedding model in AI engine. Optional embedding URL/token fields fall back to the AI connection. Set the input price per million tokens for accounting. Changing model or endpoint requires explicitly reindexing documents; the UI marks mismatched documents as needing reindexing. Search never mixes embedding profiles or vector dimensions.

## Retrieval and drafting

Search combines cosine similarity and Postgres full-text results using reciprocal rank fusion. It currently performs exact vector search, appropriate for a small company knowledge base; large collections will need ANN indexes and pagination. Up to six passages are returned per search. The drafting model can call `search_knowledge` up to three times in a turn, with a maximum of four model calls. It must support function/tool calls and JSON output on the selected API. Retrieved text is clearly labeled as untrusted reference data, separate from instructions. Source excerpts, headings, filenames, and revisions are saved with the assistant reply and remain visible after document replacement or deletion.

## Indexing

Indexing swaps in a complete new set of chunks atomically. Pending/error documents are excluded from searches. Reindexing reuses unchanged passages from the same embedding profile. Replacing or deleting a currently indexing document is blocked. Interrupted jobs are marked failed after ten minutes; retry explicitly from the UI. A failed indexing attempt can incur costs, and work not yet committed may be repeated on retry. The original Markdown remains in the database so it can be reindexed.

Indexing spend is shown separately on Knowledge base. Query embeddings used by the agent are attributed to the campaign as Knowledge search; subsequent drafting calls include the retrieved text in their reported input usage. Search-preview requests also have ledger entries, without a campaign association.

## Migration and verification

On an existing install, rebuild the database image (`docker compose up -d --build --wait`), then run `bun run db:migrate`. The migration preserves existing data. The custom database image adds pgvector to the same Postgres 17 Alpine base; the volume is retained.

Verification: `bun test`, `bun scripts/test-knowledge.ts`, `bun scripts/test-ai-spending.ts`, and `bun scripts/test-navigation.ts`. Run the knowledge integration test with the knowledge worker stopped; it uses a fake provider, exercises real pgvector queries and the tool-call loop, and removes its own test data. It does not spend provider credits or send email. Production adapters may need their request-body limit raised to accept 10 MB uploads.
