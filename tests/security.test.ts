import { describe, expect, test } from 'bun:test';
import { hashPassword, verifyPassword, encrypt, decrypt } from '../src/lib/server/security';
import { personalizeEmail, renderEmail } from '../src/lib/email';
describe('credentials and email rendering', () => {
	test('passwords are salted and verified', () => {
		const hash = hashPassword('admin');
		expect(hash).not.toBe(hashPassword('admin'));
		expect(verifyPassword('admin', hash)).toBe(true);
		expect(verifyPassword('wrong', hash)).toBe(false);
	});
	test('integration secrets are encrypted and authenticated', () => {
		const encrypted = encrypt('private-test-key');
		expect(encrypted).not.toContain('private-test-key');
		expect(decrypt(encrypted)).toBe('private-test-key');
		const pieces = encrypted.split(':');
		pieces[2] = (pieces[2][0] === '0' ? '1' : '0') + pieces[2].slice(1);
		expect(() => decrypt(pieces.join(':'))).toThrow();
	});
	test('recipient names remain literal text in personalized emails', () => {
		const draft = 'Hi **{{name}}**, from {{name}}.';
		const name = 'Ana & <b>**Lee**</b> $&';
		const htmlName = 'Ana &amp; &lt;b&gt;**Lee**&lt;/b&gt; $&amp;';
		expect(renderEmail(draft)).toContain('{{name}}');
		expect(renderEmail(draft, name)).toContain(
			`Hi <strong>${htmlName}</strong>, from ${htmlName}.`
		);
		expect(personalizeEmail(draft, name)).toBe(`Hi **${name}**, from ${name}.`);
		expect(personalizeEmail('{{name}}', '')).toBe('');
	});
	test('emails keep links and images but remove executable content', () => {
		const html = renderEmail(
			'[Visit](https://example.com)\n\n![Photo](https://example.com/image.png)\n\n<script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">bad</a>'
		);
		expect(html).toContain('href="https://example.com"');
		expect(html).toContain('alt="Photo"');
		expect(html).not.toContain('<script');
		expect(html).not.toContain('onerror');
		expect(html).not.toContain('javascript:');
	});
});
