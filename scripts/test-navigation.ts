import assert from 'node:assert/strict';
import { sql } from '../src/lib/server/db';
const origin = 'http://127.0.0.1:5173';
const [campaign] =
	await sql`insert into campaigns(title,subject,body) values ('Navigation test','Navigation test','Direct-link body') returning id`;
const fixtureIds: string[] = [campaign.id];
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
		['/campaigns', 'All campaigns'],
		['/contacts', 'Email permission'],
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
		assert.ok(html.includes('href="/campaigns"'));
		assert.ok(html.includes('aria-label="Main navigation"'));
		assert.ok(html.includes('href="/settings/context"'));
		assert.ok(html.includes('href="/settings/knowledge"'));
		assert.ok(!html.includes('Local development'));
		if (path === '/campaigns') assert.ok(html.includes('href="/campaigns/' + campaign.id + '"'));
	}
	for (const status of ['sending', 'sent', 'attention']) {
		const [fixture] =
			await sql`insert into campaigns(title,subject,body,status) values ('Navigation fixture',${'Navigation ' + status},'Read-only result preview',${status}) returning id`;
		fixtureIds.push(fixture.id);
		const response = await fetch(origin + '/campaigns/' + fixture.id, {
			headers: { Cookie: cookie }
		});
		assert.equal(response.status, 200);
		const html = await response.text();
		assert.ok(html.includes('Delivery activity'), status + ' opens results');
		assert.ok(html.includes('Read-only result preview'));
		assert.ok(!html.includes('aria-label="Email body"'), status + ' cannot edit the sent email');
		if (status === 'sending') assert.ok(html.includes('Sending in progress'));
		const index = await (
			await fetch(origin + '/campaigns', { headers: { Cookie: cookie } })
		).text();
		assert.ok(
			index.includes(
				(status === 'sending' ? 'View progress' : 'View results') + ': Navigation ' + status
			)
		);
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
	assert.equal(settings.headers.get('location'), '/settings/sender');
	const campaigns = await fetch(origin + '/campaigns', {
		headers: { Cookie: cookie },
		redirect: 'manual'
	});
	assert.equal(campaigns.status, 200);
	assert.ok((await campaigns.text()).includes('Navigation test'));
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
	for (const id of fixtureIds) await sql`delete from campaigns where id=${id}`;
	await sql.end();
}
