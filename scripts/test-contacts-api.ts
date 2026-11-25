import assert from 'node:assert/strict';
import { sql } from '../src/lib/server/db';
import { digest, token } from '../src/lib/server/security';
const origin = process.env.SMOKE_ORIGIN || 'http://127.0.0.1:5173';
const suffix = `crud-${token().slice(0, 12)}.example.invalid`;
let cookie = '';
let key = '';
let temporaryKey = '';
let campaignId = '';
let extraId = '';
async function call(
	path: string,
	method = 'GET',
	body?: unknown,
	expected = 200,
	authentication: 'bearer' | 'session' | 'none' | 'invalid' = 'bearer',
	requestOrigin: string | null = origin
) {
	const response = await fetch(origin + '/api/contacts' + path, {
		method,
		headers: {
			...(requestOrigin === null ? {} : { Origin: requestOrigin }),
			...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
			...(authentication === 'bearer'
				? { Authorization: `Bearer ${key}` }
				: authentication === 'session'
					? { Cookie: cookie }
					: authentication === 'invalid'
						? { Authorization: 'Bearer invalid' }
						: {})
		},
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	const data = response.status === 204 ? null : await response.json();
	assert.equal(response.status, expected, JSON.stringify(data));
	if (response.ok) assert.equal(response.headers.get('cache-control'), 'no-store');
	return data;
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
	key = token();
	temporaryKey = (
		await sql`insert into api_keys(name,key_hash,prefix) values('CRUD test',${digest(key)},${key.slice(0, 12)}) returning id`
	)[0].id;
	const draft = { name: 'Contact test', email: `alex@${suffix}`, locale: 'en', subscribed: false };
	await call('', 'GET', undefined, 401, 'none');
	await call('', 'POST', draft, 401, 'invalid');
	await call('', 'POST', draft, 403, 'session', 'https://invalid.example');
	for (const method of ['GET', 'PATCH', 'DELETE'])
		await call(
			'/00000000-0000-0000-0000-000000000000',
			method,
			method === 'PATCH' ? { name: 'No' } : undefined,
			401,
			'none'
		);
	const created = await call('', 'POST', draft);
	const id = created.ids[0];
	assert.equal(created.upserted, 1);
	let lookup = await call('?email=' + encodeURIComponent(` ALEX@${suffix.toUpperCase()} `));
	assert.equal(lookup.contact.id, id);
	assert.equal(lookup.contact.subscribed, false);
	assert.equal(lookup.contact.can_email, false);
	const duplicate = await call('', 'POST', { ...draft, name: 'Updated name', subscribed: true });
	assert.equal(duplicate.ids[0], id);
	lookup = await call('/' + id);
	assert.equal(lookup.contact.name, 'Updated name');
	assert.equal(lookup.contact.subscribed, false);
	const updated = await call('/' + id, 'PATCH', { locale: 'es', subscribed: true });
	assert.equal(updated.contact.can_email, true);
	assert.equal(updated.contact.unsubscribed_at, null);
	assert.equal(updated.contact.name, 'Updated name');
	await sql`update contacts set suppressed=true where id=${id}`;
	assert.equal((await call('?email=' + encodeURIComponent(draft.email))).contact.can_email, false);
	await call('/' + id, 'PATCH', { suppressed: false }, 400);
	await call('/' + id, 'PATCH', { subscribed: 'yes' }, 400);
	await call('/' + id, 'PATCH', { subscribed: true, unsubscribed: true }, 400);
	await call('/' + id, 'PATCH', {}, 400);
	await call('/not-an-id', 'GET', undefined, 400);
	await call('?email=' + encodeURIComponent(`missing@${suffix}`), 'GET', undefined, 404);
	await call('/00000000-0000-0000-0000-000000000000', 'PATCH', { name: 'Unknown' }, 404);
	await call('/00000000-0000-0000-0000-000000000000', 'DELETE', undefined, 404);
	const second = (
		await call('', 'POST', { name: 'Second', email: `second@${suffix}`, locale: 'en' })
	).ids[0];
	await call('/' + id, 'PATCH', { email: `SECOND@${suffix}` }, 409);
	const readdressed = await call('/' + second, 'PATCH', {
		email: ` RENAMED@${suffix.toUpperCase()} `
	});
	assert.equal(readdressed.contact.email, `renamed@${suffix}`);
	const dupeRows = await call('', 'POST', [
		{ ...draft, subscribed: true },
		{ ...draft, name: 'Last row', unsubscribed: true, subscribed: false }
	]);
	assert.deepEqual(dupeRows.ids, [id, id]);
	assert.equal(dupeRows.upserted, 1);
	assert.equal((await call('/' + id)).contact.name, 'Last row');
	await call('', 'POST', [], 400);
	await call('', 'POST', null, 400);
	await call('', 'POST', [draft, null], 400);
	await call(
		'',
		'POST',
		[
			{ name: 'Do not insert', email: `invalid-batch@${suffix}`, locale: 'en' },
			{ name: 'Invalid', email: 'bad', locale: 'en' }
		],
		400
	);
	assert.equal(
		(await sql`select id from contacts where email=${`invalid-batch@${suffix}`}`).length,
		0
	);
	const malformed = await fetch(origin + '/api/contacts', {
		method: 'POST',
		headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
		body: '{'
	});
	assert.equal(malformed.status, 400);
	const wrongType = await fetch(origin + '/api/contacts', {
		method: 'POST',
		headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'text/plain' },
		body: '{}'
	});
	assert.equal(wrongType.status, 415);
	const bulk = Array.from({ length: 20000 }, (_, n) => ({
		name: `Import ${n}`,
		email: `bulk-${String(n).padStart(5, '0')}@${suffix}`,
		locale: 'zz',
		subscribed: n % 2 === 0
	}));
	await call('', 'POST', [...bulk, bulk[0]], 400);
	const started = performance.now();
	const imported = await call('', 'POST', bulk);
	const elapsed = performance.now() - started;
	assert.equal(imported.ids.length, 20000);
	assert.equal(new Set(imported.ids).size, 20000);
	assert.equal(imported.upserted, 20000);
	const [count] =
		await sql`select count(*)::int as total,count(*) filter(where unsubscribed)::int as opted_out from contacts where email like ${`bulk-%@${suffix}`}`;
	assert.equal(count.total, 20000);
	assert.equal(count.opted_out, 10000);
	// Retry an import and keep the same IDs and opt-out state.
	const retried = await call(
		'',
		'POST',
		bulk.slice(0, 1001).map((c) => ({ ...c, subscribed: true }))
	);
	assert.deepEqual(retried.ids, imported.ids.slice(0, 1001));
	assert.equal(
		(await call('?email=' + encodeURIComponent(bulk[1].email))).contact.subscribed,
		false
	);
	const firstPage = await call('?limit=100');
	assert.equal(firstPage.contacts.length, 100);
	assert.ok(firstPage.next_cursor);
	const nextPage = await call('?limit=100&cursor=' + firstPage.next_cursor);
	assert.equal(nextPage.contacts.length, 100);
	assert.equal(new Set([...firstPage.contacts, ...nextPage.contacts].map((c) => c.id)).size, 200);
	await call('?limit=1001', 'GET', undefined, 400);
	await call('?cursor=bad', 'GET', undefined, 400);
	// Retain delivery snapshots/events and detach queued delivery records on deletion.
	campaignId = (
		await sql`insert into campaigns(title,subject,body,status) values('Contact API test','Test','Body','sent') returning id`
	)[0].id;
	const sent = (
		await sql`insert into deliveries(campaign_id,contact_id,email,name,locale,subject,body,token,status) values(${campaignId},${id},${draft.email},'Contact test','en','Test','Body',${token()},'sent') returning id`
	)[0];
	await sql`insert into events(delivery_id,type) values(${sent.id},'open')`;
	extraId = (
		await sql`insert into campaigns(title,subject,body,status) values('Delete queue test','Test','Body','draft') returning id`
	)[0].id;
	const queued = (
		await sql`insert into deliveries(campaign_id,contact_id,email,name,locale,subject,body,token,status) values(${extraId},${id},${draft.email},'Contact test','en','Test','Body',${token()},'processing') returning id`
	)[0];
	await call('/' + id, 'DELETE', undefined, 409);
	await sql`update deliveries set status='queued' where id=${queued.id}`;
	await call('/' + id, 'DELETE', undefined, 403, 'session', null);
	await call('/' + id, 'DELETE', undefined, 401, 'invalid', null);
	await call('/' + id, 'DELETE', undefined, 204, 'bearer', null);
	await call('?email=' + encodeURIComponent(draft.email), 'GET', undefined, 404);
	const snapshots =
		await sql`select contact_id,status from deliveries where id in (${sent.id},${queued.id})`;
	assert.equal(snapshots.length, 2);
	assert.ok(snapshots.every((d) => d.contact_id === null));
	assert.equal((await sql`select * from events where delivery_id=${sent.id}`).length, 1);
	// Existing browser forms and session authentication remain supported.
	await call(
		'',
		'POST',
		{ name: 'Browser', email: `browser@${suffix}`, locale: 'en' },
		200,
		'session'
	);
	console.log(
		`PASS: CRUD, email lookup/can_email, bearer and session auth, opt-outs, suppression, conflicts, atomic validation, pagination, historical deletion. Imported 20,000 contacts in ${Math.round(elapsed)} ms.`
	);
} finally {
	for (const id of [campaignId, extraId].filter(Boolean)) {
		await sql`delete from events where delivery_id in(select id from deliveries where campaign_id=${id})`;
		await sql`delete from deliveries where campaign_id=${id}`;
		await sql`delete from campaigns where id=${id}`;
	}
	await sql`delete from contacts where email like ${`%@${suffix}`}`;
	if (temporaryKey) await sql`delete from api_keys where id=${temporaryKey}`;
	if (cookie)
		await fetch(origin + '/logout', {
			method: 'POST',
			headers: { Origin: origin, Cookie: cookie },
			redirect: 'manual'
		});
	await sql.end();
}
