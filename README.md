# Postscript

A local-first draft of an AI-assisted newsletter workspace, built with SvelteKit, TypeScript, Tailwind, Bun, and Postgres.

## Local development

```bash
rtk bun install
rtk docker compose up -d --build --wait
```

Copy `.env.example` to `.env`. Set `SETTINGS_ENCRYPTION_KEY` to a random 32-byte hex key (generate with `rtk openssl rand -hex 32`). Keep the key stable: it encrypts integration credentials stored in Postgres. The local `.env` has already been prepared in this checkout.

```bash
rtk bun run db:setup
rtk bun run dev -- --host 127.0.0.1
```

In a second terminal:

```bash
rtk bun run worker
```

Open http://127.0.0.1:5173 and sign in with **admin / admin**. The setup script is idempotent and creates two example drafts and six contacts at example.com. These credentials and the seed script are for local testing only.

Postgres runs on localhost port **55450**, with a persistent Docker volume. The app uses port **5173**. Stopping the container preserves the database.

## Try the workflow

1. Open a campaign, edit the subject and Markdown body, and save.
2. Use the link and image controls to insert content. Preview shows sanitized HTML with a plain-text appearance.
3. Choose audience locales. Without an AI key, select only the draft's source language to test sending. Additional locales require translation using the configured AI key.
4. Review & send prepares immutable language versions with signatures. Choose **Local test** to record deliveries without sending email.
5. The worker processes the queue. Sent campaigns show individual deliveries and recorded opens. **Test open** loads the actual tracking pixel for a local delivery.
6. Contacts supports search, locale filters, upserts, and unsubscribe. Settings includes company context, AI, sender/signatures, AWS SES, ImageKit, and contacts API access.

## Integrations

- **AI engine:** Configure an OpenAI-compatible API base URL and token in Settings → AI engine, with separate drafting and translation model IDs (or the same model for both). Direct OpenAI connections use the Responses API with stateless reasoning-item replay; other providers use Chat Completions. Models must support JSON object responses. Conversations use company context and the current draft. Translation preserves Markdown links and image URLs. Without credentials the assistant shows setup instructions; it does not fabricate AI responses.
- **SES:** Configure region, access key, secret key, and a verified sender. Sending through SES is an explicit review-dialog choice. A persistent worker must be running. “Sent” means accepted by SES, not confirmed delivery.
- **Images:** Without an ImageKit key, images are stored in local Postgres. With a private key, uploads use ImageKit. Both are served as bytes through `/media/:id` on this app, without redirects. Supported formats: PNG, JPEG, WebP, GIF; maximum 5 MB.
- **Contact imports:** Generate a bearer key in API access. `POST /api/contacts` accepts a contact or up to 1,000 contacts with `name`, `email`, `locale`, and optional boolean `unsubscribed`. Imports preserve prior unsubscribes. Keys are shown once, stored encrypted, and can be rotated.

For externally received email, use a public HTTPS deployment and set `APP_ORIGIN` accordingly. Images uploaded locally contain the local app URL and must not be used for live campaigns. No external emails are sent during automated checks.

## Verification

```bash
rtk bun run format
rtk bun run check
rtk bun test
rtk bun scripts/smoke.ts
rtk bun run build
```

The smoke test requires the dev server, database, worker, and local test account. It creates isolated test records and removes them afterward. Run it before adding an ImageKit key, since otherwise its upload would use ImageKit.

## First-draft boundaries

This is a single-workspace development app, not a production deployment. Before production, add SES event ingestion for delivery/bounces/complaints, production login hardening, sending rate limits, pagination for large audiences, and recovery controls for interrupted jobs. A worker crash after submission can leave a delivery in `processing`; jobs are deliberately not automatically replayed because SES does not guarantee idempotent sends. Failed deliveries are visible but do not yet have a retry UI.

Recorded opens are image requests, not proof of a human read. Email clients may block or proxy images. Unsubscribe links require an explicit confirmation, so link scanners do not unsubscribe contacts on GET.

Signatures currently support a default plus a Spanish override. Prepared translations can be reviewed; to revise one, edit the source and regenerate. The database schema supports arbitrary locales. No credentials or local data are committed.

## AI spending

