# AI spending

Per-campaign token accounting for drafting and translation.

Configure input, cached-input, and output prices (USD per million tokens) separately for drafting and translation under AI engine. Each request snapshots its prices and records reported tokens against its campaign. The campaign heading opens the drafting/translation breakdown, available before and after sending. Cached input defaults to the ordinary input price; blank prices remain unknown, and explicit zero means free.

Usage is recorded even if generated content is invalid or a later translation fails. Changing settings does not reprice history. Costs are estimates, excluding taxes, email sending, and provider-specific billing adjustments. Missing usage, interrupted requests, and missing prices are explicitly marked unknown. Earlier conversations have no recoverable usage history. Deleting a draft preserves its accounting ledger with a detached campaign reference.

Existing databases: `bun scripts/migrate-ai-usage.ts` adds the ledger without modifying existing campaigns or settings. New databases create it during `db:setup`.
