import { error } from '@sveltejs/kit';
import { sql } from '#lib/server/db.js';
import { authorizeKeyManagement, createApiKey, keySummaryColumns } from '#lib/server/api-keys.js';
import { contactJson } from '#lib/server/contacts.js';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async ({ request, locals, url }) => {
	authorizeKeyManagement(request, locals.user, url);
	return contactJson({
		keys: await sql`select ${keySummaryColumns} from api_keys order by created_at desc,id desc`
	});
};
export const POST: RequestHandler = async ({ request, locals, url }) => {
	authorizeKeyManagement(request, locals.user, url);
	let input;
	try {
		input = await request.json();
	} catch {
		error(400, 'Provide a JSON object with a name.');
	}
	return contactJson(await createApiKey(input?.name, locals.user!.id), 201);
};
