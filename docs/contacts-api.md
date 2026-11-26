# Contacts API

Manage contacts programmatically with a bearer-authenticated JSON API.

Create a named key in **Settings → API keys** and send `Authorization: Bearer YOUR_API_KEY` on every request. All responses are private (`Cache-Control: no-store`). Browser sessions also work, with a same-origin requirement for writes. API keys only authorize the contacts endpoints, not settings or campaigns.

| Method | Endpoint                                    | Behavior                                                                                                   |
| ------ | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| POST   | `/api/contacts`                             | Create or update one contact, or a JSON array of up to 20,000 contacts                                     |
| GET    | `/api/contacts?email=alex%40example.com`    | Exact lookup by normalized email; returns `{ "contact": ... }`, or 404                                     |
| GET    | `/api/contacts?limit=100&cursor=CONTACT_ID` | List contacts; returns `contacts` and `next_cursor` (null at the end). Default 100, maximum 1,000 per page |
| GET    | `/api/contacts/CONTACT_ID`                  | Get one contact by UUID                                                                                    |
| PATCH  | `/api/contacts/CONTACT_ID`                  | Update only the provided fields                                                                            |
| DELETE | `/api/contacts/CONTACT_ID`                  | Delete a contact; returns 204 with no body                                                                 |

## Create / bulk upsert

`Content-Type: application/json`:

```json
[
	{ "name": "Alex", "email": "alex@example.com", "locale": "en", "subscribed": true },
	{ "name": "María", "email": "maria@example.com", "locale": "es", "subscribed": false }
]
```

A single object is accepted too. Name, email and locale are required. Supply `subscribed` to carry the initial email preference from your platform. For compatibility, omitting it subscribes a **new** contact; existing unsubscribes are always preserved. The older `unsubscribed` field is still accepted as the inverse, but contradictory flags are rejected. Suppression is managed internally and cannot be overridden through this API.

Optional audience fields are `plan` (text), `usage` (a JSON number or a text label), and `last_used_at` (ISO timestamp with timezone). POST and PATCH preserve omitted fields and clear fields explicitly set to null. Send numeric zero for a known unused account. A missing value stays unknown.

Emails are trimmed and lowercased before matching the database's unique email constraint. Upserts update name and locale; `subscribed: false` opts out, while `subscribed: true` never reverses an existing opt-out. For duplicate emails in one request, the last name/locale wins and any opt-out is preserved. The response contains `ids` in input order (duplicates share an ID), `processed` (input row count), and `upserted` (unique email count).

Imports are synchronous, performed in batches of 1,000 inside one transaction. The entire payload is validated before writing: an invalid contact returns 400 with its 1-based input position and no contacts from the request are saved. Empty arrays and more than 20,000 rows are rejected. Requests are limited to 16 MB (413); configure the deployment/reverse-proxy body limit accordingly. There is no background job or progress polling. CSV files must be converted to the JSON shape above before submission.

## Lookup / permission check

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

Read responses include `id`, `name`, `email`, `locale`, `plan`, `usage`, `last_used_at`, `subscribed`, `suppressed`, `can_email`, `unsubscribed_at`, and `created_at`. `can_email` is true only when the contact is subscribed and not suppressed. It reflects stored contact permission, not sender/provider configuration or deliverability. This newsletter app is the source of truth for subscription status; a later import cannot silently undo a newsletter unsubscribe.

## Update

Send any subset of name, email, locale, subscribed, plan, usage, and last_used_at:

```http
PATCH /api/contacts/CONTACT_ID
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{ "locale": "es", "subscribed": false }
```

Omitted fields stay unchanged. An explicit `subscribed: true` update resubscribes the contact and clears the unsubscribe timestamp, but does not clear suppression. An email already used by another contact returns 409. Empty patches and invalid values return 400. Updates return `{ "contact": ... }`.

## Deletion

Removes the contact from future audiences while preserving historical campaign delivery snapshots and open events, including their existing recipient address/name. Pending delivery records are detached and skipped by the worker. If a delivery is already processing, deletion returns 409; retry once it finishes. This is contact-list deletion, not erasure of historical campaign records. Missing contacts return 404. Already queued emails retain their address and content snapshots after ordinary contact edits.

Integration regression (local development server required): `bun scripts/test-contacts-api.ts`. It uses isolated contacts, imports 20,000 records, exercises CRUD/authentication/consent/pagination/deletion, and cleans up its fixtures. The test creates and removes its own isolated key without changing existing keys.

## API key management and LLM documentation

**Settings → API keys** (`/settings/api-keys`) creates multiple named keys. Each key is shown in full only once, and only its SHA-256 hash and display prefix are stored. The key list shows creation, last-used, and revocation dates. Revoking a key blocks subsequent authenticated requests using that key; other keys remain active. Requests already in flight may finish. All keys currently grant full contacts CRUD access; they do not grant access to settings or key management.

Management routes require an authenticated browser session and same-origin writes: `GET /api/api-keys` lists safe metadata, `POST /api/api-keys` with `{ "name": "Platform sync" }` creates a key, and `DELETE /api/api-keys/{id}` revokes one. The old single-key rotation route returns 410. Run `bun run db:migrate` on existing installs: the previous key becomes **Existing API key**, retains the same token, and is removed from the settings blob. Migration is idempotent and does not reactivate revoked keys.

**Settings → API documentation** (`/settings/api-docs`) contains the expandable contacts endpoint examples. **Copy for LLM** copies a full Markdown reference with the current app origin, authentication, field definitions, import and consent rules, pagination, all request/response examples, and errors. The on-screen examples and Markdown use the same source in `src/lib/contacts-api-docs.ts`. No actual API keys or contact records are included. If clipboard access fails, the Markdown is shown for manual copying.

Key lifecycle regression: `bun scripts/test-api-keys.ts`. Markdown completeness regression: `bun test tests/contacts-api-docs.test.ts`.
