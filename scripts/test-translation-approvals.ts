import assert from 'node:assert/strict';
import { sql } from '../src/lib/server/db';
import { prepareTranslation } from '../src/lib/server/translations';
const origin = 'http://127.0.0.1:5173';
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
	id = (await post('campaigns', { title: 'Approval regression test' })).id;
	const draft = {
		subject: 'Review me',
		body: 'Original draft',
		source_locale: 'zz-US',
		locales: ['zz-US', 'zz-GB', 'zy']
	};
	await post('save', draft);
	const [saved] = await sql`select source_locale, locales from campaigns where id=${id}`;
	assert.equal(saved.source_locale, 'zz');
	assert.deepEqual([...saved.locales], ['zz', 'zy']);
	const reviewPage = await fetch(`${origin}/campaigns/${id}/review`, {
		headers: { Cookie: cookie }
	});
	assert.equal(reviewPage.status, 200);
	const reviewHtml = await reviewPage.text();
	assert.ok(reviewHtml.includes('Language previews'));
	assert.ok(reviewHtml.includes('Translated email'));
	assert.ok(reviewHtml.includes('Send Now'));

	contactId = (
		await post('contacts', {
			name: 'Approval test',
			email: `approval-${id}@example.invalid`,
			locale: 'zz-CA'
		})
	).ids[0];
	await post('send', { mode: 'local' }, 400);
	// Seed multilingual results without making a paid AI call.
	const versions = await sql`insert into versions (campaign_id,locale,subject,body) values
		(${id},'zz','Review me','Original draft'), (${id},'zy','Translated subject','Translated body') returning id`;
	await post('send', { mode: 'local' }, 400);
	const approval = { version_id: versions[0].id, approved: true };
	await post('approve-version', approval, 401, false);
	await post('approve-version', { ...approval, approved: 'yes' }, 400);
	await post('approve-version', approval);
	await post('send', { mode: 'local' }, 400);
	await post('approve-version', { version_id: versions[1].id, approved: true });
	const approved = await sql`select approved_at,approved_by from versions where campaign_id=${id}`;
	assert.ok(approved.every((v) => v.approved_at && v.approved_by));
	await post('approve-version', { ...approval, approved: false });
	await post('send', { mode: 'local' }, 400);
	await post('approve-version', approval);
	const manualEdit = {
		version_id: versions[1].id,
		subject: 'Manually edited subject',
		body: 'Manually edited translation'
	};
	await post('edit-version', manualEdit, 401, false);
	await post('edit-version', { ...manualEdit, subject: '' }, 400);
	await post('edit-version', manualEdit);
	const [edited] = await sql`select * from versions where campaign_id=${id} and locale='zy'`;
	assert.notEqual(edited.id, versions[1].id);
	assert.equal(edited.subject, manualEdit.subject);
	assert.equal(edited.body, manualEdit.body);
	assert.equal(edited.approved_at, null);
	assert.ok(
		(await sql`select approved_at from versions where id=${versions[0].id}`)[0].approved_at
	);
	assert.equal((await sql`select body from campaigns where id=${id}`)[0].body, draft.body);
	await post('approve-version', { version_id: versions[1].id, approved: true }, 409);
	await post('edit-version', manualEdit, 409);
	await post('translate', { locale: 'zy-CH' });
	assert.equal(
		(await sql`select body from versions where id=${edited.id}`)[0].body,
		manualEdit.body
	);
	await post('send', {}, 400);
	await post('approve-version', { version_id: edited.id, approved: true });
	await post('edit-version', { ...manualEdit, version_id: edited.id });
	assert.ok((await sql`select approved_at from versions where id=${edited.id}`)[0].approved_at);
	await post('save', { ...draft, body: 'Changed draft', locales: ['zz'] });
	assert.equal((await sql`select id from versions where campaign_id=${id}`).length, 0);
	await post('edit-version', { ...manualEdit, version_id: edited.id }, 409);
	await post('approve-version', approval, 409);
	await post('send', { mode: 'local' }, 400);
	await post('translate', {});
	const [first] = await sql`select id from versions where campaign_id=${id}`;
	await post('approve-version', { version_id: first.id, approved: true });
	await post('translate', {});
	const [cached] = await sql`select * from versions where campaign_id=${id}`;
	assert.equal(cached.id, first.id);
	assert.ok(cached.approved_at);
	await post('save', { ...draft, body: 'Changed draft', locales: ['zz'] });
	assert.equal((await sql`select id from versions where campaign_id=${id}`)[0].id, first.id);
	await post('save', { ...draft, body: 'Changed draft again', locales: ['zz'] });
	await post('approve-version', { version_id: first.id, approved: true }, 409);
	await post('translate', {});
	await post('send', { mode: 'local' }, 400);
	const [replacement] = await sql`select * from versions where campaign_id=${id}`;
	assert.equal(replacement.approved_at, null);
	await post('approve-version', { version_id: replacement.id, approved: true });
	// Adding audiences preserves approved content and creates only missing translations.
	await post('save', { ...draft, body: 'Changed draft again', locales: ['zz', 'zy'] });
	assert.equal(
		(await sql`select id from versions where campaign_id=${id} and locale='zz'`)[0].id,
		replacement.id
	);
	let calls = 0;
	let release!: () => void;
	let started!: () => void;
	const startedPromise = new Promise<void>((resolve) => {
		started = resolve;
	});
	const pause = new Promise<void>((resolve) => {
		release = resolve;
	});
	const pending = prepareTranslation(id, 'zy', false, async () => {
		calls++;
		started();
		await pause;
		return { subject: 'Translated', body: 'Translated email' };
	});
	await startedPromise;
	const [inProgress] = await sql`select * from versions where campaign_id=${id} and locale='zy'`;
	assert.equal(inProgress.status, 'translating');
	await post('approve-version', { version_id: inProgress.id, approved: true }, 409);
	await post('send', { mode: 'local' }, 400);
	await prepareTranslation(id, 'zy', false, async () => {
		calls++;
		throw new Error('Duplicate call');
	});
	assert.equal(calls, 1);
	release();
	await pending;
	const [translated] = await sql`select * from versions where id=${inProgress.id}`;
	assert.equal(translated.status, 'ready');
	await post('approve-version', { version_id: translated.id, approved: true });
	await prepareTranslation(id, 'zy', true, async () => {
		calls++;
		throw new Error('Must reuse completed translations');
	});
	assert.equal(calls, 1);
	// Errors persist; retry only the failed locale, keeping other approvals intact.
	await post('save', { ...draft, body: 'Changed draft again', locales: ['zz', 'zy', 'zx'] });
	await prepareTranslation(id, 'zx', false, async () => {
		throw new Error('Test provider failure');
	});
	const [failed] = await sql`select * from versions where campaign_id=${id} and locale='zx'`;
	assert.equal(failed.status, 'failed');
	await prepareTranslation(id, 'zx', false, async () => {
		throw new Error('Must not auto retry');
	});
	assert.equal(
		(await sql`select error from versions where id=${failed.id}`)[0].error,
		'Test provider failure'
	);
	await prepareTranslation(id, 'zx', true, async () => ({
		subject: 'Retried',
		body: 'Retried email'
	}));
	assert.equal(
		(await sql`select status from versions where campaign_id=${id} and locale='zx'`)[0].status,
		'ready'
	);
	// Interrupted requests become retryable instead of staying in progress forever.
	await sql`update versions set status='translating',started_at=now()-interval '3 minutes' where campaign_id=${id} and locale='zx'`;
	await prepareTranslation(id, 'zx');
	assert.equal(
		(await sql`select status from versions where campaign_id=${id} and locale='zx'`)[0].status,
		'failed'
	);
	await prepareTranslation(id, 'zx', true, async () => ({
		subject: 'Recovered',
		body: 'Recovered email'
	}));
	assert.equal(
		(await sql`select status from versions where campaign_id=${id} and locale='zx'`)[0].status,
		'ready'
	);
	// An edit during generation discards the old result, even when it finishes later.
	await post('save', { ...draft, body: 'Changed draft again', locales: ['zz', 'zy', 'zx', 'zv'] });
	let releaseStale!: () => void;
	let startedStale!: () => void;
	const staleStarted = new Promise<void>((resolve) => {
		startedStale = resolve;
	});
	const stalePause = new Promise<void>((resolve) => {
		releaseStale = resolve;
	});
	const stale = prepareTranslation(id, 'zv', false, async () => {
		startedStale();
		await stalePause;
		return { subject: 'Stale', body: 'Stale body' };
	});
	await staleStarted;
	await post('save', { ...draft, body: 'Final content', locales: ['zz'] });
	releaseStale();
	await stale;
	assert.equal((await sql`select id from versions where campaign_id=${id}`).length, 0);
	await post('translate', {});
	const [finalVersion] = await sql`select * from versions where campaign_id=${id}`;
	await post('approve-version', { version_id: finalVersion.id, approved: true });
	// A client cannot override development's simulated delivery mode.
	assert.equal((await post('send', { mode: 'ses' })).count, 1);
	const [delivery] = await sql`select * from deliveries where campaign_id=${id}`;
	assert.equal(delivery.mode, 'local');
	assert.equal(delivery.body, finalVersion.body);
	assert.equal(delivery.subject, finalVersion.subject);
	await post('approve-version', { version_id: replacement.id, approved: false }, 400);
	await post('send', { mode: 'local' }, 400);
	console.log(
		'PASS: missing, partial, revoked and stale approvals block sending; unchanged previews and approvals persist; parallel requests deduplicate; failure retry and stale-result protection work; approved content is queued exactly once.'
	);
} finally {
	if (id) {
		await sql`delete from events where delivery_id in (select id from deliveries where campaign_id=${id})`;
		await sql`delete from deliveries where campaign_id=${id}`;
		await sql`delete from campaigns where id=${id}`;
	}
	if (contactId) await sql`delete from contacts where id=${contactId}`;
	if (cookie)
		await fetch(origin + '/logout', {
			method: 'POST',
			headers: { Origin: origin, Cookie: cookie },
			redirect: 'manual'
		});
	await sql.end();
}
