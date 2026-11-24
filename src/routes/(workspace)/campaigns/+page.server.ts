import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ parent }) => {
	const data = await parent();
	if (data.campaigns[0]) redirect(307, '/campaigns/' + data.campaigns[0].id);
	return {};
};
