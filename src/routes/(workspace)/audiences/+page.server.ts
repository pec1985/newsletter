import { error, fail, redirect } from '@sveltejs/kit';
import { sql } from '#lib/server/db.js';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) error(401, 'Sign in to manage audiences.');
		const form = await request.formData();
		const field = (key: string) => String(form.get(key) ?? '').trim();
		const id = field('id');
		const name = field('name');
		const plan = field('plan') || null;
		const usage_label = field('usage_label') || null;
		const numeric = (key: string) => (field(key) ? Number(field(key)) : null);
		const min_usage = numeric('min_usage');
		const max_usage = numeric('max_usage');
		const active_within_days = numeric('active_within_days');
		const inactive_days = numeric('inactive_days');
		const values = {
			name,
			plan,
			usage_label,
			min_usage,
			max_usage,
			active_within_days,
			inactive_days
		};
		const invalid = (message: string) => fail(400, { message, values, id });
		if (!name || name.length > 100)
			return invalid('Give the audience a name of up to 100 characters.');
		if ((plan?.length ?? 0) > 200 || (usage_label?.length ?? 0) > 200)
			return invalid('Plan and usage labels can contain up to 200 characters.');
		if ([min_usage, max_usage].some((n) => n !== null && !Number.isFinite(n)))
			return invalid('Enter a valid numeric usage.');
		if (usage_label && (min_usage !== null || max_usage !== null))
			return invalid('Choose either a usage label or numeric usage limits.');
		if (min_usage !== null && max_usage !== null && min_usage > max_usage)
			return invalid('Minimum usage must be at most maximum usage.');
		if (
			[active_within_days, inactive_days].some(
				(n) => n !== null && (!Number.isInteger(n) || n < 1 || n > 36500)
			)
		)
			return invalid('Enter a whole number of days between 1 and 36,500.');
		if (
			active_within_days !== null &&
			inactive_days !== null &&
			active_within_days <= inactive_days
		)
			return invalid('The activity window must include at least one day.');
		try {
			if (id) {
				const rows =
					await sql`update audiences set ${sql(values)} where id::text=${id} returning id`;
				if (!rows.length) error(404, 'Audience not found.');
			} else await sql`insert into audiences ${sql(values)}`;
		} catch (cause) {
			if (cause instanceof Error && 'code' in cause && cause.code === '23505')
				return invalid('An audience already uses this name.');
			throw cause;
		}
		redirect(303, '/audiences');
	}
};
