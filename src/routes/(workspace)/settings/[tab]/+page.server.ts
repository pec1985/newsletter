import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ params, parent }) => {
	await parent();
	if (!['context', 'knowledge', 'ai', 'sender', 'delivery', 'images', 'api'].includes(params.tab))
		error(404, 'Settings page not found.');
	return { settingsTab: params.tab };
};
