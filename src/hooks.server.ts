import type { Handle } from '@sveltejs/kit/hooks';
import { sql } from '#lib/server/db.js';
import { digest } from '#lib/server/security.js';
export const handle: Handle = async ({ event, resolve }) => {
	const { request } = event;
	if (request.method === 'POST' && event.route.id === '/unsubscribe/[token]/one-click')
		return resolve(event);
	const type = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
	if (
		['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) &&
		(!type ||
			[
				'application/x-www-form-urlencoded',
				'multipart/form-data',
				'text/plain',
				'application/x-sveltekit-formdata'
			].includes(type)) &&
		request.headers.get('origin') !== event.url.origin
	)
		return new Response('Invalid request origin.', { status: 403 });
	const session = event.cookies.get('session');
	if (session) {
		const [user] =
			await sql`select users.id, users.username from sessions join users on users.id=sessions.user_id where token_hash=${digest(session)} and expires_at>now()`;
		if (user) event.locals.user = { id: user.id, username: user.username };
	}
	return resolve(event, {
		transformPageChunk: ({ html }) =>
			html
				.replace('%paraglide.lang%', event.locals.pageLanguage || 'en')
				.replace('%paraglide.dir%', event.locals.pageLanguage ? 'auto' : 'ltr')
	});
};
