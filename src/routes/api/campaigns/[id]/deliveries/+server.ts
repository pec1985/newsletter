import { error, json } from '@sveltejs/kit';
import { sql } from '#lib/server/db.js';
import type { DeliveryRow } from '#lib/delivery-stats.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) error(401, 'Sign in to continue.');
	const [campaign] = await sql`select id from campaigns where id::text=${params.id}`;
	if (!campaign) error(404, 'Campaign not found.');
	const search = (url.searchParams.get('q') || '').trim().slice(0, 200);
	const status = url.searchParams.get('status') || 'all';
	const locale = (url.searchParams.get('locale') || '').slice(0, 40);
	if (!['all', 'queued', 'processing', 'sent', 'failed', 'suppressed', 'opened'].includes(status))
		error(400, 'Invalid delivery status.');
	const requestedPage = Number(url.searchParams.get('page') || '1');
	if (!Number.isSafeInteger(requestedPage) || requestedPage < 1) error(400, 'Invalid page.');
	const pageSize = 50;
	const where = sql`campaign_id=${campaign.id}
		and (${search}='' or position(lower(${search}) in lower(name || ' ' || email))>0)
		and (${locale}='' or locale=${locale})
		and (${status}='all' or status=${status} or (${status}='opened' and first_opened_at is not null))`;
	const [count] = await sql`select count(*)::int as total from deliveries where ${where}`;
	const page = Math.min(requestedPage, Math.max(1, Math.ceil(count.total / pageSize)));
	const rows = await sql<DeliveryRow[]>`select id,name,email,locale,status,open_count,error,sent_at
		from deliveries where ${where} order by id limit ${pageSize} offset ${(page - 1) * pageSize}`;
	return json(
		{ rows: [...rows], total: count.total, page, pageSize },
		{ headers: { 'Cache-Control': 'no-store' } }
	);
};
