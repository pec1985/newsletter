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
		filterSql: audienceConditions.join('\nAND ')
	};
}

export async function audienceSummaries() {
	const audiences = await sql<Audience[]>`select * from audiences order by lower(name)`;
	return Promise.all(
		audiences.map(async (audience) => {
			const [summary] = await sql<
				{ recipients: number; locales: string[] }[]
			>`select count(*)::int as recipients,
			coalesce(array_agg(distinct c.locale order by c.locale), '{}'::text[]) as locales
			from contacts c where ${audienceMatch(audience)}`;
			return { ...audience, ...summary, ...previewQuery(audience) };
		})
	);
}
