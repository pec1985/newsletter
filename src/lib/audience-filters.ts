export type Comparison = { operator: string; value: string };
export const usageOperators = ['=', '<', '>', '<=', '>='];
export const activityOperators = ['<', '>='];
const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

type StoredFilters = {
	usage_label?: string | null;
	min_usage?: number | string | null;
	max_usage?: number | string | null;
	min_exclusive?: boolean;
	max_exclusive?: boolean;
	active_within_days?: number | null;
	inactive_days?: number | null;
};

export function usageRows(a: StoredFilters = {}): Comparison[] {
	if (a.usage_label != null) {
		const label = a.usage_label;
		return [
			{
				operator: '=',
				value: decimal.test(label) || label.startsWith('"') ? JSON.stringify(label) : label
			}
		];
	}
	if (
		a.min_usage != null &&
		a.max_usage != null &&
		String(a.min_usage) === String(a.max_usage) &&
		!a.min_exclusive &&
		!a.max_exclusive
	)
		return [{ operator: '=', value: String(a.min_usage) }];
	const rows = [];
	if (a.min_usage != null)
		rows.push({ operator: a.min_exclusive ? '>' : '>=', value: String(a.min_usage) });
	if (a.max_usage != null)
		rows.push({ operator: a.max_exclusive ? '<' : '<=', value: String(a.max_usage) });
	return rows.length ? rows : [{ operator: '=', value: '' }];
}

export function activityRows(a: StoredFilters = {}): Comparison[] {
	const rows = [];
	if (a.inactive_days != null) rows.push({ operator: '<', value: String(a.inactive_days) });
	if (a.active_within_days != null)
		rows.push({ operator: '>=', value: String(a.active_within_days) });
	return rows.length ? rows : [{ operator: '<', value: '' }];
}

export function parseFilters(usage: Comparison[], activity: Comparison[]) {
	const fields = {
		usage_label: null as string | null,
		min_usage: null as number | null,
		max_usage: null as number | null,
		min_exclusive: false,
		max_exclusive: false,
		active_within_days: null as number | null,
		inactive_days: null as number | null
	};
	for (const { operator, value } of usage) {
		if (!value) continue;
		if (!usageOperators.includes(operator)) throw new Error('Choose a usage operator.');
		if (!decimal.test(value)) {
			if (operator !== '=')
				throw new Error('Use a number for ordered comparisons, or choose = for a usage label.');
			let label = value;
			if (value.startsWith('"')) {
				try {
					label = JSON.parse(value);
				} catch {
					throw new Error('Use matching double quotes around the usage label.');
				}
			}
			if (!label.trim() || label.length > 200 || fields.usage_label !== null)
				throw new Error('Enter one usage label of up to 200 characters.');
			fields.usage_label = label;
			continue;
		}
		const num = Number(value);
		if (!Number.isFinite(num)) throw new Error('Enter a finite usage number.');
		if (['=', '>', '>='].includes(operator)) {
			if (fields.min_usage !== null) throw new Error('Choose one lower usage limit.');
			fields.min_usage = num;
			fields.min_exclusive = operator === '>';
		}
		if (['=', '<', '<='].includes(operator)) {
			if (fields.max_usage !== null) throw new Error('Choose one upper usage limit.');
			fields.max_usage = num;
			fields.max_exclusive = operator === '<';
		}
	}
	if (fields.usage_label !== null && (fields.min_usage !== null || fields.max_usage !== null))
		throw new Error('Use either a usage label or a numeric comparison.');
	if (
		fields.min_usage !== null &&
		fields.max_usage !== null &&
		(fields.min_usage > fields.max_usage ||
			(fields.min_usage === fields.max_usage && (fields.min_exclusive || fields.max_exclusive)))
	)
		throw new Error('Choose usage limits that overlap.');
	for (const { operator, value } of activity) {
		if (!value) continue;
		const days = Number(value);
		if (
			!activityOperators.includes(operator) ||
			!Number.isInteger(days) ||
			days < 1 ||
			days > 36500
		)
			throw new Error('Enter a whole number of days between 1 and 36,500.');
		const key = operator === '<' ? 'inactive_days' : 'active_within_days';
		if (fields[key] !== null) throw new Error('Choose one limit for each last usage operator.');
		fields[key] = days;
	}
	if (
		fields.inactive_days !== null &&
		fields.active_within_days !== null &&
		fields.inactive_days >= fields.active_within_days
	)
		throw new Error('Choose last usage limits that overlap.');
	return fields;
}
