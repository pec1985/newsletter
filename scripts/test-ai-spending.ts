import assert from 'node:assert/strict';
import { generateWithConfig, requestCompletion } from '../src/lib/server/ai';
import { sql } from '../src/lib/server/db';
const [campaign] =
	await sql`insert into campaigns(title,subject) values ('Accounting test','Accounting test') returning id`;
const config = {
	aiKey: 'test-token',
	aiBaseUrl: 'https://fake.example/v1',
	aiDraftModel: 'writer',
	aiTranslationModel: 'translator',
	aiDraftInputPrice: '2',
	aiDraftCachedPrice: '0.5',
	aiDraftOutputPrice: '8',
	aiTranslationInputPrice: '1',
	aiTranslationOutputPrice: '4'
};
const messages = [{ role: 'user', content: 'Return a JSON email.' }];
const success = {
	usage: {
		prompt_tokens: 1000000,
		completion_tokens: 100000,
		prompt_tokens_details: { cached_tokens: 400000 }
	},
	choices: [{ message: { content: JSON.stringify({ subject: 'Test', body: 'Test' }) } }]
};
const mockFetch = (body: unknown) =>
	(async (_input: unknown, init?: RequestInit) => {
		assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-token');
		return new Response(JSON.stringify(body), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	}) as typeof fetch;
try {
	await generateWithConfig(
		messages,
		{ campaignId: campaign.id, task: 'draft' },
		config,
		mockFetch(success)
	);
	const [first] = await sql`select * from ai_usage where campaign_id=${campaign.id}`;
	assert.equal(Number(first.cost_usd), 2.2);
	assert.equal(first.status, 'succeeded');
	await generateWithConfig(
		messages,
		{ campaignId: campaign.id, task: 'translate', locale: 'es' },
		config,
		mockFetch(success)
	);
	await assert.rejects(
		generateWithConfig(
			messages,
			{ campaignId: campaign.id, task: 'translate', locale: 'fr' },
			config,
			mockFetch({ ...success, choices: [{ message: { content: 'not JSON' } }] })
		)
	);
	await generateWithConfig(
		messages,
		{ campaignId: campaign.id, task: 'draft' },
		config,
		mockFetch({ choices: success.choices })
	);
	const changed = { ...config, aiDraftInputPrice: '20' };
	await generateWithConfig(
		messages,
		{ campaignId: campaign.id, task: 'draft' },
		changed,
		mockFetch(success)
	);
	const [unchanged] = await sql`select * from ai_usage where id=${first.id}`;
	assert.equal(Number(unchanged.cost_usd), 2.2);
	assert.equal(unchanged.rates.input, 2);
	const rows = await sql`select * from ai_usage where campaign_id=${campaign.id}`;
	assert.equal(rows.length, 5);
	const translated = rows.find((row) => row.locale === 'es')!;
	assert.equal(translated.model, 'translator');
	assert.equal(Number(translated.cost_usd), 1.4);
	const invalid = rows.find((row) => row.locale === 'fr')!;
	assert.equal(invalid.status, 'invalid_response');
	assert.equal(Number(invalid.cost_usd), 1.4);
	const unknown = rows.find((row) => row.pricing_status === 'unknown_usage')!;
	assert.equal(unknown.cost_usd, null);
	await requestCompletion(
		messages,
		{ campaignId: campaign.id, task: 'draft' },
		{ ...config, aiBaseUrl: 'https://api.openai.com/v1', aiDraftModel: 'gpt-6.2-astra' },
		(async (_url, init) => {
			const body = JSON.parse(String(init?.body));
			assert.equal(String(_url), 'https://api.openai.com/v1/responses');
			assert.equal(body.store, false);
			assert.equal(body.input[0].role, 'user');
			assert.equal(body.tools.length, 1);
			return new Response(
				JSON.stringify({
					output: [
						{
							type: 'message',
							content: [
								{ type: 'output_text', text: JSON.stringify({ subject: 'Test', body: 'Test' }) }
							]
						}
					],
					usage: {
						input_tokens: 1000000,
						output_tokens: 100000,
						input_tokens_details: { cached_tokens: 400000 }
					}
				})
			);
		}) as typeof fetch,
		{ tools: [{ type: 'function' }] }
	);
	await assert.rejects(
		generateWithConfig(
			messages,
			{ campaignId: campaign.id, task: 'draft' },
			config,
			(async () =>
				new Response(JSON.stringify({ error: { message: 'Unsupported option; test-token' } }), {
					status: 400
				})) as typeof fetch
		),
		(error: Error) =>
			error.message.includes('Unsupported option; [redacted]') &&
			!error.message.includes('test-token')
	);
	await sql`delete from campaigns where id=${campaign.id}`;
	const [retained] = await sql`select * from ai_usage where id=${first.id}`;
	assert.equal(retained.campaign_id, null);
	assert.equal(retained.campaign_subject, 'Accounting test');
	console.log(
		'PASS: per-task usage, translation locale, failed-content billing, unknown usage, historical rates, and retained ledger after draft deletion. No external AI requests made.'
	);
} finally {
	await sql`delete from ai_usage where campaign_id=${campaign.id} or (campaign_id is null and campaign_subject='Accounting test')`;
	await sql`delete from campaigns where id=${campaign.id}`;
	await sql.end();
}
