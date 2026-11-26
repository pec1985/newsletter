import { expect, test } from 'bun:test';
import { usageRows, activityRows, parseFilters } from '../src/lib/audience-filters';

test('saved bounds retain strict comparisons and existing two-sided windows', () => {
	const usage = [
		{ operator: '>', value: '0' },
		{ operator: '<=', value: '12' }
	];
	const activity = [
		{ operator: '<', value: '7' },
		{ operator: '>=', value: '30' }
	];
	const stored = parseFilters(usage, activity);
	expect(usageRows(stored)).toEqual(usage);
	expect(activityRows(stored)).toEqual(activity);
});

test('numeric equality and a numeric-looking label round-trip independently', () => {
	for (const value of ['0', '"0"', 'frequent']) {
		const rule = [{ operator: '=', value }];
		expect(usageRows(parseFilters(rule, []))).toEqual(rule);
	}
	expect(() => parseFilters([{ operator: '<', value: 'frequent' }], [])).toThrow();
});
