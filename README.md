# Postscript

For Docker builds and GHCR publishing, see [Container deployment](deploy/README.md).

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
4. Review & send prepares immutable language versions with signatures. Approve each language, then click **Send Now**. The development server records simulated deliveries without sending email; production builds queue real SES deliveries. The server selects the mode and ignores client mode overrides.
5. The worker processes the queue. Campaign reports open on an aggregate overview, with separate Recipients and Email preview tabs. Recipient details are fetched on demand in 50-row server-paginated pages with name/email search and status/language filters. The overview never downloads the full delivery list or per-recipient email bodies.
6. Contacts supports search, locale filters, upserts, and unsubscribe. Settings includes company context, AI, sender/signatures, AWS SES, ImageKit, and contacts API access.

## Integrations

- **AI engine:** Configure an OpenAI-compatible API base URL and token in Settings → AI engine, with separate drafting and translation model IDs (or the same model for both). Direct OpenAI connections use the Responses API with stateless reasoning-item replay; other providers use Chat Completions. Models must support JSON object responses. Conversations use company context and the current draft. Translation preserves Markdown links and image URLs. Without credentials the assistant shows setup instructions; it does not fabricate AI responses.
- **SES:** Configure region, access key, secret key, and a verified sender. Send Now uses SES in production; development sends are simulated. A persistent worker must be running. “Sent” means accepted by SES, not confirmed delivery.
- **Images:** Without an ImageKit key, images are stored in local Postgres. With a private key, uploads use ImageKit. Both are served as bytes through `/media/:id` on this app, without redirects. Supported formats: PNG, JPEG, WebP, GIF; maximum 5 MB.
- **Contacts API:** Create a named bearer key in API keys. Create/bulk upsert up to 20,000 contacts with `POST /api/contacts`, look up by email with `GET /api/contacts?email=...`, and read/update/delete individual contacts by ID. Imports preserve prior unsubscribes. See the Contacts API reference below. Keys are shown once, stored as hashes, and can be revoked individually.

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

This is a single-workspace MVP with container deployment support. Before broader production use, add SES event ingestion for delivery/bounces/complaints, production login hardening, sending rate limits, pagination for large contact lists, and recovery controls for interrupted jobs. A worker crash after submission can leave a delivery in `processing`; jobs are deliberately not automatically replayed because SES does not guarantee idempotent sends. Failed deliveries are visible but do not yet have a retry UI.

Recorded opens are image requests, not proof of a human read. Email clients may block or proxy images. Unsubscribe links require an explicit confirmation, so link scanners do not unsubscribe contacts on GET.

Signatures currently support a default plus a Spanish override. Review & send opens a dedicated page with a locale sidebar. Missing translations start automatically (up to three at a time), with progress and per-language errors. Each ready preview must be approved before local or SES delivery. Previews and approvals persist across navigation and unchanged saves; changing the subject, body, or source language invalidates them. Audience changes reuse existing translations and generate only missing locales. Failed or interrupted translations can be retried individually; ready translations are never regenerated just by reopening review. Use Edit in a language preview to update its subject and body, then Save changes. Edits clear that language’s approval and survive reopening review. Changing the original email replaces these manual edits with new translations. Existing databases need `rtk bun scripts/migrate-translation-approvals.ts` (also included in `db:migrate`); existing previews start unapproved. The database schema supports arbitrary locales. No credentials or local data are committed.

## AI spending

Configure input, cached-input, and output prices (USD per million tokens) separately for drafting and translation under AI engine. Each request snapshots its prices and records reported tokens against its campaign. The campaign heading opens the drafting/translation breakdown, available before and after sending. Cached input defaults to the ordinary input price; blank prices remain unknown, and explicit zero means free.

Usage is recorded even if generated content is invalid or a later translation fails. Changing settings does not reprice history. Costs are estimates, excluding taxes, email sending, and provider-specific billing adjustments. Missing usage, interrupted requests, and missing prices are explicitly marked unknown. Earlier conversations have no recoverable usage history. Deleting a draft preserves its accounting ledger with a detached campaign reference.

Existing databases: `rtk bun scripts/migrate-ai-usage.ts` adds the ledger without modifying existing campaigns or settings. New databases create it during `db:setup`.

## Navigation

