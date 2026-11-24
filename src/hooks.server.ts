import type { Handle } from '@sveltejs/kit/hooks';
import { sql } from '#lib/server/db.js';
import { digest } from '#lib/server/security.js';
export const handle: Handle = async ({ event, resolve }) => {
	const session = event.cookies.get('session');
	if (session) {
		const [user] =
			await sql`select users.id, users.username from sessions join users on users.id=sessions.user_id where token_hash=${digest(session)} and expires_at>now()`;
		if (user) event.locals.user = { id: user.id, username: user.username };
	}
	return resolve(event, {
		transformPageChunk: ({ html }) =>
			html.replace('%paraglide.lang%', 'en').replace('%paraglide.dir%', 'ltr')
	});
};
