import assert from 'node:assert/strict';
import { sql } from '../src/lib/server/db';
import { digest, encrypt, token } from '../src/lib/server/security';
import { migrateApiKeys } from '../src/lib/server/api-key-schema';
const origin = 'http://127.0.0.1:5173';
let cookie = '';
const fixtureIds: string[] = [];
let legacyHash = '';
async function api(
	path: string,
	method = 'GET',
	body?: unknown,
	expected = 200,
	session = true,
	bearer = '',
	requestOrigin = origin
) {
	const response = await fetch(origin + '/api/' + path, {
		method,
		headers: {
			Origin: requestOrigin,
			...(session ? { Cookie: cookie } : {}),
			...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
			...(body === undefined ? {} : { 'Content-Type': 'application/json' })
		},
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	const text = await response.text();
	assert.equal(
		response.status,
		expected,
		`Expected ${expected} from ${path}; got ${response.status}`
	);
	assert.equal(
		response.headers.get('cache-control'),
		response.ok ? 'no-store' : response.headers.get('cache-control')
	);
	return text ? JSON.parse(text) : null;
}
try {
	const login = await fetch(origin + '/login', {
		method: 'POST',
		headers: {
			Origin: origin,
			Accept: 'text/html',
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: 'username=admin&password=admin',
		redirect: 'manual'
	});
	assert.equal(login.status, 303);
	cookie = login.headers.get('set-cookie')!.split(';')[0];
	await api('api-keys', 'GET', undefined, 401, false);
	await api('api-keys', 'POST', { name: 'Unauthorized' }, 401, false);
	await api('api-keys', 'POST', { name: 'Wrong origin' }, 403, true, '', 'https://invalid.example');
	await api('api-keys', 'POST', { name: '   ' }, 400);
	await api('api-keys', 'POST', { name: 'a'.repeat(101) }, 400);
	const first = await api('api-keys', 'POST', { name: 'Test platform sync' }, 201);
	fixtureIds.push(first.apiKey.id);
	const second = await api('api-keys', 'POST', { name: 'Test integration two' }, 201);
	fixtureIds.push(second.apiKey.id);
	assert.notEqual(first.key, second.key);
	assert.equal(first.apiKey.name, 'Test platform sync');
	assert.ok(first.key.startsWith('nl_'));
	const stored = (await sql`select * from api_keys where id=${first.apiKey.id}`)[0];
	assert.equal(stored.key_hash, digest(first.key));
	assert.notEqual(stored.key_hash, first.key);
	const list = await api('api-keys');
	assert.ok(list.keys.some((k: { id: string }) => k.id === first.apiKey.id));
	assert.ok(!JSON.stringify(list).includes(first.key));
	assert.ok(!JSON.stringify(list).includes(stored.key_hash));
	await api('contacts?limit=1', 'GET', undefined, 200, false, first.key);
	await api('contacts?limit=1', 'GET', undefined, 200, false, second.key);
	assert.ok(
		(await sql`select last_used_at from api_keys where id=${first.apiKey.id}`)[0].last_used_at
	);
	// Contacts bearer keys must never be able to create/list/revoke integration keys.
	await api('api-keys', 'GET', undefined, 401, false, first.key);
	await api('api-keys', 'POST', { name: 'Unauthorized' }, 401, false, first.key);
	await api(`api-keys/${second.apiKey.id}`, 'DELETE', undefined, 401, false, first.key);
	await api(
		`api-keys/${first.apiKey.id}`,
		'DELETE',
		undefined,
		403,
		true,
		'',
		'https://invalid.example'
	);
	await api(`api-keys/${first.apiKey.id}`, 'DELETE', undefined, 204);
	await api('contacts?limit=1', 'GET', undefined, 401, false, first.key);
	await api('contacts?limit=1', 'GET', undefined, 200, false, second.key);
	await api(`api-keys/${first.apiKey.id}`, 'DELETE', undefined, 204);
	assert.ok(
		(await api('api-keys')).keys.find((k: { id: string }) => k.id === first.apiKey.id).revoked_at
	);
	await api('api-key', 'POST', {}, 410);
	// Migration preserves legacy values and reruns cannot resurrect a revoked key.
	const legacy = token();
	legacyHash = digest(legacy);
	const [before] = await sql`select value->>'contactsApiKey' as key from settings where id=1`;
	assert.ok(!before.key, 'Unexpected legacy setting remains; run the migration first.');
	await sql`update settings set value=jsonb_set(value,'{contactsApiKey}',to_jsonb(${encrypt(legacy)}::text)) where id=1`;
	await migrateApiKeys();
	const [migrated] = await sql`select id,name from api_keys where key_hash=${legacyHash}`;
	fixtureIds.push(migrated.id);
	assert.equal(migrated.name, 'Existing API key');
	await api('contacts?limit=1', 'GET', undefined, 200, false, legacy);
	assert.equal(
		(await sql`select value ? 'contactsApiKey' as has_key from settings where id=1`)[0].has_key,
		false
	);
	await api(`api-keys/${migrated.id}`, 'DELETE', undefined, 204);
	await migrateApiKeys();
	await api('contacts?limit=1', 'GET', undefined, 401, false, legacy);
	console.log(
		'PASS: multiple named keys, one-time secrets, hashed storage, independent revocation, management authorization, last use, legacy migration and revocation persistence.'
	);
} finally {
	if (fixtureIds.length) await sql`delete from api_keys where id=any(${fixtureIds})`;
	if (legacyHash) await sql`delete from api_keys where key_hash=${legacyHash}`;
	if (cookie)
		await fetch(origin + '/logout', {
			method: 'POST',
			headers: { Origin: origin, Cookie: cookie },
			redirect: 'manual'
		});
	await sql.end();
}
