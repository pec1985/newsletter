import { json, error } from '@sveltejs/kit';
import { sql } from '#lib/server/db.js';
import { digest } from '#lib/server/security.js';
import { MAX_DOCUMENT_BYTES } from '#lib/knowledge.js';
import { searchKnowledge } from '#lib/server/knowledge-search.js';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = async ({ request, locals, url, params }) => {
	if (!locals.user) error(401, 'Sign in to continue.');
	if (request.headers.get('origin') !== url.origin) error(403, 'Invalid request origin.');
	try {
		if (params.action === 'upload') {
			const form = await request.formData();
			const file = form.get('file');
			const id = form.get('id');
			if (
				!(file instanceof File) ||
				!/^.+\.(md|markdown|txt)$/i.test(file.name) ||
				file.size > MAX_DOCUMENT_BYTES ||
				file.size === 0
			)
				error(400, 'Choose a non-empty Markdown or text file up to 10 MB.');
			const markdown = await file.text();
			if (!markdown.trim() || markdown.includes('\0'))
				error(400, 'The file must contain plain Markdown or text.');
			const title = String(form.get('title') || file.name)
				.trim()
				.slice(0, 200);
			const hash = digest(markdown);
			if (typeof id === 'string' && id) {
				const result = await sql.begin(async (tx) => {
					const [old] = await tx`select * from knowledge_documents where id=${id} for update`;
					if (!old) error(404, 'Document not found.');
					if (old.status === 'indexing')
						error(409, 'Wait for indexing to finish before replacing this document.');
					if (old.content_hash === hash && old.status === 'ready') return { id, unchanged: true };
					await tx`update knowledge_documents set title=${title},filename=${file.name},markdown=${markdown},content_hash=${hash},revision=revision+1,status='pending',error=null,indexed_chunks=0,updated_at=now() where id=${id}`;
					return { id, unchanged: false };
				});
				return json(result);
			}
			const [document] =
				await sql`insert into knowledge_documents(title,filename,markdown,content_hash) values (${title},${file.name},${markdown},${hash}) returning id`;
			return json(document);
		}
		const input = await request.json();
		if (params.action === 'search') {
			if (typeof input.query !== 'string') error(400, 'Enter a search query.');
			return json(await searchKnowledge(input.query));
		}
		if (!['reindex', 'delete'].includes(params.action)) error(404);
		await sql.begin(async (tx) => {
			const [document] =
				await tx`select status from knowledge_documents where id=${input.id} for update`;
			if (!document) error(404, 'Document not found.');
			if (document.status === 'indexing')
				error(409, 'Wait for indexing to finish before changing this document.');
			if (params.action === 'delete')
				await tx`delete from knowledge_documents where id=${input.id}`;
			else
				await tx`update knowledge_documents set revision=revision+1,status='pending',error=null,indexed_chunks=0,updated_at=now() where id=${input.id}`;
		});
		return json({ ok: true });
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		return json(
			{ message: e instanceof Error ? e.message : 'Knowledge operation failed.' },
			{ status: 400 }
		);
	}
};
