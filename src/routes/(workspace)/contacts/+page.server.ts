import { emailLocale, validLocale } from '#lib/email-locale.js';
import { sql } from '#lib/server/db.js';
import type { PageServerLoad } from './$types';

const pageSize = 50;

export const load: PageServerLoad = async ({ url, parent }) => {
	await parent();
	const query = url.searchParams.get('q') || '';
	const filterLocale = url.searchParams.get('locale') || 'all';
	const locale =
		filterLocale !== 'all' && validLocale(filterLocale) ? emailLocale(filterLocale) : filterLocale;
	const permission = url.searchParams.get('permission') || 'all';
	const requestedPage = Number(url.searchParams.get('page'));
	const filter = sql`where true
		${query ? sql`and strpos(lower(name || ' ' || email), lower(${query})) > 0` : sql``}
		${locale !== 'all' ? sql`and locale = ${locale}` : sql``}
		${permission === 'allowed' ? sql`and not (unsubscribed or suppressed)` : sql``}
		${permission === 'blocked' ? sql`and (unsubscribed or suppressed)` : sql``}`;
	const [[{ total }], languages] = await Promise.all([
		sql<{ total: number }[]>`select count(*)::int as total from contacts ${filter}`,
		sql<{ locale: string }[]>`select distinct locale from contacts order by locale`
	]);
	const pages = Math.max(1, Math.ceil(total / pageSize));
	const page = Number.isSafeInteger(requestedPage)
		? Math.max(1, Math.min(requestedPage, pages))
		: 1;
	const offset = (page - 1) * pageSize;
	const rows =
		await sql`select id, name, email, locale, plan, usage, last_used_at, unsubscribed, suppressed, unsubscribe_reason
		from contacts ${filter} order by name, id limit ${pageSize} offset ${offset}`;
	return {
		contactList: {
			rows: [...rows],
			total,
			page,
			pages,
			offset,
			query,
			locale,
			permission,
			locales: [...new Set(['en', 'es', ...languages.map((row) => row.locale)])]
		}
	};
};
