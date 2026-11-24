import { aiConnection, type AiTask } from './ai-config';
import { settings } from './settings';
import { sql } from './db';
import { tokenRates, tokenUsage, estimateCost } from '../ai-cost';
export type Message = {
	role: string;
	content: string | null;
	tool_call_id?: string;
	response_items?: Record<string, unknown>[];
	tool_calls?: { id: string; type: string; function: { name: string; arguments: string } }[];
};
type GenerationOptions = { campaignId: string; task: AiTask; locale?: string };
export async function generate(messages: Message[], options: GenerationOptions) {
	return generateWithConfig(messages, options, await settings(true));
}
export async function requestCompletion(
	messages: Message[],
	options: GenerationOptions,
	config: Record<string, string>,
	request: typeof fetch = fetch,
	extra: Record<string, unknown> = {}
) {
	if (!config.aiKey)
		throw new Error(
			'Add an API token in Settings → AI engine to use the assistant. You can edit the draft manually in the meantime.'
		);
	const connection = aiConnection(config, options.task);
	const { model } = connection;
	const useResponses = new URL(connection.endpoint).origin === 'https://api.openai.com';
	const endpoint = useResponses
		? connection.endpoint.replace(/\/chat\/completions$/, '/responses')
		: connection.endpoint;
	const body = useResponses
		? {
				model,
				store: false,
				include: ['reasoning.encrypted_content'],
				input: messages.flatMap((message): Record<string, unknown>[] => {
					if (message.response_items) return message.response_items;
					if (message.role === 'tool')
						return [
							{
								type: 'function_call_output',
								call_id: message.tool_call_id,
								output: message.content || ''
							}
						];
					return [{ role: message.role, content: message.content || '' }];
				}),
				text: { format: { type: 'json_object' } },
				...(Array.isArray(extra.tools)
					? { tools: extra.tools.map((tool) => ({ type: tool.type, ...tool.function })) }
					: {}),
				...(extra.tool_choice
					? {
							tool_choice:
								typeof extra.tool_choice === 'object'
									? {
											type: 'function',
											name: (extra.tool_choice as { function: { name: string } }).function.name
										}
									: extra.tool_choice
						}
					: {})
			}
		: { model, messages, response_format: { type: 'json_object' }, ...extra };
	const rates = tokenRates(config, options.task);
	const [entry] =
		await sql`insert into ai_usage (campaign_id,campaign_subject,task,locale,model,endpoint,rates)
 select id,subject,${options.task},${options.locale ?? null},${model},${endpoint},${sql.json(rates)} from campaigns where id=${options.campaignId} returning id`;
	if (!entry) throw new Error('Campaign not found.');
	let response: Response;
	try {
		response = await request(endpoint, {
			method: 'POST',
			redirect: 'error',
			headers: { Authorization: `Bearer ${config.aiKey}`, 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(90000)
		});
	} catch {
		await sql`update ai_usage set status='failed' where id=${entry.id}`;
		throw new Error(
			'AI request failed or timed out. Its cost is unknown; check your provider before retrying.'
		);
	}
	let result;
	try {
		result = await response.json();
	} catch {
		await sql`update ai_usage set status='invalid_response' where id=${entry.id}`;
		throw new Error('The AI provider returned an unreadable response. Token usage is unknown.');
	}
	const usage = tokenUsage(
		useResponses && result?.usage
			? {
					prompt_tokens: result.usage.input_tokens,
					completion_tokens: result.usage.output_tokens,
					prompt_tokens_details: result.usage.input_tokens_details
				}
			: result?.usage
	);
	const estimate = estimateCost(usage, rates);
	// Record usage before parsing generated content: unusable generations can still be billed.
	await sql`update ai_usage set input_tokens=${usage.input},cached_input_tokens=${usage.cached},output_tokens=${usage.output},cost_usd=${estimate.cost},pricing_status=${estimate.status},status=${response.ok ? 'invalid_response' : 'failed'} where id=${entry.id}`;
	if (!response.ok) {
		const detail =
			typeof result?.error?.message === 'string'
				? result.error.message
						.split(config.aiKey)
						.join('[redacted]')
						.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
						.slice(0, 1000)
				: 'Check the base URL, token, and selected model in Settings → AI engine.';
		throw new Error(`AI request failed (${response.status}): ${detail}`);
	}

	const message =
		useResponses && Array.isArray(result?.output)
			? {
					role: 'assistant',
					content:
						result.output
							.filter((item: any) => item.type === 'message')
							.flatMap((item: any) => item.content || [])
							.filter((part: any) => part.type === 'output_text')
							.map((part: any) => part.text)
							.join('') || null,
					tool_calls: result.output
						.filter((item: any) => item.type === 'function_call')
						.map((item: any) => ({
							id: item.call_id,
							type: 'function',
							function: { name: item.name, arguments: item.arguments }
						})),
					response_items: result.output
				}
			: result?.choices?.[0]?.message;
	if (!message || (typeof message.content !== 'string' && !Array.isArray(message.tool_calls)))
		throw new Error('The AI returned an incomplete response. Usage has been recorded.');
	await sql`update ai_usage set status='succeeded' where id=${entry.id}`;
	return { message: message as Message, usageId: entry.id as string };
}
export async function parseGeneration(response: { message: Message; usageId: string }) {
	try {
		const content = JSON.parse(response.message.content || '');
		if (!content || typeof content.subject !== 'string' || typeof content.body !== 'string')
			throw new Error();
		return content as { subject: string; body: string; message?: string };
	} catch {
		await sql`update ai_usage set status='invalid_response' where id=${response.usageId}`;
		throw new Error('The AI returned an incomplete draft. Any reported usage has been recorded.');
	}
}
export async function generateWithConfig(
	messages: Message[],
	options: GenerationOptions,
	config: Record<string, string>,
	request: typeof fetch = fetch
) {
	return parseGeneration(await requestCompletion(messages, options, config, request));
}
