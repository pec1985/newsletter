import { parseFilters } from '#lib/audience-filters.js';
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
		const comparisons = (key: string) => {
			const operators = form.getAll(key + '_operator');
			return form
				.getAll(key + '_value')
				.map((value, i) => ({ operator: String(operators[i]), value: String(value).trim() }));
		};
		const usage = comparisons('usage');
		const activity = comparisons('activity');
		const invalid = (message: string) =>
			fail(400, { message, id, values: { name, plan, usage, activity } });
		if (!usage.length || !activity.length) error(400, 'Reload the audience editor before saving.');
		if (!name || name.length > 100)
			return invalid('Give the audience a name of up to 100 characters.');
		if ((plan?.length ?? 0) > 200) return invalid('Enter a plan of up to 200 characters.');
		let filters;
		try {
			filters = parseFilters(usage, activity);
		} catch (cause) {
			return invalid(cause instanceof Error ? cause.message : 'Invalid audience filter.');
		}
		const values = { name, plan, ...filters };
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
