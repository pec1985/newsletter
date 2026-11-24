import assert from 'node:assert/strict';
import { sql } from '../src/lib/server/db';
const origin = 'http://127.0.0.1:5173';
const ids: string[] = [];
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
	const cookie = login.headers.get('set-cookie')!.split(';')[0];
	async function remove(id: string, authenticated = true) {
		return fetch(origin + '/api/delete-draft', {
			method: 'POST',
			headers: {
				Origin: origin,
				'Content-Type': 'application/json',
				...(authenticated ? { Cookie: cookie } : {})
			},
			body: JSON.stringify({ id })
		});
	}
	const [draft] = await sql`insert into campaigns (title) values ('Deletion test') returning id`;
	ids.push(draft.id);
	await sql`insert into versions (campaign_id,locale,subject,body) values (${draft.id},'en','Test','Test')`;
	assert.equal((await remove(draft.id, false)).status, 401);
	assert.equal((await remove(draft.id)).status, 200);
	assert.equal((await sql`select id from campaigns where id=${draft.id}`).length, 0);
	assert.equal((await sql`select id from versions where campaign_id=${draft.id}`).length, 0);
	assert.equal((await remove(draft.id)).status, 404);
	for (const status of ['sending', 'sent', 'attention']) {
		const [campaign] =
			await sql`insert into campaigns (title,status) values ('Protected deletion test',${status}) returning id`;
		ids.push(campaign.id);
		assert.equal((await remove(campaign.id)).status, 409);
		assert.equal((await sql`select id from campaigns where id=${campaign.id}`).length, 1);
	}
	await fetch(origin + '/logout', {
		method: 'POST',
		headers: { Origin: origin, Cookie: cookie },
		redirect: 'manual'
	});
	console.log(
		'PASS: draft deletion, version cleanup, authentication, missing drafts, and protection of sending/sent/attention campaigns.'
	);
} finally {
	for (const id of ids) await sql`delete from campaigns where id=${id}`;
	await sql.end();
}
