import { expect, test } from 'bun:test';
import {
	estimateCost,
	parsePrice,
	tokenRates,
	tokenUsage,
	summarizeSpend
} from '../src/lib/ai-cost';
test('cached input is deducted from ordinary input, not charged twice', () => {
	const usage = tokenUsage({
		prompt_tokens: 1000000,
		completion_tokens: 100000,
		prompt_tokens_details: { cached_tokens: 400000 }
	});
	expect(estimateCost(usage, { input: 2, cached: 0.5, output: 8 }).cost).toBeCloseTo(2.2, 10);
});
test('blank prices and missing usage remain unknown while zero is an explicit free rate', () => {
	expect(parsePrice('')).toBeNull();
	expect(parsePrice('0')).toBe(0);
	expect(estimateCost(tokenUsage(undefined), { input: 2, cached: 2, output: 8 }).status).toBe(
		'unknown_usage'
	);
	expect(
		estimateCost({ input: 100, cached: 0, output: 50 }, { input: null, cached: null, output: 8 })
			.status
	).toBe('missing_prices');
	expect(
		estimateCost({ input: 100, cached: 0, output: 50 }, { input: 0, cached: 0, output: 0 }).cost
	).toBe(0);
});
test('token validation and price validation reject impossible values', () => {
	expect(
		tokenUsage({
			prompt_tokens: 100,
			completion_tokens: 10,
			prompt_tokens_details: { cached_tokens: 200 }
		}).cached
	).toBeNull();
	for (const price of ['-1', 'Infinity', 'NaN', '1e3', '1000001'])
		expect(() => parsePrice(price)).toThrow();
	expect(tokenUsage({ prompt_tokens: -1, completion_tokens: 10 }).input).toBeNull();
});
test('cached input defaults to ordinary input and subtotals flag unknown requests', () => {
	expect(tokenRates({ aiDraftInputPrice: '2', aiDraftOutputPrice: '8' }, 'draft')).toEqual({
		input: 2,
		cached: 2,
		output: 8
	});
	expect(
		summarizeSpend([
			{ task: 'draft', cost_usd: '0.1', pricing_status: 'estimated' },
			{ task: 'translate', cost_usd: '0.2', pricing_status: 'estimated' },
			{ task: 'translate', cost_usd: null, pricing_status: 'unknown_usage' }
		])
	).toMatchObject({ draft: 0.1, translation: 0.2, unknown: 1, requests: 3 });
});
