# Campaign workflow

How a campaign moves from draft to delivery, plus how the workspace is organized.

## Try the workflow

1. Open a campaign, edit the subject and Markdown body, and save. Use `{{name}}` in the subject or body text for the recipient’s full name. For example, `Hi {{name}},` becomes `Hi Ana García,` when sent to Ana García. Contacts with an empty name receive an empty substitution.
2. Use the link and image controls to insert content. Preview shows sanitized HTML with a plain-text appearance.
3. Create a reusable audience on **Audiences** using plan, numeric usage or usage label, and last activity. Blank filters include all eligible contacts. Select a saved audience in the draft. The matching contacts determine the languages to review. Existing drafts require an explicit audience selection after upgrade.
4. Review & send prepares immutable language versions with signatures. Approve each language, then click **Send Now**. The development server records simulated deliveries without sending email; production builds queue real SES deliveries. The server selects the mode and ignores client mode overrides.
5. The worker processes the queue. Campaign reports open on an aggregate overview, with separate Recipients and Email preview tabs. Recipient details are fetched on demand in 50-row server-paginated pages with name/email search and status/language filters. The overview never downloads the full delivery list or per-recipient email bodies.
6. Contacts supports search, locale filters, upserts, and unsubscribe. Settings includes company context, AI, sender/signatures, AWS SES, ImageKit, and contacts API access.

To schedule a campaign for a future time instead of sending immediately, see [Scheduled sending](scheduling.md).

## Translations and approvals

Signatures currently support a default plus a Spanish override. Review & send opens a dedicated page with a locale sidebar. Missing translations start automatically (up to three at a time), with progress and per-language errors. Each ready preview must be approved before local or SES delivery. Previews and approvals persist across navigation and unchanged saves; changing the subject, body, or source language invalidates them. Audience changes reuse existing translations and generate only missing locales. Failed or interrupted translations can be retried individually; ready translations are never regenerated just by reopening review. Use Edit in a language preview to update its subject and body, then Save changes. Edits clear that language’s approval and survive reopening review. Changing the original email replaces these manual edits with new translations. Existing databases need `bun scripts/migrate-translation-approvals.ts` (also included in `db:migrate`); existing previews start unapproved. The database schema supports arbitrary locales. Contacts and email translations use the first two lowercase letters of each locale. For example, en-US and en-GB share one English preview. Run `bun run db:migrate` on upgrade to normalize existing contacts and drafts. Regional-only draft previews require a new language preview and approval. Scheduled and sent deliveries retain their original snapshots.

## Navigation

Workspace pages use SvelteKit filesystem routing. `/` redirects to `/campaigns`, which opens the latest campaign (or the empty state). Every campaign has `/campaigns/:id`; contacts uses `/contacts`; settings uses `/settings/context`, `/settings/ai`, `/settings/sender`, `/settings/delivery`, `/settings/images`, `/settings/api-keys`, and `/settings/api-docs`. The old `/settings/api` URL redirects to API keys. `/settings` redirects to company context. Direct links are authenticated and preserved through login. Navigation uses normal links with browser history and new-tab support. Unsaved draft or settings changes trigger a warning before leaving.

Run `bun scripts/test-navigation.ts` against the local server to verify route rendering, redirects, authentication, and unknown-route behavior.

## Campaign report scale check

`bun scripts/test-campaign-statistics.ts` seeds 20,001 isolated simulated deliveries, verifies pagination/filtering and bounded responses, then removes the test records. Requires the local dev server and database.
