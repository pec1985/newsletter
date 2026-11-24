import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ params, parent }) => {
	await parent();
	if (params.tab === 'api') redirect(303, '/settings/api-keys');
	if (
		![
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
