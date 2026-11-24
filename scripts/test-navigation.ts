import assert from 'node:assert/strict';
import { sql } from '../src/lib/server/db';
const origin = 'http://127.0.0.1:5173';
const [campaign] =
	await sql`insert into campaigns(title,subject,body) values ('Navigation test','Navigation test','Direct-link body') returning id`;
let cookie = '';
try {
	const protectedResponse = await fetch(origin + '/settings/ai', { redirect: 'manual' });
	assert.equal(protectedResponse.status, 303);
	assert.equal(protectedResponse.headers.get('location'), '/login?next=%2Fsettings%2Fai');
	const login = await fetch(origin + '/login?next=%2Fsettings%2Fai', {
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
	assert.equal(login.headers.get('location'), '/settings/ai');
	cookie = login.headers.get('set-cookie')!.split(';')[0];
	for (const [path, text] of [
		['/contacts', 'Search contacts'],
		['/settings/context', 'Company name'],
		['/settings/ai', 'API base URL'],
		['/settings/knowledge', 'Search preview'],
		['/settings/sender', 'Sender email'],
		['/settings/delivery', 'AWS region'],
		['/settings/images', 'ImageKit private API key'],
		['/settings/api', 'POST /api/contacts'],
		['/campaigns/' + campaign.id, 'Direct-link body']
	]) {
		const response = await fetch(origin + path, {
			headers: { Cookie: cookie },
			redirect: 'manual'
		});
		assert.equal(response.status, 200, path);
		const html = await response.text();
		assert.ok(html.includes(text), path + ' renders its own content');
		assert.ok(html.includes('href="/contacts"'));
		assert.ok(html.includes('href="/campaigns/' + campaign.id + '"'));
	}
	for (const path of ['/settings/unknown', '/campaigns/not-a-campaign']) {
		const response = await fetch(origin + path, {
			headers: { Cookie: cookie },
			redirect: 'manual'
		});
		assert.equal(response.status, 404);
	}
	const root = await fetch(origin + '/', { headers: { Cookie: cookie }, redirect: 'manual' });
	assert.equal(root.status, 303);
	assert.equal(root.headers.get('location'), '/campaigns');
	const settings = await fetch(origin + '/settings', {
		headers: { Cookie: cookie },
		redirect: 'manual'
	});
	assert.equal(settings.status, 307);
	assert.equal(settings.headers.get('location'), '/settings/context');
	const campaigns = await fetch(origin + '/campaigns', {
		headers: { Cookie: cookie },
		redirect: 'manual'
	});
	assert.equal(campaigns.status, 307);
	assert.ok(campaigns.headers.get('location')?.startsWith('/campaigns/'));
	console.log(
		'PASS: deep links, server-rendered content, real navigation links, unknown-route 404s, canonical redirects, and return to requested page after login.'
	);
} finally {
	if (cookie)
		await fetch(origin + '/logout', {
			method: 'POST',
			headers: { Origin: origin, Cookie: cookie },
			redirect: 'manual'
		});
	await sql`delete from campaigns where id=${campaign.id}`;
	await sql.end();
}
