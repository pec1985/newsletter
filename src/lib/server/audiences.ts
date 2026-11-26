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

// Build only the predicates enabled for this audience.
export function audienceMatch(a: Audience) {
	const predicates = [sql`not c.unsubscribed and not c.suppressed`];
	if (a.plan !== null) predicates.push(sql`c.plan = ${a.plan}`);
	if (a.usage_label !== null) predicates.push(sql`c.usage = to_jsonb(${a.usage_label}::text)`);
	if (a.min_usage !== null || a.max_usage !== null)
		predicates.push(sql`jsonb_typeof(c.usage) = 'number'`);
	if (a.min_usage !== null)
		predicates.push(
			sql`c.usage ${a.min_exclusive ? sql`>` : sql`>=`} to_jsonb(${a.min_usage}::numeric)`
		);
	if (a.max_usage !== null)
		predicates.push(
			sql`c.usage ${a.max_exclusive ? sql`<` : sql`<=`} to_jsonb(${a.max_usage}::numeric)`
		);
	if (a.inactive_days !== null)
		predicates.push(sql`c.last_used_at < now() - ${a.inactive_days}::integer * interval '1 day'`);
	if (a.active_within_days !== null)
		predicates.push(
			sql`c.last_used_at >= now() - ${a.active_within_days}::integer * interval '1 day'`
		);
	return predicates.reduce((left, right) => sql`${left} and ${right}`);
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
			return { ...audience, ...summary };
		})
	);
}
