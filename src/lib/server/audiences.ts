import { error } from '@sveltejs/kit';
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

export function readAudienceSelection(input: {
	audience_ids?: unknown;
	audience_id?: unknown;
	all_users?: unknown;
}) {
	const ids = input.audience_ids ?? (input.audience_id === null ? [] : [input.audience_id]);
	if (
		!Array.isArray(ids) ||
		!ids.every(
			(id: unknown) =>
				typeof id === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)
		) ||
		(input.all_users !== undefined && typeof input.all_users !== 'boolean') ||
		(input.all_users && ids.length)
	)
		error(400, 'Choose All users or a set of saved audiences.');
	return {
		ids: [...new Set<string>(ids.map((id) => id.toLowerCase()))].sort(),
		all: input.all_users === true
	};
}

export function selectionMatch(all: boolean, audiences: Audience[]) {
	if (all) return sql`not c.unsubscribed and not c.suppressed`;
	if (!audiences.length) return sql`false`;
	return audiences
		.map((audience) => sql`(${audienceMatch(audience)})`)
		.reduce((left, right) => sql`${left} or ${right}`);
}

export async function loadSelectionSummary(
	db: TransactionSql,
	selection: ReturnType<typeof readAudienceSelection>
) {
	const audiences = selection.ids.length
		? await db<
				Audience[]
			>`select * from audiences where id=any(${selection.ids}::uuid[]) order by id for share`
		: [];
	if (audiences.length !== selection.ids.length)
		error(409, 'An audience has been removed. Refresh the draft and choose again.');
	return selectionSummary(selectionMatch(selection.all, audiences), db);
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
