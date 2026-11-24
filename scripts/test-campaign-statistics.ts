import assert from 'node:assert/strict';
import { sql } from '../src/lib/server/db';
const origin = 'http://127.0.0.1:5173';
let id = '';
let cookie = '';
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
	const [campaign] =
		await sql`insert into campaigns(title,subject,body,status,mode,locales) values ('Statistics scale test','Statistics scale test','One campaign body','sent','local','{en,es}') returning id`;
	id = campaign.id;
	await sql`insert into deliveries(campaign_id,email,name,locale,subject,body,token,status,mode,sent_at,first_opened_at,open_count,error)
		select ${id},'loadtest-'||n||'@example.invalid','Scale recipient '||n,case when n%2=0 then 'es' else 'en' end,
		'Statistics scale test',repeat('Payload must not include delivery bodies. ',100),gen_random_uuid()::text,
		case when n%100=0 then 'failed' else 'sent' end,'local',now(),case when n%3=0 then now() else null end,
		case when n%3=0 then 1 else 0 end,case when n%100=0 then 'Test delivery failure' else null end
		from generate_series(1,20001) as n`;
	const endpoint = `${origin}/api/campaigns/${id}/deliveries`;
	assert.equal((await fetch(endpoint)).status, 401);
	async function get(query = '') {
		const response = await fetch(endpoint + query, { headers: { Cookie: cookie } });
		assert.equal(response.status, 200);
		const text = await response.text();
		assert.ok(text.length < 40000, `Page payload too large: ${text.length}`);
		const result = JSON.parse(text);
		assert.ok(result.rows.length <= 50);
		assert.ok(
			result.rows.every((row: Record<string, unknown>) => !('body' in row) && !('token' in row))
		);
		return result;
	}
	const started = performance.now();
	const first = await get();
	assert.equal(first.total, 20001);
	assert.equal(first.rows.length, 50);
	const second = await get('?page=2');
	assert.ok(
		second.rows.every(
			(row: { id: string }) =>
				!first.rows.some((previous: { id: string }) => previous.id === row.id)
		)
	);
	const last = await get('?page=401');
	assert.equal(last.rows.length, 1);
	assert.equal((await get('?page=9999')).page, 401);
	assert.equal((await get('?status=failed')).total, 200);
	assert.equal((await get('?locale=es')).total, 10000);
	assert.equal((await get('?status=failed&locale=en')).total, 0);
	assert.equal((await get('?status=opened')).total, 6667);
	assert.equal((await get('?q=LOADTEST-20001%40example.invalid')).total, 1);
	assert.equal((await get('?q=does-not-exist')).total, 0);
	assert.equal((await fetch(endpoint + '?page=-1', { headers: { Cookie: cookie } })).status, 400);
	assert.equal(
		(await fetch(endpoint + '?status=invalid', { headers: { Cookie: cookie } })).status,
		400
	);
	const page = await fetch(`${origin}/campaigns/${id}`, { headers: { Cookie: cookie } });
	assert.equal(page.status, 200);
	const html = await page.text();
	assert.ok(html.includes('20,001'));
	assert.ok(html.includes('Delivery by language'));
	assert.ok(!html.includes('loadtest-'));
	assert.ok(!html.includes('Payload must not include delivery bodies.'));
	assert.ok(html.length < 500000, `Overview payload too large: ${html.length}`);
	console.log(
		`PASS: 20,001 deliveries; bounded 50-row pages, filtering, stable pagination, authentication, aggregate overview without recipient data. Checks: ${Math.round(performance.now() - started)}ms. Overview: ${html.length} characters.`
	);
} finally {
	if (id) {
		await sql`delete from deliveries where campaign_id=${id}`;
		await sql`delete from campaigns where id=${id}`;
	}
	if (cookie)
		await fetch(origin + '/logout', {
			method: 'POST',
			headers: { Origin: origin, Cookie: cookie },
			redirect: 'manual'
		});
	await sql.end();
}
