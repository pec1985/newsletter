import { error, fail, redirect } from '@sveltejs/kit';
import { sql } from '#lib/server/db.js';
import { digest, hashPassword, verifyPassword } from '#lib/server/security.js';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ params, parent }) => {
	await parent();
	if (params.tab === 'api') redirect(303, '/settings/api-keys');
	if (
		![
			'account',
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
	return { settingsTab: params.tab };
};

export const actions: Actions = {
	credentials: async ({ params, locals, request, cookies }) => {
		if (params.tab !== 'account') error(404);
		if (!locals.user) redirect(303, '/login?next=%2Fsettings%2Faccount');
		const id = locals.user.id;
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
			if (!updated) return fail(400, { username, error: 'The current password is incorrect.' });
		} catch (cause) {
			if (cause instanceof Error && 'code' in cause && cause.code === '23505')
				return fail(409, { username, error: 'That username is already in use.' });
			throw cause;
		}
		locals.user.username = username;
		return { saved: true };
	}
};