Workspace pages use SvelteKit filesystem routing. `/` redirects to `/campaigns`, which opens the latest campaign (or the empty state). Every campaign has `/campaigns/:id`; contacts uses `/contacts`; settings uses `/settings/context`, `/settings/ai`, `/settings/sender`, `/settings/delivery`, `/settings/images`, `/settings/api-keys`, and `/settings/api-docs`. The old `/settings/api` URL redirects to API keys. `/settings` redirects to company context. Direct links are authenticated and preserved through login. Navigation uses normal links with browser history and new-tab support. Unsaved draft or settings changes trigger a warning before leaving.

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

Campaign report scale check: `rtk bun scripts/test-campaign-statistics.ts` seeds 20,001 isolated simulated deliveries, verifies pagination/filtering and bounded responses, then removes the test records. Requires the local dev server and database.

### Campaign dates and scheduled sending

Drafts have an optional **Deadline** button with a dropdown calendar and send time, entered in your browser’s timezone and stored as a UTC timestamp. Date-only edits preserve translations and approvals.

With a deadline set, approve every language and click **Schedule send** on the review page. Without it, **Send Now** sends immediately. A past send time must be changed or cleared before proceeding. Scheduling snapshots the approved emails and current recipients, locks editing, and shows a Scheduled status. **Cancel schedule & edit** returns it to a draft and removes the pending deliveries; approvals remain until the content changes.

Keep `bun run worker` running for automatic delivery. At or after the scheduled time it releases the campaign’s delivery queue; a stopped worker catches up when restarted. The worker still checks recipient subscription/suppression before each delivery. Development schedules remain local simulations even when processed later. Run `bun run db:migrate` before deploying the application and restart the worker with the updated code.

Scheduling regression: `bun scripts/test-campaign-schedule.ts` (local development server required).

### Validate service connections

Settings includes **Validate AI connection**, **Validate embeddings**, **Validate AWS SES**, and **Validate ImageKit**. They test the current form values without saving them; masked secrets use the stored credentials. Editing settings clears the displayed result. Requests run on the server with a timeout and do not return provider response bodies or credentials.

