import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ params, parent }) => {
	const data = await parent();
	if (!data.campaigns.some((c) => c.id === params.id)) error(404, 'Campaign not found.');
	return { campaignId: params.id };
};
