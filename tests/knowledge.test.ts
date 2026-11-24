import { test, expect } from 'bun:test';
import { chunkMarkdown } from '../src/lib/knowledge';
import { draftingInstructions } from '../src/lib/server/drafting-agent';
import { embeddingConnection } from '../src/lib/server/embeddings';
test('Markdown chunks preserve heading hierarchy and ignore headings in code fences', () => {
	const chunks = chunkMarkdown(
		'# Product\nOverview.\n## Onboarding\nInvite your team.\n```md\n# Not a section\n```\n## Billing\nInvoices.'
	);
	expect(chunks.map((c) => c.heading)).toEqual([
		'Product',
		'Product › Onboarding',
		'Product › Billing'
	]);
	expect(chunks[1].content).toContain('# Not a section');
});
test('large sections are bounded, overlapping, and retain the end of the document', () => {
	const text = 'Opening. ' + 'Long paragraph with details. '.repeat(2000) + ' FINAL_MARKER';
	const chunks = chunkMarkdown('# Manual\n' + text);
	expect(chunks.length).toBeGreaterThan(20);
	expect(chunks.every((c) => c.content.length <= 2400)).toBe(true);
	expect(chunks.at(-1)?.content).toContain('FINAL_MARKER');
	expect(chunks.every((c) => c.heading === 'Manual')).toBe(true);
});
test('global writing instructions stay separate from untrusted retrieved content', () => {
	const prompt = draftingInstructions(
		{
			companyContext: 'Builds software',
			companyTone: 'Direct',
			companyAudience: 'Founders',
			companyRules: 'No invented claims',
			companyTerminology: 'Workspace'
		},
		{ source_locale: 'en', subject: 'Test', body: 'Draft' }
	);
	for (const text of [
		'Builds software',
		'Direct',
		'Founders',
		'No invented claims',
		'Workspace',
		'UNTRUSTED REFERENCE DATA'
	])
		expect(prompt).toContain(text);
});
test('embedding profiles change with endpoint or model, not credential rotation', () => {
	const base = { aiBaseUrl: 'https://example.com/v1', aiKey: 'one', embeddingModel: 'embed' };
	expect(embeddingConnection(base).profile).toBe(
		embeddingConnection({ ...base, aiKey: 'two' }).profile
	);
	expect(embeddingConnection(base).profile).not.toBe(
		embeddingConnection({ ...base, embeddingModel: 'embed-new' }).profile
	);
	expect(
		embeddingConnection({
			...base,
			embeddingBaseUrl: 'https://other.example/v1',
			embeddingKey: 'separate'
		}).key
	).toBe('separate');
});
