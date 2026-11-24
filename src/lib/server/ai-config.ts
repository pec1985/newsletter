export type AiTask = 'draft' | 'translate';
export const defaultAiBaseUrl = 'https://api.openai.com/v1';
export function normalizeAiBaseUrl(value: string) {
	let url: URL;
	try {
		url = new URL(value.trim() || defaultAiBaseUrl);
	} catch {
		throw new Error('Enter a valid AI base URL, including https:// or http://.');
	}
	if (
		!['https:', 'http:'].includes(url.protocol) ||
		url.username ||
		url.password ||
		url.search ||
		url.hash
	) {
		throw new Error(
			'Use an HTTP or HTTPS AI base URL without credentials, query parameters, or fragments.'
		);
	}
	return url.toString().replace(/\/+$/, '');
}
export function aiConnection(config: Record<string, string>, task: AiTask) {
	return {
		endpoint: normalizeAiBaseUrl(config.aiBaseUrl || '') + '/chat/completions',
		model:
			(task === 'translate' ? config.aiTranslationModel : config.aiDraftModel)?.trim() ||
			config.aiModel?.trim() ||
			'gpt-4.1-mini'
	};
}
