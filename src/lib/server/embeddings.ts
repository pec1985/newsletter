import { sql } from './db';
import { digest } from './security';
import { settings } from './settings';
import { normalizeAiBaseUrl } from './ai-config';
import { estimateCost, parsePrice } from '../ai-cost';
export function embeddingConnection(config: Record<string, string>) {
	const endpoint =
		normalizeAiBaseUrl(config.embeddingBaseUrl || config.aiBaseUrl || '') + '/embeddings';
	const model = (config.embeddingModel || 'text-embedding-3-small').trim();
	return {
		endpoint,
		model,
		key: config.embeddingKey || config.aiKey,
		profile: digest(endpoint + '|' + model)
	};
}
export async function embedTexts(
	texts: string[],
	options: {
		campaignId?: string;
		documentId?: string;
		task: 'embedding_index' | 'embedding_search';
	},
	config?: Record<string, string>,
	request: typeof fetch = fetch
) {
	config ||= await settings(true);
	const connection = embeddingConnection(config);
	if (!connection.key)
		throw new Error('Configure an embeddings API token or your AI token in Settings → AI engine.');
	const inputPrice = parsePrice(config.embeddingInputPrice);
	const rates = { input: inputPrice, cached: inputPrice, output: 0 };
	const [entry] =
		await sql`insert into ai_usage (campaign_id,document_id,campaign_subject,task,model,endpoint,rates)
 values (${options.campaignId ?? null},${options.documentId ?? null},${options.task === 'embedding_index' ? 'Knowledge indexing' : 'Knowledge search'},${options.task},${connection.model},${connection.endpoint},${sql.json(rates)}) returning id`;
	let response: Response;
	try {
		response = await request(connection.endpoint, {
			method: 'POST',
			redirect: 'error',
			headers: { Authorization: 'Bearer ' + connection.key, 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: connection.model, input: texts, encoding_format: 'float' }),
			signal: AbortSignal.timeout(90000)
		});
	} catch {
		await sql`update ai_usage set status='failed' where id=${entry.id}`;
		throw new Error('Embedding request failed or timed out. Cost may be unknown.');
	}
	let result;
	try {
		result = await response.json();
	} catch {
		await sql`update ai_usage set status='invalid_response' where id=${entry.id}`;
		throw new Error('Embedding provider returned an unreadable response.');
	}
	const input = result?.usage?.prompt_tokens ?? result?.usage?.total_tokens;
	const usage = {
		input: typeof input === 'number' && Number.isSafeInteger(input) && input >= 0 ? input : null,
		cached: 0,
		output: 0
	};
	const estimated = estimateCost(usage, rates);
	await sql`update ai_usage set input_tokens=${usage.input},cached_input_tokens=0,output_tokens=0,cost_usd=${estimated.cost},pricing_status=${estimated.status},status=${response.ok ? 'invalid_response' : 'failed'} where id=${entry.id}`;
	if (!response.ok)
		throw new Error(
			'Embedding request failed (' + response.status + '). Check the endpoint, model and token.'
		);
	if (!Array.isArray(result.data) || result.data.length !== texts.length)
		throw new Error('The embedding provider returned an incomplete batch.');
	const data = [...result.data].sort((a, b) => a.index - b.index);
	const dimensions = data[0]?.embedding?.length;
	if (
		!Number.isInteger(dimensions) ||
		dimensions < 1 ||
		dimensions > 16000 ||
		data.some(
			(row, index) =>
				row.index !== index ||
				!Array.isArray(row.embedding) ||
				row.embedding.length !== dimensions ||
				row.embedding.some(
					(value: unknown) => typeof value !== 'number' || !Number.isFinite(value)
				) ||
				row.embedding.every((n: number) => n === 0)
		)
	)
		throw new Error('The embedding provider returned invalid vectors.');
	await sql`update ai_usage set status='succeeded' where id=${entry.id}`;
	return { vectors: data.map((row) => row.embedding as number[]), dimensions, ...connection };
}
