import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sql } from '../src/lib/server/db';
import { hashPassword } from '../src/lib/server/security';

const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:5173';
const creator = 'team-test-' + randomUUID();
const username = creator + '-member';
const password = randomUUID();

function post(path: string, fields: Record<string, string>, cookie = '') {
	return fetch(origin + path, {
		method: 'POST',
		headers: { Origin: origin, Accept: 'text/html', Cookie: cookie },
		body: new URLSearchParams(fields),
		redirect: 'manual'
	});
}

try {
	await sql`insert into users (username,password_hash) values (${creator},${hashPassword(password)})`;
	const login = await post('/login', { username: creator, password });
	assert.equal(login.status, 303);
	const cookie = login.headers.get('set-cookie')!.split(';')[0];
	const add = (password: string, session = cookie) =>
		post('/settings/team?/addMember', { username, password }, session);
	assert.equal((await add(password, '')).status, 303);
	assert.equal((await add('short')).status, 400);
	const created = await add(password);
	assert.equal(created.status, 200);
	const html = await created.text();
	assert.ok(html.includes(username + ' can now sign in.'));
	assert.ok(!html.includes(password));
	assert.equal((await add('different-password')).status, 409);
	const memberLogin = await post('/login', { username, password });
	assert.equal(memberLogin.status, 303);
	const roster = await fetch(origin + '/settings/team', {
		headers: { Cookie: memberLogin.headers.get('set-cookie')!.split(';')[0] }
	});
	assert.equal(roster.status, 200);
	assert.ok((await roster.text()).includes(username + ' (you)'));
	console.log('Team member checks passed.');
} finally {
	await sql`delete from users where username in (${creator},${username})`;
	await sql.end();
}
