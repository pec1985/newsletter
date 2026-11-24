import { test, expect } from 'bun:test';
import { validateService, validationConfig } from '../src/lib/server/validate-service';
const ai = {
	aiBaseUrl: 'https://api.openai.com/v1',
	aiKey: 'test-secret',
	aiDraftModel: 'draft-model',
	aiTranslationModel: 'translate-model'
};
function request(
	fn: (url: string, init?: RequestInit) => Response | Promise<Response>
): typeof fetch {
	return ((url: unknown, init?: RequestInit) =>
		Promise.resolve(fn(String(url), init))) as typeof fetch;
}
test('masked keys use stored credentials, explicit blank clears them, unrelated keys are excluded', () => {
	expect(
		validationConfig(
			'imagekit',
			{ imagekitKey: '••••••••', aiKey: 'not-for-imagekit' },
			{ imagekitKey: 'stored' }
		)
	).toEqual({ imagekitKey: 'stored' });
	expect(validationConfig('imagekit', { imagekitKey: '' }, { imagekitKey: 'stored' })).toEqual({
		imagekitKey: ''
	});
	expect(() => validationConfig('imagekit', { imagekitKey: 123 }, {})).toThrow();
});
test('AI checks distinct configured models using authenticated GET without generating tokens', async () => {
	const urls: string[] = [];
	const result = await validateService('ai', ai, {
		request: request((url, init) => {
			urls.push(url);
			expect(init?.headers).toMatchObject({ Authorization: 'Bearer test-secret' });
			expect(init?.method).toBeUndefined();
			expect(init?.redirect).toBe('error');
			return Response.json({ id: 'model' });
		})
	});
	expect(result.status).toBe('success');
	expect(urls).toEqual([
		'https://api.openai.com/v1/models/draft-model',
		'https://api.openai.com/v1/models/translate-model'
	]);
});
test('embeddings respects separate credentials and endpoint', async () => {
	const result = await validateService(
		'embeddings',
		{
			...ai,
			embeddingBaseUrl: 'https://provider.example/v1',
			embeddingKey: 'embedding-secret',
			embeddingModel: 'embed'
		},
		{
			request: request((url, init) => {
				expect(url).toBe('https://provider.example/v1/models/embed');
				expect(init?.headers).toMatchObject({ Authorization: 'Bearer embedding-secret' });
				return Response.json({ id: 'embed' });
			})
		}
	);
	expect(result.status).toBe('success');
});
test('ImageKit authenticates with Basic auth and only reads one file', async () => {
	const result = await validateService(
		'imagekit',
		{ imagekitKey: 'private-key' },
		{
			request: request((url, init) => {
				expect(url).toBe('https://api.imagekit.io/v1/files?limit=1');
				expect(init?.headers).toMatchObject({
					Authorization: `Basic ${Buffer.from('private-key:').toString('base64')}`
				});
				return Response.json([]);
			})
		}
	);
	expect(result.status).toBe('success');
});
test('provider response bodies and credentials never leak through errors', async () => {
	for (const status of [401, 403, 404, 429, 500]) {
		const result = await validateService('ai', ai, {
			request: request(() => new Response('test-secret', { status }))
		});
		expect(result.status).toBe('error');
		expect(result.message).not.toContain('test-secret');
	}
	const result = await validateService('ai', ai, {
		request: request(() => {
			throw new Error('test-secret');
		})
	});
	expect(result.message).not.toContain('test-secret');
});
test('malformed success and missing credentials do not pass', async () => {
	expect((await validateService('imagekit', {})).status).toBe('error');
	expect(
		(await validateService('ai', ai, { request: request(() => Response.json({})) })).status
	).toBe('error');
});
test('SES distinguishes production, sandbox, disabled sending, and denied IAM checks', async () => {
	const config = { awsRegion: 'eu-west-1', awsAccessKey: 'id', awsSecretKey: 'secret' };
	expect(
		(
			await validateService('aws', config, {
				account: async () => ({ SendingEnabled: true, ProductionAccessEnabled: true })
			})
		).status
	).toBe('success');
	expect(
		(
			await validateService('aws', config, {
				account: async () => ({ SendingEnabled: true, ProductionAccessEnabled: false })
			})
		).status
	).toBe('warning');
	expect(
		(await validateService('aws', config, { account: async () => ({ SendingEnabled: false }) }))
			.status
	).toBe('warning');
	const denied = await validateService('aws', config, {
		account: async () => {
			throw Object.assign(new Error('secret'), { name: 'AccessDeniedException' });
		}
	});
	expect(denied.message).toContain('ses:GetAccount');
	expect(denied.message).not.toContain('secret');
});