Configure input, cached-input, and output prices (USD per million tokens) separately for drafting and translation under AI engine. Each request snapshots its prices and records reported tokens against its campaign. The campaign heading opens the drafting/translation breakdown, available before and after sending. Cached input defaults to the ordinary input price; blank prices remain unknown, and explicit zero means free.

Usage is recorded even if generated content is invalid or a later translation fails. Changing settings does not reprice history. Costs are estimates, excluding taxes, email sending, and provider-specific billing adjustments. Missing usage, interrupted requests, and missing prices are explicitly marked unknown. Earlier conversations have no recoverable usage history. Deleting a draft preserves its accounting ledger with a detached campaign reference.

Existing databases: `rtk bun scripts/migrate-ai-usage.ts` adds the ledger without modifying existing campaigns or settings. New databases create it during `db:setup`.

## Navigation

Workspace pages use SvelteKit filesystem routing. `/` redirects to `/campaigns`, which opens the latest campaign (or the empty state). Every campaign has `/campaigns/:id`; contacts uses `/contacts`; settings uses `/settings/context`, `/settings/ai`, `/settings/sender`, `/settings/delivery`, `/settings/images`, and `/settings/api`. `/settings` redirects to company context. Direct links are authenticated and preserved through login. Navigation uses normal links with browser history and new-tab support. Unsaved draft or settings changes trigger a warning before leaving.

Run `rtk bun scripts/test-navigation.ts` against the local server to verify route rendering, redirects, authentication, and unknown-route behavior.

## Company instructions and knowledge base

`/settings/context` contains the company description, tone, audience, writing rules, and terminology. These fields are included in every drafting request; each has a 20,000-character limit. Existing company context is preserved.

`/settings/knowledge` accepts Markdown/text files up to 10 MB. Uploads enter a persistent queue and are split by Markdown headings into bounded overlapping passages. A separate worker embeds these passages and saves them in Postgres using pgvector. No email worker is needed:

```bash
rtk bun run knowledge:worker
```

Configure an embedding model in AI engine. Optional embedding URL/token fields fall back to the AI connection. Set the input price per million tokens for accounting. Changing model or endpoint requires explicitly reindexing documents; the UI marks mismatched documents as needing reindexing. Search never mixes embedding profiles or vector dimensions.

Search combines cosine similarity and Postgres full-text results using reciprocal rank fusion. It currently performs exact vector search, appropriate for a small company knowledge base; large collections will need ANN indexes and pagination. Up to six passages are returned per search. The drafting model can call `search_knowledge` up to three times in a turn, with a maximum of four model calls. It must support function/tool calls and JSON output on the selected API. Retrieved text is clearly labeled as untrusted reference data, separate from instructions. Source excerpts, headings, filenames, and revisions are saved with the assistant reply and remain visible after document replacement or deletion.

Indexing swaps in a complete new set of chunks atomically. Pending/error documents are excluded from searches. Reindexing reuses unchanged passages from the same embedding profile. Replacing or deleting a currently indexing document is blocked. Interrupted jobs are marked failed after ten minutes; retry explicitly from the UI. A failed indexing attempt can incur costs, and work not yet committed may be repeated on retry. The original Markdown remains in the database so it can be reindexed.

Indexing spend is shown separately on Knowledge base. Query embeddings used by the agent are attributed to the campaign as Knowledge search; subsequent drafting calls include the retrieved text in their reported input usage. Search-preview requests also have ledger entries, without a campaign association.

For an existing checkout, build/recreate the database image using the command above, then run `rtk bun run db:migrate`. The migration preserves existing data. A local pre-migration backup was saved under ignored `.local-backups/` in this checkout. The custom database image adds pgvector to the same Postgres 17 Alpine base; the volume is retained.

Verification: `rtk bun test`, `rtk bun scripts/test-knowledge.ts`, `rtk bun scripts/test-ai-spending.ts`, and `rtk bun scripts/test-navigation.ts`. Run the knowledge integration test with the knowledge worker stopped; it uses a fake provider, exercises real pgvector queries and the tool-call loop, and removes its own test data. It does not spend provider credits or send email. Production adapters may need their request-body limit raised to accept 10 MB uploads.
