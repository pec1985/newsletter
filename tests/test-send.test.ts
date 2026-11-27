import { expect, test } from 'bun:test';
import { newsletterContent, senderAddress } from '../src/lib/server/send-email';

const message = {
	email: 'editor@example.com',
	name: 'Editor',
	subject: 'Hello {{name}}',
	body: 'Hi **{{name}}**. [Read more](https://example.com/news)'
};

test('test email renders both formats and preserves authored links without tracking', () => {
	const content = newsletterContent(message);
	expect(content.Subject.Data).toBe('Hello Editor');
	expect(content.Body.Html.Data).toContain('<strong>Editor</strong>');
	expect(content.Body.Html.Data).toContain('href="https://example.com/news"');
	expect(content.Body.Text.Data).toContain('Hi **Editor**');
	expect(JSON.stringify(content)).not.toMatch(/track\/|unsubscribe/i);
	expect(content.Headers).toBeUndefined();
});

test('campaign delivery retains its open pixel and one-click unsubscribe', () => {
	const content = newsletterContent(message, {
		origin: new URL('https://newsletter.example'),
		token: 'abc'
	});
	expect(content.Body.Html.Data).toContain('https://newsletter.example/track/abc');
	expect(content.Body.Text.Data).toContain('https://newsletter.example/unsubscribe/abc');
	expect(content.Headers).toContainEqual({
		Name: 'List-Unsubscribe',
		Value: '<https://newsletter.example/unsubscribe/abc/one-click>'
	});
});

test('newsletter From address uses the configured sender name when present', () => {
	const email = 'info@volandoo.com';
	expect(senderAddress(email, 'Pedro Enrique')).toBe('"Pedro Enrique" <info@volandoo.com>');
	expect(senderAddress(email, 'Pedro "P", Enrique')).toBe(
		'"Pedro \\"P\\", Enrique" <info@volandoo.com>'
	);
	expect(senderAddress(email, 'José')).toBe('=?UTF-8?B?Sm9zw6k=?= <info@volandoo.com>');
	expect(senderAddress(email, 'Pedro\r\nEnrique')).toBe('"Pedro Enrique" <info@volandoo.com>');
	expect(senderAddress(email)).toBe(email);
	expect(senderAddress(email, '  ')).toBe(email);
});
