import { sql } from './db';

// Shared by the builder, compose, review and the final delivery snapshot.
export const audienceMatch = sql`not c.unsubscribed and not c.suppressed
	and (a.plan is null or c.plan = a.plan)
	and (a.usage_label is null or c.usage = to_jsonb(a.usage_label))
	and (a.min_usage is null or (jsonb_typeof(c.usage) = 'number' and c.usage >= to_jsonb(a.min_usage) and (not a.min_exclusive or c.usage <> to_jsonb(a.min_usage))))
	and (a.max_usage is null or (jsonb_typeof(c.usage) = 'number' and c.usage <= to_jsonb(a.max_usage) and (not a.max_exclusive or c.usage <> to_jsonb(a.max_usage))))
	and (a.active_within_days is null or c.last_used_at >= now() - a.active_within_days * interval '1 day')
	and (a.inactive_days is null or c.last_used_at < now() - a.inactive_days * interval '1 day')`;

export function audienceSummaries() {
	return sql`select a.*, count(c.id)::int as recipients,
		coalesce(array_agg(distinct c.locale order by c.locale) filter(where c.locale is not null), '{}'::text[]) as locales
		from audiences a left join contacts c on ${audienceMatch} group by a.id order by lower(a.name)`;
}
