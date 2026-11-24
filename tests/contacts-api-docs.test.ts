import { expect, test } from 'bun:test';
import { contactsApiMarkdown, endpoints } from '../src/lib/contacts-api-docs';
test('LLM Markdown contains every documented endpoint and every complete request/response', () => {
	const markdown = contactsApiMarkdown('https://newsletter.example.com');
	expect(markdown).toContain('Base URL: https://newsletter.example.com');
	expect(endpoints).toHaveLength(6);
	for (const endpoint of endpoints) {
		expect(markdown).toContain(`### ${endpoint.method} ${endpoint.path}`);
		for (const example of endpoint.examples) {
			expect(markdown).toContain(example.request);
			expect(markdown).toContain(example.response);
		}
	}
	for (const detail of [
		'20,000',
		'16 MB',
		'next_cursor',
		'can_email',
		'subscribed',
		'suppressed',
		'401',
		'409',
		'YOUR_API_KEY',
		'source of truth',
		'revok'
	])
		expect(markdown.toLowerCase()).toContain(detail.toLowerCase());
	expect(markdown.match(/```/g)!.length % 2).toBe(0);
});
