import assert from 'node:assert/strict';
import { sql } from '../src/lib/server/db';
import { indexNextDocument } from '../src/lib/server/knowledge-index';
import { searchKnowledge } from '../src/lib/server/knowledge-search';
import { draftWithKnowledge } from '../src/lib/server/drafting-agent';
const origin = 'http://127.0.0.1:5173';
const config = {
	aiBaseUrl: 'https://knowledge-test.invalid/v1',
	aiKey: 'fake',
	aiDraftModel: 'writer',
	embeddingModel: 'embed',
	embeddingInputPrice: '0.1',
	aiDraftInputPrice: '1',
	aiDraftOutputPrice: '2',
	companyContext: 'A test software company',
	companyTone: 'Warm and direct'
};
const documents: string[] = [];
let campaignId = '',
	cookie = '',
	embeddingCalls = 0,
	chatCalls = 0;
const vector = (text: string) => (/onboarding|invite/i.test(text) ? [1, 0, 0] : [0, 1, 0]);
const provider = (async (input: unknown, options?: RequestInit) => {
	const body = JSON.parse(String(options?.body));
	if (String(input).endsWith('/embeddings')) {
		embeddingCalls++;
		return Response.json({
			data: body.input.map((text: string, index: number) => ({ index, embedding: vector(text) })),
			usage: { prompt_tokens: 100 }
		});
	}
	chatCalls++;
	assert.ok(body.messages[0].content.includes('Warm and direct'));
	assert.ok(body.messages[0].content.includes('UNTRUSTED REFERENCE DATA'));
	if (chatCalls === 1)
		return Response.json({
			usage: { prompt_tokens: 50, completion_tokens: 20 },
			choices: [
				{
					message: {
						role: 'assistant',
						content: null,
						tool_calls: [
							{
								id: 'call_search',
								type: 'function',
								function: {
									name: 'search_knowledge',
									arguments: JSON.stringify({ query: 'onboarding invite' })
								}
							}
						]
					}
				}
			]
		});
	const tool = body.messages.find((m: { role: string }) => m.role === 'tool');
	assert.ok(tool);
	assert.ok(JSON.parse(tool.content).sources.length);
	return Response.json({
		usage: { prompt_tokens: 80, completion_tokens: 40 },
		choices: [
			{
				message: {
					role: 'assistant',
					content: JSON.stringify({
						subject: 'Welcome to your workspace',
						body: 'Invite your team to get started.',
						message: 'I found the onboarding instructions.'
					})
				}
			}
		]
	});
}) as typeof fetch;
async function post(action: string, body: unknown) {
	const r = await fetch(origin + '/api/knowledge/' + action, {
		method: 'POST',
		headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	assert.equal(r.status, 200, await r.clone().text());
	return r.json();
}
async function upload(text: string, id?: string) {
	const form = new FormData();
	form.set('file', new File([text], 'knowledge-test.md', { type: 'text/markdown' }));
	form.set('title', 'Knowledge test');
	if (id) form.set('id', id);
	const r = await fetch(origin + '/api/knowledge/upload', {
		method: 'POST',
		headers: { Origin: origin, Cookie: cookie },
		body: form
	});
	assert.equal(r.status, 200, await r.clone().text());
	return r.json();
}
try {
	const unauth = await fetch(origin + '/api/knowledge/search', {
		method: 'POST',
		headers: { Origin: origin, 'Content-Type': 'application/json' },
		body: '{"query":"test"}'
	});
	assert.equal(unauth.status, 401);
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
	const bad = await fetch(origin + '/api/knowledge/search', {
		method: 'POST',
		headers: {
			Origin: 'https://invalid.example',
			Cookie: cookie,
			'Content-Type': 'application/json'
		},
		body: '{"query":"test"}'
	});
	assert.equal(bad.status, 403);
	const markdown =
		'# Product\n## Onboarding\nInvite your team from settings.\n\n' +
		'Onboarding helps your team collaborate. '.repeat(900) +
		'\n## Billing\nInvoices arrive monthly.';
	assert.ok(markdown.length > 20000);
	const doc = await upload(markdown);
	documents.push(doc.id);
	await indexNextDocument(config, provider, doc.id);
	const [indexed] = await sql`select * from knowledge_documents where id=${doc.id}`;
	assert.equal(indexed.status, 'ready', indexed.error);
	assert.ok(indexed.chunk_count > 10);
	const found = await searchKnowledge('onboarding invite', {}, config, provider);
	assert.ok(found.sources.length);
	assert.ok(found.sources.every((s) => s.heading.includes('Onboarding')));
	const before = embeddingCalls;
	await post('reindex', { id: doc.id });
	await indexNextDocument(config, provider, doc.id);
	assert.equal(embeddingCalls, before, 'Unchanged chunks reuse existing vectors');
	const changed = await upload(
		'# Product\n## Onboarding\nInvite people using the NEW_INVITE_FLOW.',
		doc.id
	);
	assert.equal(changed.unchanged, false);
	await indexNextDocument(config, provider, doc.id);
	const newSearch = await searchKnowledge('onboarding invite', {}, config, provider);
	assert.ok(newSearch.sources.some((s) => s.content.includes('NEW_INVITE_FLOW')));
	assert.ok(newSearch.sources.every((s) => !s.content.includes('collaborate')));
	const mismatch = await searchKnowledge(
		'onboarding',
		{},
		{ ...config, embeddingModel: 'other' },
		provider
	);
	assert.equal(mismatch.sources.length, 0);
	assert.ok(mismatch.notice);
	const [campaign] =
		await sql`insert into campaigns(title,subject) values ('Knowledge test campaign','Knowledge test') returning *`;
	campaignId = campaign.id;
	const draft = await draftWithKnowledge(
		campaign as { id: string; source_locale: string; subject: string; body: string },
		[{ role: 'user', content: 'Write about onboarding.' }],
		config,
		provider
	);
	assert.equal(chatCalls, 2);
	assert.ok(draft.sources.length);
	assert.equal(draft.subject, 'Welcome to your workspace');
	const usage = await sql`select task from ai_usage where campaign_id=${campaignId}`;
	assert.equal(usage.filter((r) => r.task === 'draft').length, 2);
	assert.equal(usage.filter((r) => r.task === 'embedding_search').length, 1);
	const snapshot = JSON.stringify(draft.sources);
	await post('delete', { id: doc.id });
	assert.equal((await sql`select id from knowledge_chunks where document_id=${doc.id}`).length, 0);
	assert.ok(snapshot.includes('NEW_INVITE_FLOW'));
	const failed = await upload('# Failure\nUnique failure text.');
	documents.push(failed.id);
	await indexNextDocument(
		config,
		(async () => Response.json({ error: 'test' }, { status: 500 })) as typeof fetch,
		failed.id
	);
	const [failure] = await sql`select status,error from knowledge_documents where id=${failed.id}`;
	assert.equal(failure.status, 'error');
	assert.ok(failure.error.includes('500'));
	console.log(
		'PASS: authenticated uploads >20,000 characters, indexing, hybrid search, vector reuse, replacement, profile mismatch, real tool-call loop, source snapshots, usage attribution, deletion, and failure status. No external provider calls.'
	);
} finally {
	await sql`delete from ai_usage where endpoint like 'https://knowledge-test.invalid/%'`;
	for (const id of documents) await sql`delete from knowledge_documents where id=${id}`;
	if (campaignId) await sql`delete from campaigns where id=${campaignId}`;
	if (cookie)
		await fetch(origin + '/logout', {
			method: 'POST',
			headers: { Origin: origin, Cookie: cookie },
			redirect: 'manual'
		});
	await sql.end();
}