- OpenAI: authenticated model retrieval for the configured models ([API reference](https://developers.openai.com/api/reference/resources/models/methods/retrieve)). Checks authentication/model access without generating tokens; billing and inference permissions are not tested. Compatible providers must support model retrieval for this check.
- AWS SES: signed GetAccount in the configured region ([API reference](https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_GetAccount.html)). Reports sandbox or disabled sending. The key needs `ses:GetAccount`; sender verification and `ses:SendEmail` permissions are not tested, and no message is sent.
- ImageKit: authenticated file listing with limit 1 ([authentication reference](https://imagekit.io/docs/api-keys)). Checks private key/media library access without uploading; read-only keys can pass, so upload permission is not guaranteed.

`bun test tests/validate-service.test.ts` covers authentication headers, masked/blank keys, result handling and error redaction with mocked providers. `bun scripts/test-service-validation.ts` checks endpoint authentication and runs live read-only checks using saved local settings.

### Contacts API

Create a named key in **Settings → API keys** and send `Authorization: Bearer YOUR_API_KEY` on every request. All responses are private (`Cache-Control: no-store`). Browser sessions also work, with a same-origin requirement for writes. API keys only authorize the contacts endpoints, not settings or campaigns.

| Method | Endpoint                                    | Behavior                                                                                                   |
| ------ | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| POST   | `/api/contacts`                             | Create or update one contact, or a JSON array of up to 20,000 contacts                                     |
| GET    | `/api/contacts?email=alex%40example.com`    | Exact lookup by normalized email; returns `{ "contact": ... }`, or 404                                     |
| GET    | `/api/contacts?limit=100&cursor=CONTACT_ID` | List contacts; returns `contacts` and `next_cursor` (null at the end). Default 100, maximum 1,000 per page |
| GET    | `/api/contacts/CONTACT_ID`                  | Get one contact by UUID                                                                                    |
| PATCH  | `/api/contacts/CONTACT_ID`                  | Update only the provided fields                                                                            |
| DELETE | `/api/contacts/CONTACT_ID`                  | Delete a contact; returns 204 with no body                                                                 |

**Create / bulk upsert** — `Content-Type: application/json`:

```json
[
	{ "name": "Alex", "email": "alex@example.com", "locale": "en", "subscribed": true },
	{ "name": "María", "email": "maria@example.com", "locale": "es", "subscribed": false }
]
```

A single object is accepted too. Name, email and locale are required. Supply `subscribed` to carry the initial email preference from your platform. For compatibility, omitting it subscribes a **new** contact; existing unsubscribes are always preserved. The older `unsubscribed` field is still accepted as the inverse, but contradictory flags are rejected. Suppression is managed internally and cannot be overridden through this API.

Emails are trimmed and lowercased before matching the database's unique email constraint. Upserts update name and locale; `subscribed: false` opts out, while `subscribed: true` never reverses an existing opt-out. For duplicate emails in one request, the last name/locale wins and any opt-out is preserved. The response contains `ids` in input order (duplicates share an ID), `processed` (input row count), and `upserted` (unique email count).

Imports are synchronous, performed in batches of 1,000 inside one transaction. The entire payload is validated before writing: an invalid contact returns 400 with its 1-based input position and no contacts from the request are saved. Empty arrays and more than 20,000 rows are rejected. Requests are limited to 16 MB (413); configure the deployment/reverse-proxy body limit accordingly. There is no background job or progress polling. CSV files must be converted to the JSON shape above before submission.

**Lookup / permission check:**

```javascript
const response = await fetch(`${baseUrl}/api/contacts?email=${encodeURIComponent(email)}`, {
	headers: { Authorization: `Bearer ${apiKey}` }
});
if (response.status === 404) {
	// Contact is unknown; do not treat this as permission to email.
} else if (!response.ok) {
	throw new Error(`Contact lookup failed: ${response.status}`);
} else {
	const { contact } = await response.json();
	const canEmail = contact.can_email;
}
```

Read responses include `id`, `name`, `email`, `locale`, `subscribed`, `suppressed`, `can_email`, `unsubscribed_at`, and `created_at`. `can_email` is true only when the contact is subscribed and not suppressed. It reflects stored contact permission, not sender/provider configuration or deliverability. This newsletter app is the source of truth for subscription status; a later import cannot silently undo a newsletter unsubscribe.

**Update** — send any subset of name, email, locale, and subscribed:

```http
PATCH /api/contacts/CONTACT_ID
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{ "locale": "es", "subscribed": false }
```

Omitted fields stay unchanged. An explicit `subscribed: true` update resubscribes the contact and clears the unsubscribe timestamp, but does not clear suppression. An email already used by another contact returns 409. Empty patches and invalid values return 400. Updates return `{ "contact": ... }`.

**Deletion:** removes the contact from future audiences while preserving historical campaign delivery snapshots and open events, including their existing recipient address/name. Pending delivery records are detached and skipped by the worker. If a delivery is already processing, deletion returns 409; retry once it finishes. This is contact-list deletion, not erasure of historical campaign records. Missing contacts return 404. Already queued emails retain their address and content snapshots after ordinary contact edits.

Integration regression (local development server required): `bun scripts/test-contacts-api.ts`. It uses isolated contacts, imports 20,000 records, exercises CRUD/authentication/consent/pagination/deletion, and cleans up its fixtures. The test creates and removes its own isolated key without changing existing keys.

### API key management and LLM documentation

**Settings → API keys** (`/settings/api-keys`) creates multiple named keys. Each key is shown in full only once, and only its SHA-256 hash and display prefix are stored. The key list shows creation, last-used, and revocation dates. Revoking a key blocks subsequent authenticated requests using that key; other keys remain active. Requests already in flight may finish. All keys currently grant full contacts CRUD access; they do not grant access to settings or key management.

Management routes require an authenticated browser session and same-origin writes: `GET /api/api-keys` lists safe metadata, `POST /api/api-keys` with `{ "name": "Platform sync" }` creates a key, and `DELETE /api/api-keys/{id}` revokes one. The old single-key rotation route returns 410. Run `bun run db:migrate` on existing installs: the previous key becomes **Existing API key**, retains the same token, and is removed from the settings blob. Migration is idempotent and does not reactivate revoked keys.

**Settings → API documentation** (`/settings/api-docs`) contains the expandable contacts endpoint examples. **Copy for LLM** copies a full Markdown reference with the current app origin, authentication, field definitions, import and consent rules, pagination, all request/response examples, and errors. The on-screen examples and Markdown use the same source in `src/lib/contacts-api-docs.ts`. No actual API keys or contact records are included. If clipboard access fails, the Markdown is shown for manual copying.

Key lifecycle regression: `bun scripts/test-api-keys.ts`. Markdown completeness regression: `bun test tests/contacts-api-docs.test.ts`.
