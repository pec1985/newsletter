import { redirect } from '@sveltejs/kit';
import { sql } from '#lib/server/db.js';
import { digest } from '#lib/server/security.js';
export async function POST({ cookies, request, url }: import('./$types').RequestEvent) {
	if (request.headers.get('origin') !== url.origin)
		return new Response('Forbidden', { status: 403 });
	const session = cookies.get('session');
	if (session) await sql`delete from sessions where token_hash=${digest(session)}`;
	cookies.delete('session', { path: '/' });
	redirect(303, '/login');
}
