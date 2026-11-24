import { sql } from '#lib/server/db.js';
import { error } from '@sveltejs/kit';
export async function GET({ params }: import('./$types').RequestEvent) {
	if (!/^[a-f0-9-]{36}$/.test(params.id)) error(404);
	const [media] = await sql`select * from media where id=${params.id}`;
	if (!media) error(404);
	let bytes = media.data;
	if (media.remote_url) {
		const response = await fetch(media.remote_url, { signal: AbortSignal.timeout(15000) });
		if (!response.ok) error(502, 'Image unavailable');
		bytes = Buffer.from(await response.arrayBuffer());
	}
	return new Response(bytes, {
		headers: {
			'Content-Type': media.mime,
			'Cache-Control': 'public, max-age=31536000, immutable',
			'X-Content-Type-Options': 'nosniff'
		}
	});
}
