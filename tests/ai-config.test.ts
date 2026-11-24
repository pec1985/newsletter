import { expect, test } from 'bun:test';
import { aiConnection, normalizeAiBaseUrl } from '../src/lib/server/ai-config';
test('routes drafting and translation to their respective models', () => {
	const config = {
		aiBaseUrl: 'https://provider.example/custom/v1/',
		aiDraftModel: 'writer',
		aiTranslationModel: 'translator'
	};
	expect(aiConnection(config, 'draft')).toEqual({
		endpoint: 'https://provider.example/custom/v1/chat/completions',
		model: 'writer'
	});
	expect(aiConnection(config, 'translate').model).toBe('translator');
});
test('preserves existing model settings and supports local compatible endpoints', () => {
	expect(aiConnection({ aiModel: 'existing-model' }, 'translate').model).toBe('existing-model');
	expect(aiConnection({ aiBaseUrl: 'http://localhost:1234/v1/' }, 'draft').endpoint).toBe(
		'http://localhost:1234/v1/chat/completions'
	);
});
test('rejects malformed endpoints and credentials in URLs', () => {
	for (const value of [
		'invalid',
		'file:///tmp/ai',
		'https://user:secret@example.com/v1',
		'https://example.com/v1?token=secret',
		'https://example.com/v1#fragment'
	])
		expect(() => normalizeAiBaseUrl(value)).toThrow();
});
