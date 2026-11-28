import type { TransactionSql } from 'postgres';
import { sql } from './db';

export type Audience = {
	id: string;
	name: string;
	plan: string | null;
	usage_label: string | null;
	min_usage: string | null;
	max_usage: string | null;
	min_exclusive: boolean;
	max_exclusive: boolean;
	inactive_days: number | null;
	active_within_days: number | null;
};

// Use the same conditions for parameterized delivery queries and the read-only SQL preview.
function conditions<T>(
	a: Audience,
	clause: (parts: TemplateStringsArray, ...values: (string | number)[]) => T
): T[] {
	const predicates = [clause`NOT c.unsubscribed AND NOT c.suppressed`];
	if (a.plan !== null) predicates.push(clause`c.plan = ${a.plan}`);
	if (a.usage_label !== null) predicates.push(clause`c.usage = to_jsonb(${a.usage_label}::text)`);
	if (a.min_usage !== null && a.min_usage === a.max_usage && !a.min_exclusive && !a.max_exclusive) {
		predicates.push(clause`c.usage = to_jsonb(${a.min_usage}::numeric)`);
	} else {
		if (a.min_usage !== null || a.max_usage !== null)
			predicates.push(clause`jsonb_typeof(c.usage) = 'number'`);
		if (a.min_usage !== null)
			predicates.push(
				a.min_exclusive
					? clause`c.usage > to_jsonb(${a.min_usage}::numeric)`
					: clause`c.usage >= to_jsonb(${a.min_usage}::numeric)`
			);
		if (a.max_usage !== null)
			predicates.push(
				a.max_exclusive
					? clause`c.usage < to_jsonb(${a.max_usage}::numeric)`
					: clause`c.usage <= to_jsonb(${a.max_usage}::numeric)`
			);
	}
	if (a.inactive_days !== null)
		predicates.push(clause`c.last_used_at < now() - make_interval(days => ${a.inactive_days})`);
	if (a.active_within_days !== null)
		predicates.push(
			clause`c.last_used_at >= now() - make_interval(days => ${a.active_within_days})`
		);
	return predicates;
}

export function audienceMatch(a: Audience) {
	return conditions(a, (parts, ...values) => sql(parts, ...values)).reduce(
		(left, right) => sql`${left} and ${right}`
	);
}

export async function countAudienceMatches(audiences: Audience[]) {
	return countMatches(audiences.map((a) => ({ key: a.id, predicate: audienceMatch(a) })));
}

export async function scheduledRecipientCounts(
	campaigns: { id: string; all_users: boolean; audience_ids: string[] }[],
	audiences: Audience[]
) {
	const selections = new Map<string, ReturnType<typeof selectionMatch>>();
	// The layout query returns audience IDs in canonical order.
	const keys = campaigns.map((campaign) => {
		const key = campaign.all_users ? 'all' : campaign.audience_ids.join(',');
		if (!selections.has(key)) {
			selections.set(
				key,
				selectionMatch(
					campaign.all_users,
					audiences.filter((a) => campaign.audience_ids.includes(a.id))
				)
			);
		}
		return key;
	});
	const totals = await countMatches(
		Array.from(selections, ([key, predicate]) => ({ key, predicate }))
	);
	return Object.fromEntries(campaigns.map((campaign, i) => [campaign.id, totals[keys[i]]]));
}

async function countMatches(
	selections: { key: string; predicate: ReturnType<typeof selectionMatch> }[]
) {
	const counts: Record<string, number> = {};
	// Each batch shares a contact scan. Run batches serially to bound query size and pool usage.
	const batchSize = 64;
	for (let start = 0; start < selections.length; start += batchSize) {
		const batch = selections.slice(start, start + batchSize);
		const columns = batch
			.map(({ predicate }, i) => sql`count(*) filter (where ${predicate}) as ${sql(String(i))}`)
			.reduce((left, right) => sql`${left}, ${right}`);
		const [row] = await sql<
			Record<string, string>[]
		>`select ${columns} from contacts c where ${selectionMatch(true, [])}`;
		batch.forEach(({ key }, i) => {
			counts[key] = Number(row[i]);
		});
	}
	return counts;
}

function previewQuery(a: Audience) {
	const predicates = conditions(a, (parts, ...values) =>
		values.reduce<string>((text, value, i) => {
			const literal =
				typeof value === 'number' ? String(value) : "'" + value.replaceAll("'", "''") + "'";
			return text + literal + parts[i + 1];
		}, parts[0])
	);
	const [, ...audienceConditions] = predicates;
	return {
		query: 'SELECT c.* FROM contacts AS c\nWHERE ' + predicates.join('\n  AND ') + ';',
		filterSql: audienceConditions.join(' AND ')
	};
}

export async function listAudiences() {
	const audiences = await sql<Audience[]>`select * from audiences order by lower(name)`;
	return audiences.map((audience) => ({ ...audience, ...previewQuery(audience) }));
}

export function selectionMatch(all: boolean, audiences: Audience[]) {
	if (all) return sql`not c.unsubscribed and not c.suppressed`;
	if (!audiences.length) return sql`false`;
	return audiences
		.map((audience) => sql`(${audienceMatch(audience)})`)
		.reduce((left, right) => sql`${left} or ${right}`);
}

export async function selectionSummary(
	predicate: ReturnType<typeof selectionMatch>,
	db: TransactionSql | typeof sql = sql
) {
	const [summary] = await db<
		{ recipients: number; locales: string[] }[]
	>`select count(*)::int as recipients,coalesce(array_agg(distinct c.locale order by c.locale),'{}'::text[]) as locales from contacts c where ${predicate}`;
	return summary;
}
