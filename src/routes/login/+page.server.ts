import { fail, redirect } from '@sveltejs/kit';
import { sql } from '#lib/server/db.js';
import { digest, token, verifyPassword } from '#lib/server/security.js';
import type { Actions, PageServerLoad } from './$types';
const attempts = new Map<string, { count: number; reset: number }>();
function destination(url: URL) {
	const next = url.searchParams.get('next');
	return next && /^\/(campaigns|contacts|settings)(?:\/[^\\?#]*)?$/.test(next)
		? next
		: '/campaigns';
}
export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.user) redirect(303, destination(url));
};
export const actions: Actions = {
	default: async ({ request, cookies, url, getClientAddress }) => {
		const ip = getClientAddress();
		let attempt = attempts.get(ip);
		if (!attempt || attempt.reset < Date.now()) {
			attempt = { count: 0, reset: Date.now() + 60000 };
			attempts.set(ip, attempt);
		}
		if (++attempt.count > 10)
			return fail(429, { error: 'Too many attempts. Please try again in a minute.' });
		const form = await request.formData();
		const username = String(form.get('username') || '');
		const password = String(form.get('password') || '');
		const value = token();
		const authenticated = await sql.begin(async (tx) => {
			const [user] =
				await tx`select id,password_hash from users where username=${username} for share`;
			if (!user || password.length > 1024 || !verifyPassword(password, user.password_hash))
				return false;
			await tx`insert into sessions (token_hash,user_id,expires_at) values (${digest(value)},${user.id},now()+interval '7 days')`;
			return true;
		});
		if (!authenticated) return fail(400, { error: 'That username or password isn’t right.' });
		cookies.set('session', value, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: url.protocol === 'https:',
			maxAge: 604800
		});
		redirect(303, destination(url));
	}
};
