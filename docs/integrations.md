# Integrations

Postscript connects to your own AI provider, AWS SES, and an optional image host. All credentials are stored encrypted in Postgres (see `SETTINGS_ENCRYPTION_KEY` in [Getting started](getting-started.md)).

## AI engine

Configure an OpenAI-compatible API base URL and token in Settings → AI engine, with separate drafting and translation model IDs (or the same model for both). Direct OpenAI connections use the Responses API with stateless reasoning-item replay; other providers use Chat Completions. Models must support JSON object responses. Conversations use company context and the current draft. Translation preserves Markdown links and image URLs. Without credentials the assistant shows setup instructions; it does not fabricate AI responses.

## AWS SES

Configure region, access key, secret key, and a verified sender. Send Now uses SES in production; development sends are simulated. A persistent worker must be running. “Sent” means accepted by SES, not confirmed delivery.

## Images

Without an ImageKit key, images are stored in local Postgres. With a private key, new uploads go to `/newsletter/images` in ImageKit. Both are served as bytes through `/media/:id` on this app, without redirects. Supported formats: PNG, JPEG, WebP, GIF; maximum 5 MB.

## Contacts API

Create a named bearer key in API keys. Create/bulk upsert up to 20,000 contacts with `POST /api/contacts`, look up by email with `GET /api/contacts?email=...`, and read/update/delete individual contacts by ID. Imports preserve prior unsubscribes. Keys are shown once, stored as hashes, and can be revoked individually. See the full [Contacts API](contacts-api.md) reference.

## Deployment note

For externally received email, use a public HTTPS deployment and set `APP_ORIGIN` accordingly. Images uploaded locally contain the local app URL and must not be used for live campaigns. No external emails are sent during automated checks.

## Validate service connections

Settings includes **Validate AI connection**, **Validate embeddings**, **Validate AWS SES**, and **Validate ImageKit**. They test the current form values without saving them; masked secrets use the stored credentials. Editing settings clears the displayed result. Requests run on the server with a timeout and do not return provider response bodies or credentials.

- OpenAI: authenticated model retrieval for the configured models ([API reference](https://developers.openai.com/api/reference/resources/models/methods/retrieve)). Checks authentication/model access without generating tokens; billing and inference permissions are not tested. Compatible providers must support model retrieval for this check.
- AWS SES: signed GetAccount in the configured region ([API reference](https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_GetAccount.html)). Reports sandbox or disabled sending. The key needs `ses:GetAccount`; sender verification and `ses:SendEmail` permissions are not tested, and no message is sent.
- ImageKit: authenticated file listing with limit 1 ([authentication reference](https://imagekit.io/docs/api-keys)). Checks private key/media library access without uploading; read-only keys can pass, so upload permission is not guaranteed.

`bun test tests/validate-service.test.ts` covers authentication headers, masked/blank keys, result handling and error redaction with mocked providers. `bun scripts/test-service-validation.ts` checks endpoint authentication and runs live read-only checks using saved local settings.
