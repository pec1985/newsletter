import { error, fail, redirect } from '@sveltejs/kit';
import { sql } from '#lib/server/db.js';
import { digest, hashPassword, verifyPassword } from '#lib/server/security.js';
import type { Actions, PageServerLoad } from './$types';

const credentialAttempts = new Map<string, { count: number; reset: number }>();
const credentialAttemptLimit = 5;
const credentialWindow = 15 * 60 * 1000;
export const load: PageServerLoad = async ({ params, parent }) => {
	await parent();
	if (params.tab === 'api') redirect(303, '/settings/api-keys');
	if (
		![
			'account',
			'team',
			'context',
			'knowledge',
			'ai',
			'sender',
			'delivery',
			'images',
			'api-keys',
			'api-docs'
		].includes(params.tab)
	)
		error(404, 'Settings page not found.');
	const members =
		params.tab === 'team'
			? await sql<{ username: string }[]>`select username from users order by username`
			: [];
	return { settingsTab: params.tab, members };
};

export const actions: Actions = {
	addMember: async ({ params, locals, request }) => {
		if (params.tab !== 'team') error(404);
		if (!locals.user) redirect(303, '/login?next=%2Fsettings%2Fteam');
		const form = await request.formData();
		const name = form.get('username');
		const username = typeof name === 'string' ? name.trim() : '';
		const password = form.get('password');
		if (!username || username.includes('\0') || username.length > 128)
			return fail(400, { error: 'Enter a username of up to 128 characters.' });
		if (typeof password !== 'string' || password.length < 8 || password.length > 1024)
			return fail(400, { username, error: 'Use a password between 8 and 1024 characters.' });
		const [member] = await sql`insert into users (username, password_hash)
			values (${username}, ${hashPassword(password)})
			on conflict (username) do nothing returning id`;
		if (!member) return fail(409, { username, error: 'That username is already in use.' });
		return { added: username };
	},
	credentials: async ({ params, locals, request, cookies }) => {
		if (params.tab !== 'account') error(404);
		if (!locals.user) redirect(303, '/login?next=%2Fsettings%2Faccount');
		const id = locals.user.id;
		const now = Date.now();
		let attempt = credentialAttempts.get(id);
		if (!attempt || attempt.reset <= now) {
			attempt = { count: 0, reset: now + credentialWindow };
			credentialAttempts.set(id, attempt);
		}
		if (attempt.count >= credentialAttemptLimit)
			return fail(429, { error: 'Too many password attempts. Try again in 15 minutes.' });
		const form = await request.formData();
		const username = form.get('username');
		const current = form.get('currentPassword');
		const password = form.get('newPassword') ?? '';
		const confirmation = form.get('confirmation') ?? '';
		if (typeof username !== 'string' || !username.trim() || username.includes('\0'))
			return fail(400, { error: 'Enter a username.' });
		if (
			typeof password !== 'string' ||
			(password && (password.length < 8 || password.length > 1024))
		)
			return fail(400, { username, error: 'Use a new password between 8 and 1024 characters.' });
		if (password !== confirmation)
			return fail(400, { username, error: 'The new passwords do not match.' });
		try {
			const updated = await sql.begin(async (tx) => {
				const [user] = await tx`select password_hash from users where id=${id} for update`;
				if (
					!user ||
					typeof current !== 'string' ||
					!current ||
					current.length > 1024 ||
					!verifyPassword(current, user.password_hash)
				)
					return false;
				await tx`update users set username=${username}, password_hash=${password ? hashPassword(password) : user.password_hash} where id=${id}`;
				if (password)
					await tx`delete from sessions where user_id=${id} and token_hash<>${digest(cookies.get('session')!)}`;
				return true;
			});
			if (!updated) {
				attempt.count++;
				return fail(400, { username, error: 'The current password is incorrect.' });
			}
			credentialAttempts.delete(id);
		} catch (cause) {
			if (cause instanceof Error && 'code' in cause && cause.code === '23505')
				return fail(409, { username, error: 'That username is already in use.' });
			throw cause;
		}
		locals.user.username = username;
		return { saved: true };
	}
};
