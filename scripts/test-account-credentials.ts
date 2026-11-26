import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sql } from '../src/lib/server/db';
import { hashPassword } from '../src/lib/server/security';

const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:5173';
const original = 'account-test-' + randomUUID();
const renamed = original + '-renamed';
const taken = original + '-taken';
const added = original + '-added';
const password = 'original-password';
const replacement = 'eight888';

function post(path: string, fields: Record<string, string>, cookie = '') {
	return fetch(origin + path, {
		method: 'POST',
		headers: { Origin: origin, Accept: 'text/html', Cookie: cookie },
		body: new URLSearchParams(fields),
		redirect: 'manual'
	});
}
function login(username: string, password: string) {
	return post('/login', { username, password });
}
async function session() {
	const response = await login(original, password);
	assert.equal(response.status, 303);
	return response.headers.get('set-cookie')!.split(';')[0];
}

const fixtures =
	await sql`insert into users(username,password_hash) values (${original},${hashPassword(password)}),(${taken},${hashPassword(password)}) returning id`;
try {
	const active = await session();
	const other = await session();
	const createPath = '/settings/users?/createUser';
	const fields = { username: added, password: replacement, confirmation: replacement };
	assert.equal((await post(createPath, fields)).status, 303);
	assert.equal((await post(createPath, { ...fields, password: 'short' }, active)).status, 400);
	assert.equal(
		(await post(createPath, { ...fields, confirmation: 'mismatch' }, active)).status,
		400
	);
	const created = await post(createPath, fields, active);
	assert.equal(created.status, 200);
	assert.ok((await created.text()).includes(added + ' can now sign in.'));
	assert.equal((await post(createPath, fields, active)).status, 409);
	assert.equal((await login(added, replacement)).status, 303);
	const path = '/settings/account';
	const read = (cookie: string) =>
		fetch(origin + path, { headers: { Cookie: cookie }, redirect: 'manual' });
	const change = (
		username: string,
		currentPassword: string,
		newPassword = '',
		confirmation = newPassword
	) =>
		post(path + '?/credentials', { username, currentPassword, newPassword, confirmation }, active);
	assert.equal((await read('')).status, 303);
	assert.equal((await post(path + '?/credentials', {})).status, 303);
	assert.match(await (await read(active)).text(), /Save account changes/);
	assert.equal((await change(taken, password)).status, 409);
	assert.equal((await change(renamed, password, '1234567')).status, 400);
	assert.equal((await change(renamed, password, replacement, 'mismatch')).status, 400);
	assert.equal((await change(renamed, password)).status, 200);
	assert.equal((await login(original, password)).status, 400);
	assert.equal((await login(renamed, password)).status, 303);
	assert.equal((await change(renamed, password, replacement)).status, 200);
	assert.equal((await read(active)).status, 200);
	assert.equal((await read(other)).status, 303);
	assert.equal((await login(renamed, password)).status, 400);
	assert.equal((await login(renamed, replacement)).status, 303);
	const lockoutSession = await login(taken, password);
	assert.equal(lockoutSession.status, 303);
	const lockoutCookie = lockoutSession.headers.get('set-cookie')!.split(';')[0];
	const lockoutChange = (currentPassword: string) =>
		post(
			path + '?/credentials',
			{ username: taken, currentPassword, newPassword: '', confirmation: '' },
			lockoutCookie
		);
	for (let attempt = 0; attempt < 5; attempt++)
		assert.equal((await lockoutChange('incorrect')).status, 400);
	assert.equal((await lockoutChange(password)).status, 429);
	console.log('Account credential checks passed.');
} finally {
	await sql`delete from users where username=${added} or id in ${sql(fixtures.map((row) => row.id))}`;
	await sql.end();
}
