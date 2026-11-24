const id = '8cf9b24a-558c-41ba-86e8-e404749392e2';
const secondId = 'e24ea578-6740-4d59-9381-dd99c6125c17';
const input = { name: 'Alex', email: 'alex@example.com', locale: 'en', subscribed: true };
const contact = {
	id,
	...input,
	suppressed: false,
	can_email: true,
	unsubscribed_at: null,
	created_at: '2026-11-24T09:00:00.000Z'
};
const pretty = (value: unknown) => JSON.stringify(value, null, 2);
function request(method: string, path: string, body?: unknown) {
	return `${method} ${path}\nAuthorization: Bearer YOUR_API_KEY${body === undefined ? '' : `\nContent-Type: application/json\n\n${pretty(body)}`}`;
}
export const endpoints = [
	{
		method: 'POST',
		path: '/api/contacts',
		title: 'Create or import contacts',
		note: 'Send one object or a JSON array of up to 20,000 contacts (16 MB maximum). Name, email and locale are required. Set subscribed to include the initial email preference. Existing unsubscribes are preserved; matching emails update name and locale.',
		examples: [
			{
				title: 'Single contact',
				request: request('POST', '/api/contacts', input),
				response: pretty({ ids: [id], processed: 1, upserted: 1 })
			},
			{
				title: 'Bulk import',
				request: request('POST', '/api/contacts', [
					input,
					{ name: 'María', email: 'maria@example.com', locale: 'es', subscribed: false }
				]),
				response: pretty({ ids: [id, secondId], processed: 2, upserted: 2 })
			}
		],
		status: '200 OK',
		errors:
			'400: invalid contact or more than 20,000 rows. 413: request exceeds 16 MB. 415: use application/json. Invalid imports save no contacts. IDs follow input order; upserted counts unique emails.'
	},
	{
		method: 'GET',
		path: '/api/contacts?email=…',
		title: 'Look up by email',
		note: 'Pass the email as a URL-encoded query parameter. No request body. can_email is true only when the contact is subscribed and not suppressed.',
		examples: [
			{
				title: 'Check email permission',
				request: request('GET', '/api/contacts?email=alex%40example.com'),
				response: pretty({ contact })
			}
		],
		status: '200 OK',
		errors:
			'404: contact not found. 400: invalid email. An unknown contact is not permission to send email.'
	},
	{
		method: 'GET',
		path: '/api/contacts?limit=100',
		title: 'List contacts',
		note: 'limit is optional (default 100, maximum 1,000). Pass next_cursor as cursor to get the next page. A null next_cursor means there are no more results. No request body.',
		examples: [
			{
				title: 'First page',
				request: request('GET', '/api/contacts?limit=100'),
				response: pretty({ contacts: [contact], next_cursor: null })
			},
			{
				title: 'Following page',
				request: request('GET', `/api/contacts?limit=100&cursor=${id}`),
				response: pretty({ contacts: [], next_cursor: null })
			}
		],
		status: '200 OK',
		errors: '400: invalid limit or cursor. Pages are ordered by contact ID.'
	},
	{
		method: 'GET',
		path: '/api/contacts/{id}',
		title: 'Get a contact',
		note: 'Replace {id} with the contact ID returned by an import or lookup. No request body.',
		examples: [
			{
				title: 'Read one contact',
				request: request('GET', `/api/contacts/${id}`),
				response: pretty({ contact })
			}
		],
		status: '200 OK',
		errors: '404: contact not found. 400: invalid contact ID.'
	},
	{
		method: 'PATCH',
		path: '/api/contacts/{id}',
		title: 'Update a contact',
		note: 'Send any subset of name, email, locale and subscribed. Omitted fields stay unchanged. Explicitly setting subscribed to true resubscribes a contact, but never clears suppression.',
		examples: [
			{
				title: 'Change locale and unsubscribe',
				request: request('PATCH', `/api/contacts/${id}`, { locale: 'es', subscribed: false }),
				response: pretty({
					contact: {
						...contact,
						locale: 'es',
						subscribed: false,
						can_email: false,
						unsubscribed_at: '2026-11-24T10:00:00.000Z'
					}
				})
			}
		],
		status: '200 OK',
		errors:
			'400: invalid values or empty update. 404: contact not found. 409: another contact already uses this email.'
	},
	{
		method: 'DELETE',
		path: '/api/contacts/{id}',
		title: 'Delete a contact',
		note: 'Removes the contact from future audiences. Historical campaign records are retained. Pending deliveries are skipped. No request body.',
		examples: [
			{
				title: 'Remove one contact',
				request: request('DELETE', `/api/contacts/${id}`),
				response: 'No response body.'
			}
		],
		status: '204 No Content',
		errors:
			'404: contact not found. 409: a delivery is already processing; retry after it finishes.'
	}
];

