export type TokenUsage = { input: number | null; cached: number | null; output: number | null };
export type TokenRates = { input: number | null; cached: number | null; output: number | null };
export const priceKeys = [
	'aiDraftInputPrice',
	'aiDraftCachedPrice',
	'aiDraftOutputPrice',
	'aiTranslationInputPrice',
	'aiTranslationCachedPrice',
	'aiTranslationOutputPrice',
	'embeddingInputPrice'
];
export function parsePrice(value: string | undefined): number | null {
	if (value === undefined || value.trim() === '') return null;
	if (
		!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()) ||
		!Number.isFinite(Number(value)) ||
		Number(value) > 1000000
	)
		throw new Error(
			'Token prices must be non-negative numbers up to 1,000,000 USD per million tokens.'
		);
	return Number(value);
}
export function tokenRates(
	config: Record<string, string>,
	task: 'draft' | 'translate'
): TokenRates {
	const prefix = task === 'draft' ? 'aiDraft' : 'aiTranslation';
	const input = parsePrice(config[prefix + 'InputPrice']);
	return {
		input,
		cached: parsePrice(config[prefix + 'CachedPrice']) ?? input,
		output: parsePrice(config[prefix + 'OutputPrice'])
	};
}
function count(value: unknown): number | null {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
export function tokenUsage(usage: unknown): TokenUsage {
	if (!usage || typeof usage !== 'object') return { input: null, cached: null, output: null };
	const value = usage as {
		prompt_tokens?: unknown;
		completion_tokens?: unknown;
		prompt_tokens_details?: { cached_tokens?: unknown };
	};
	const input = count(value.prompt_tokens),
		output = count(value.completion_tokens);
	const cached =
		value.prompt_tokens_details?.cached_tokens === undefined
			? 0
			: count(value.prompt_tokens_details.cached_tokens);
	return {
		input,
		output,
		cached: cached !== null && input !== null && cached <= input ? cached : null
	};
}
export function estimateCost(usage: TokenUsage, rates: TokenRates) {
	if (usage.input === null || usage.output === null || usage.cached === null)
		return { cost: null, status: 'unknown_usage' };
	const ordinary = usage.input - usage.cached;
	if (
		(ordinary > 0 && rates.input === null) ||
		(usage.cached > 0 && rates.cached === null) ||
		(usage.output > 0 && rates.output === null)
	)
		return { cost: null, status: 'missing_prices' };
	return {
		cost:
			(ordinary * (rates.input ?? 0) +
				usage.cached * (rates.cached ?? 0) +
				usage.output * (rates.output ?? 0)) /
			1000000,
		status: 'estimated'
	};
}
export type SpendRow = { task: string; cost_usd: string | number | null; pricing_status: string };
export function summarizeSpend(rows: SpendRow[]) {
	const subtotal = (task: string) =>
		rows
			.filter((row) => row.task === task)
			.reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0);
	const draft = subtotal('draft'),
		translation = subtotal('translate'),
		search = subtotal('embedding_search');
	return {
		draft,
		translation,
		search,
		total: draft + translation + search,
		unknown: rows.filter((row) => row.cost_usd === null).length,
		requests: rows.length
	};
}
