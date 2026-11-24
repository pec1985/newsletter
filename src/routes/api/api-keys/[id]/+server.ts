import { error } from '@sveltejs/kit';
import { sql } from '#lib/server/db.js';
import { authorizeKeyManagement } from '#lib/server/api-keys.js';
import { contactId } from '#lib/server/contacts.js';
import type { RequestHandler } from './$types';
export const DELETE: RequestHandler = async ({ request, locals, url, params }) => {
	authorizeKeyManagement(request, locals.user, url);
	const [key] =
		await sql`update api_keys set revoked_at=coalesce(revoked_at,now()) where id=${contactId(params.id)} returning id`;
	if (!key) error(404, 'API key not found.');
	return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
};
