import assert from 'node:assert/strict';
const origin = 'http://127.0.0.1:5173';
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
async function validate(body: unknown, authenticated = true, requestOrigin = origin) {
	return await fetch(origin + '/api/validate-service', {
		method: 'POST',
		headers: {
			Origin: requestOrigin,
			'Content-Type': 'application/json',
			...(authenticated ? { Cookie: cookie } : {})
		},
		body: JSON.stringify(body)
	});
}
try {
	assert.equal((await validate({ service: 'ai', config: {} }, false)).status, 401);
	assert.equal(
		(await validate({ service: 'ai', config: {} }, true, 'https://invalid.example')).status,
		403
	);
	assert.equal((await validate({ service: 'unknown', config: {} })).status, 400);
	// Empty config uses saved settings; live checks never save or send/upload/generate.
	for (const service of ['ai', 'embeddings', 'aws', 'imagekit']) {
		const response = await validate({ service, config: {} });
		assert.equal(response.status, 200);
		const result = await response.json();
		assert.ok(['success', 'warning', 'error'].includes(result.status));
		assert.deepEqual(Object.keys(result).sort(), ['message', 'status']);
		console.log(`${service}: ${result.status} — ${result.message}`);
	}
} finally {
	await fetch(origin + '/logout', {
		method: 'POST',
		headers: { Origin: origin, Cookie: cookie },
		redirect: 'manual'
	});
}
