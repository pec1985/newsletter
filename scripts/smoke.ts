import assert from 'node:assert/strict';
import { sql } from '../src/lib/server/db';
const origin = process.env.SMOKE_ORIGIN || 'http://127.0.0.1:5173';
let cookie = '';
let id = '';
let contactId = '';
let mediaId = '';
async function post(path: string, body: unknown) {
	const response = await fetch(origin + '/api/' + path, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie },
		body: JSON.stringify(body)
	});
	const data = await response.json();
	assert.equal(response.status, 200, JSON.stringify(data));
	return data;
}
try {
	const protectedPage = await fetch(origin, { redirect: 'manual' });
	assert.equal(protectedPage.status, 303);
	const forbidden = await fetch(origin + '/api/campaigns', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Origin: origin },
		body: '{}'
	});
	assert.equal(forbidden.status, 401);
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
	const page = await fetch(origin, { headers: { Cookie: cookie } });
	assert.equal(page.status, 200);
	assert.match(await page.text(), /postscript/i);
	const csrf = await fetch(origin + '/api/campaigns', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Cookie: cookie,
			Origin: 'https://invalid.example'
		},
		body: '{}'
	});
	assert.equal(csrf.status, 403);
	const contact = await post('contacts', {
		name: 'Smoke Test',
		email: 'smoke-test@example.invalid',
		locale: 'zz'
	});
	contactId = contact.ids[0];
	const created = await post('campaigns', { title: 'Smoke test' });
	id = created.id;
	await post('save', {
		id,
		title: 'Smoke test',
		subject: 'A test message',
		body: 'Hello, [friend](https://example.com).',
		source_locale: 'zz',
		locales: ['zz']
	});
	await post('translate', { id });
	const upload = new FormData();
	upload.set(
		'file',
		new File(
			[
				Buffer.from(
					'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfFcAAAAASUVORK5CYII=',
					'base64'
				)
			],
			'test.png',
			{ type: 'image/png' }
		)
	);
	const uploaded = await fetch(origin + '/api/media', {
		method: 'POST',
		headers: { Origin: origin, Cookie: cookie },
		body: upload
	});
	assert.equal(uploaded.status, 200);
	const media = await uploaded.json();
	mediaId = media.url.split('/').at(-1);
	const image = await fetch(media.url);
	assert.equal(image.status, 200);
	assert.equal(image.headers.get('Content-Type'), 'image/png');
	const [version] = await sql`select id from versions where campaign_id=${id}`;
	await post('approve-version', { id, version_id: version.id, approved: true });
	const queued = await post('send', { id, mode: 'local' });
	assert.equal(queued.count, 1);
	const duplicate = await fetch(origin + '/api/send', {
		method: 'POST',
		headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' },
		body: JSON.stringify({ id, mode: 'local' })
	});
	assert.equal(duplicate.status, 400);
	let delivery;
	for (let i = 0; i < 25; i++) {
		[delivery] = await sql`select * from deliveries where campaign_id=${id}`;
		if (delivery?.status === 'sent') break;
		await Bun.sleep(200);
	}
	assert.equal(delivery.status, 'sent');
	assert.equal(delivery.mode, 'local');
	for (let i = 0; i < 2; i++) {
		const pixel = await fetch(origin + '/track/' + delivery.token);
		assert.equal(pixel.status, 200);
		assert.equal(pixel.headers.get('Content-Type'), 'image/gif');
	}
	const [opened] = await sql`select * from deliveries where id=${delivery.id}`;
	assert.equal(opened.open_count, 2);
	assert.ok(opened.first_opened_at);
	const preferenceUrl = origin + '/unsubscribe/' + delivery.token;
	const preferenceAction = (action: string, body = '') =>
		fetch(preferenceUrl + '?/' + action, {
			method: 'POST',
			headers: {
				Origin: origin,
				Accept: 'text/html',
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body
		});
	assert.equal((await preferenceAction('unsubscribe', 'reason=invalid')).status, 400);
	assert.equal((await preferenceAction('unsubscribe', 'reason=frequency')).status, 200);
	await post('contacts', {
		name: 'Smoke Test Updated',
		email: 'smoke-test@example.invalid',
		locale: 'zz',
		unsubscribed: false
	});
	const [updated] = await sql`select * from contacts where id=${contactId}`;
	assert.equal(updated.unsubscribed, true);
	assert.equal(updated.unsubscribe_reason, 'frequency');
	const crm = await fetch(origin + '/contacts', { headers: { Cookie: cookie } });
	assert.match(await crm.text(), /Unsubscribed · I receive too many emails\./);
	assert.match(await (await fetch(preferenceUrl)).text(), /action="\?\/resubscribe"/);
	await sql`update contacts set suppressed=true where id=${contactId}`;
	assert.equal((await preferenceAction('resubscribe')).status, 200);
	const [subscribed] = await sql`select * from contacts where id=${contactId}`;
	assert.equal(subscribed.unsubscribed, false);
	assert.equal(subscribed.unsubscribe_reason, null);
	assert.equal(subscribed.suppressed, true);
	const logout = await fetch(origin + '/logout', {
		method: 'POST',
		headers: { Origin: origin, Cookie: cookie },
		redirect: 'manual'
	});
	assert.equal(logout.status, 303);
	console.log(
		'PASS: login, access control, CSRF, contacts, draft, preview, image upload, local delivery, duplicate prevention, tracking, unsubscribe preservation, logout.'
	);
} finally {
	if (id) {
		await sql`delete from events where delivery_id in (select id from deliveries where campaign_id=${id})`;
		await sql`delete from deliveries where campaign_id=${id}`;
		await sql`delete from campaigns where id=${id}`;
	}
	if (contactId) await sql`delete from contacts where id=${contactId}`;
	if (mediaId) await sql`delete from media where id=${mediaId}`;
	await sql.end();
}
