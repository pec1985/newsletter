import { error } from '@sveltejs/kit';
import { sql } from '#lib/server/db.js';
import {
	authorizeContacts,
	contactBody,
	contactColumns,
	contactId,
	contactJson,
	updateContact,
	deleteContact
} from '#lib/server/contacts.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, locals, url, params }) => {
	await authorizeContacts(request, locals.user, url);
	const [contact] =
		await sql`select ${contactColumns} from contacts where id=${contactId(params.id)}`;
	if (!contact) error(404, 'Contact not found.');
	return contactJson({ contact });
};
export const PATCH: RequestHandler = async ({ request, locals, url, params }) => {
	await authorizeContacts(request, locals.user, url);
	return contactJson({ contact: await updateContact(params.id, await contactBody(request)) });
};
export const DELETE: RequestHandler = async ({ request, locals, url, params }) => {
	await authorizeContacts(request, locals.user, url);
	await deleteContact(params.id);
	return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
};