export function contactsApiMarkdown(baseUrl = 'https://YOUR_APP_HOST'): string {
	const intro = `# Contacts API

## Base URL and authentication

Base URL: ${baseUrl}

Create a named key in Settings → API keys. Send it as the Authorization header on every request:

\`\`\`http
Authorization: Bearer YOUR_API_KEY
\`\`\`

Replace YOUR_API_KEY with your secret key; never expose it in client-side code. Keys grant access to the contacts endpoints only, not settings or key management. Multiple keys can be active. Keys are displayed once when created; revoke individual keys in Settings → API keys. Revoked or invalid keys return 401. Examples below use relative request paths; prepend the base URL when calling the API.

## Contact fields

| Field | Type | Meaning |
| --- | --- | --- |
| id | UUID string | Generated contact identifier, returned by imports and lookups |
| name | string, up to 200 characters | Required on create; optional on PATCH |
| email | string, up to 254 characters | Required on create; trimmed and lowercased; unique in the database |
| locale | string, up to 40 characters | Required on create; language code such as en, es, or en-US |
| subscribed | boolean | Email preference; optional on create; defaults to true for new contacts |
| suppressed | boolean, read-only | Internal sending block; cannot be changed through this API |
| can_email | boolean, read-only | True only if subscribed and not suppressed |
| unsubscribed_at | ISO timestamp or null | When the contact unsubscribed |
| created_at | ISO timestamp | When the contact was created |

## Import and subscription rules

- POST accepts one JSON object or a JSON array containing 1–20,000 contacts, with a maximum body size of 16 MB. Use Content-Type: application/json. CSV is not accepted directly; convert rows to JSON first.
- Imports run synchronously in batches inside one transaction. The response means the import has finished; no progress polling or background job is needed.
- All rows are validated before writing. An invalid row returns 400 with its 1-based position; no rows from that request are saved.
- Normalized email is the upsert identifier. Matching emails update name and locale instead of creating duplicates.
- For duplicate emails within a request, the last name and locale win; any opt-out is preserved. Response ids follow input order, so duplicates share an ID. processed counts input rows; upserted counts unique emails (created or updated).
- This newsletter app is the source of truth for subscription status. Import subscribed: false to opt out. An import with subscribed: true never reverses an existing unsubscribe.
- For compatibility, unsubscribed is accepted as the inverse of subscribed. If both are present, they must agree (subscribed: true and unsubscribed: false, or vice versa).
- PATCH changes only supplied fields. Explicit subscribed: true resubscribes and clears unsubscribed_at; it never clears suppression. An empty patch is invalid.
- can_email describes stored contact permission, not sender setup or guaranteed deliverability. A 404 lookup is not permission to send.
- Deletion removes a contact from future audiences but retains historical delivery snapshots (including recipient address/name) and open events. Queued deliveries are detached and skipped. An already-processing delivery returns 409; retry deletion after it finishes. Ordinary contact edits do not rewrite already-queued email snapshots.

## Pagination and errors

List contacts with limit (default 100, maximum 1,000) and optional cursor (a contact UUID). Results are ordered by ID. Pass next_cursor as cursor to retrieve the next page; null means the end.

Responses use Cache-Control: no-store. Errors return JSON, for example:

\`\`\`json
{ "message": "Contact not found." }
\`\`\`

Common statuses: 400 invalid input, 401 missing/invalid/revoked key, 403 invalid origin for session-authenticated writes, 404 contact not found, 409 email conflict or deletion during processing, 413 body too large, 415 unsupported content type. The API also supports signed-in browser sessions; writes using sessions must have a matching Origin header.

## Endpoints
`;
	return (
		intro +
		endpoints
			.map(
				(endpoint) => `
### ${endpoint.method} ${endpoint.path} — ${endpoint.title}

${endpoint.note}

${endpoint.examples
	.map(
		(example) => `#### ${example.title}

Request:

\`\`\`http
${example.request}
\`\`\`

Response: **${endpoint.status}**

${endpoint.status.startsWith('204') ? 'No response body.\n' : `\`\`\`json\n${example.response}\n\`\`\`\n`}`
	)
	.join('\n')}
${endpoint.errors}
`
			)
			.join('\n')
	);
}
