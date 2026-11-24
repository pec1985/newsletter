export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export type KnowledgeSource = {
	id: string;
	documentId: string;
	title: string;
	filename: string;
	heading: string;
	content: string;
	revision: number;
};
export type MarkdownChunk = { heading: string; content: string };
// Keep sections separate and use bounded overlapping windows for oversized sections.
export function chunkMarkdown(markdown: string, maxLength = 2400, overlap = 200): MarkdownChunk[] {
	if (maxLength < 100 || overlap < 0 || overlap >= maxLength)
		throw new Error('Invalid chunk limits.');
	const chunks: MarkdownChunk[] = [];
	const headings: string[] = [];
	let heading = 'Introduction',
		lines: string[] = [],
		fence = '';
	function flush() {
		const text = lines.join('\n').trim();
		lines = [];
		let start = 0;
		while (start < text.length) {
			let end = Math.min(start + maxLength, text.length);
			if (end < text.length) {
				const paragraph = text.lastIndexOf('\n\n', end);
				const newline = text.lastIndexOf('\n', end);
				const space = text.lastIndexOf(' ', end);
				const boundary =
					paragraph > start + maxLength / 2
						? paragraph
						: newline > start + maxLength / 2
							? newline
							: space;
				if (boundary > start + maxLength / 2) end = boundary;
			}
			const content = text.slice(start, end).trim();
			if (content) chunks.push({ heading, content });
			if (end === text.length) break;
			start = end - overlap;
		}
	}
	for (const line of markdown.replaceAll('\r\n', '\n').split('\n')) {
		const codeFence = line.match(/^\s*(`{3,}|~{3,})/);
		if (codeFence) {
			if (!fence) fence = codeFence[1][0];
			else if (codeFence[1][0] === fence) fence = '';
		}
		const match = !fence && line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
		if (match) {
			flush();
			headings.length = match[1].length - 1;
			headings[match[1].length - 1] = match[2];
			heading = headings.filter(Boolean).join(' › ');
		} else lines.push(line);
	}
	flush();
	return chunks;
}
