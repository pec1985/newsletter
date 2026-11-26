import assert from 'node:assert/strict';
import { sql } from '../src/lib/server/db';
import { releaseDueCampaigns } from '../src/lib/server/campaign-scheduler';
const origin = process.env.SMOKE_ORIGIN || 'http://127.0.0.1:5173';
let id = '';
let contactId = '';
let cookie = '';
async function post(
	path: string,
	body: Record<string, unknown>,
	status = 200,
	authenticated = true
) {
	const response = await fetch(`${origin}/api/${path}`, {
		method: 'POST',
		headers: {
			Origin: origin,
			'Content-Type': 'application/json',
			...(authenticated ? { Cookie: cookie } : {})
		},
		body: JSON.stringify({ id, ...body })
	});
	const data = await response.json();
	assert.equal(response.status, status, JSON.stringify(data));
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

	id = (await post('campaigns', { title: 'Schedule regression test' })).id;
	const draft = {
		subject: 'Scheduled test',
		body: 'Approved body',
		source_locale: 'zx',
		audience_id: (await sql`insert into audiences(name,plan) values (${id},${id}) returning id`)[0]
			.id
	};
	const scheduled_at = new Date(Date.now() + 7200000).toISOString();
	await post('save', { ...draft, scheduled_at });
	await post('save', { ...draft, scheduled_at: 'invalid' }, 400);
	contactId = (
		await post('contacts', {
			name: 'Schedule test',
			email: `schedule-${id}@example.invalid`,
			locale: 'zx',
			plan: id
		})
	).ids[0];
	await post('send', {}, 400);
	const [version] =
		await sql`insert into versions(campaign_id,locale,subject,body) values(${id},'zx','Approved subject','Approved body') returning id`;
	await post('approve-version', { version_id: version.id, approved: true });
	// Date-only edits must retain approved translations.
	await post('save', { ...draft, scheduled_at });
	assert.ok((await sql`select approved_at from versions where id=${version.id}`)[0].approved_at);
	await post('send', { mode: 'ses' });
	let [campaign] = await sql`select * from campaigns where id=${id}`;
	assert.equal(campaign.status, 'scheduled');
	assert.equal(campaign.mode, 'local');
	assert.equal(new Date(campaign.scheduled_at).toISOString(), scheduled_at);
	let [delivery] = await sql`select * from deliveries where campaign_id=${id}`;
	assert.equal(delivery.mode, 'local');
	assert.equal(delivery.status, 'queued');
	assert.equal(delivery.subject, 'Approved subject');
	await post('send', {}, 400);
	await post('save', draft, 400);
	const summary = await fetch(`${origin}/campaigns/${id}`, { headers: { Cookie: cookie } });
	const html = await summary.text();
	assert.ok(html.includes('Scheduled for'));
	assert.ok(html.includes('Cancel schedule'));
	// Do not release any unrelated scheduled campaign while exercising the worker helper.
	assert.equal(
		(
			await sql`select id from campaigns where status='scheduled' and scheduled_at<=now() and id<>${id}`
		).length,
		0
	);
	await releaseDueCampaigns();
	assert.equal((await sql`select status from campaigns where id=${id}`)[0].status, 'scheduled');
	await post('cancel-schedule', {}, 401, false);
	await post('cancel-schedule', {});
	assert.equal((await sql`select * from deliveries where campaign_id=${id}`).length, 0);
	assert.equal((await sql`select status from campaigns where id=${id}`)[0].status, 'draft');
	await post('save', {
		...draft,
		scheduled_at: new Date(Date.now() - 1000).toISOString()
	});
	await post('send', {}, 400);
	await post('save', { ...draft, scheduled_at });
	await post('send', {});
	await sql`update campaigns set scheduled_at=now()-interval '1 second' where id=${id}`;
	const released = await Promise.all([releaseDueCampaigns(), releaseDueCampaigns()]);
	assert.equal(released.flat().filter((c) => c.id === id).length, 1);
	assert.equal((await sql`select status from campaigns where id=${id}`)[0].status, 'sending');
	await post('cancel-schedule', {}, 409);
	console.log(
		'PASS: schedule dates, approval gate, local mode, snapshots, future/due dispatch, cancellation and duplicate dispatch.'
	);
} finally {
	if (id) {
		await sql`delete from events where delivery_id in(select id from deliveries where campaign_id=${id})`;
		await sql`delete from deliveries where campaign_id=${id}`;
		await sql`delete from campaigns where id=${id}`;
	}
	if (contactId) await sql`delete from contacts where id=${contactId}`;
	await sql`delete from audiences where name=${id}`;
	if (cookie)
		await fetch(origin + '/logout', {
			method: 'POST',
			headers: { Origin: origin, Cookie: cookie },
			redirect: 'manual'
		});
	await sql.end();
}
