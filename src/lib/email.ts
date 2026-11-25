import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
export function personalizeEmail(text: string, name: string) {
	return text.replaceAll('{{name}}', () => name);
}

export function renderEmail(body: string, name?: string) {
	return sanitizeHtml(marked.parse(body, { async: false, breaks: true }) as string, {
		textFilter: name === undefined ? undefined : (text) => personalizeEmail(text, escapeHtml(name)),
		allowedTags: [
			'p',
			'br',
			'strong',
			'em',
			'a',
			'img',
			'ul',
			'ol',
			'li',
			'blockquote',
			'h1',
			'h2',
			'h3',
			'hr'
		],
		allowedAttributes: { a: ['href', 'title'], img: ['src', 'alt', 'width'] },
		allowedSchemes: ['https', 'http', 'mailto'],
		allowProtocolRelative: false,
		transformTags: {
			img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, width: '560' } })
		}
	});
}
export function escapeHtml(s: string) {
	return s.replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
	);
}
