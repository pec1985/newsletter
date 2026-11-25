import { unsubscribeContact, recordUnsubscribe } from '#lib/server/unsubscribe-contact.js';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
	const type = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
	if (type !== 'application/x-www-form-urlencoded' && type !== 'multipart/form-data') error(415);
	const form = await request.formData().catch(() => error(400));
	const values = form.getAll('List-Unsubscribe');
	if (values.length !== 1 || values[0] !== 'One-Click') error(400);
	const contact = await unsubscribeContact(params.token);
	await recordUnsubscribe(contact.id, contact.email, 'other');
	return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
};
