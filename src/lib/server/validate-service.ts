import { SESv2Client, GetAccountCommand } from '@aws-sdk/client-sesv2';
import { normalizeAiBaseUrl } from './ai-config';

export const validationFields = {
	aws: ['awsRegion', 'awsAccessKey', 'awsSecretKey'],
	ai: ['aiBaseUrl', 'aiKey', 'aiDraftModel', 'aiTranslationModel'],
	embeddings: ['aiBaseUrl', 'aiKey', 'embeddingBaseUrl', 'embeddingKey', 'embeddingModel'],
	imagekit: ['imagekitKey']
} as const;
export type Service = keyof typeof validationFields;
export type ValidationResult = { status: 'success' | 'warning' | 'error'; message: string };
type Account = { SendingEnabled?: boolean; ProductionAccessEnabled?: boolean };
type Dependencies = {
	request?: typeof fetch;
	account?: (config: Record<string, string>, signal: AbortSignal) => Promise<Account>;
};

export function validationConfig(
	service: Service,
	input: Record<string, unknown>,
	saved: Record<string, string>
) {
	const result: Record<string, string> = {};
	for (const key of validationFields[service]) {
		const value = input[key];
		if (value !== undefined && (typeof value !== 'string' || value.length > 20000))
			throw new Error('Invalid connection settings.');
		result[key] =
			value === undefined || value === '••••••••' ? saved[key] || '' : (value as string);
	}
	return result;
}

export async function validateService(
	service: Service,
	config: Record<string, string>,
	dependencies: Dependencies = {}
): Promise<ValidationResult> {
	const request = dependencies.request || fetch;
	const signal = AbortSignal.timeout(15000);
	const fail = (message: string): ValidationResult => ({ status: 'error', message });
	async function get(url: string, authorization: string) {
		const response = await request(url, {
			headers: { Authorization: authorization, Accept: 'application/json' },
			signal,
			redirect: 'error'
		});
		if (!response.ok) {
			await response.body?.cancel();
			if (response.status === 401) throw new Error('AUTH');
			if (response.status === 403) throw new Error('PERMISSION');
			if (response.status === 404) throw new Error('NOT_FOUND');
			if (response.status === 429) throw new Error('RATE');
			throw new Error('PROVIDER');
		}
		return await response.json();
	}
	try {
		if (service === 'aws') {
			if (!config.awsAccessKey?.trim() || !config.awsSecretKey?.trim())
				return fail('Enter your AWS access key ID and secret access key.');
			if (!/^[a-z]{2}(?:-[a-z0-9]+)+-\d+$/.test(config.awsRegion || ''))
				return fail('Enter a valid AWS region, such as eu-west-1.');
			let account: Account;
			if (dependencies.account) account = await dependencies.account(config, signal);
			else {
				const client = new SESv2Client({
					region: config.awsRegion,
					credentials: {
						accessKeyId: config.awsAccessKey.trim(),
						secretAccessKey: config.awsSecretKey.trim()
					},
					maxAttempts: 1
				});
				try {
					account = await client.send(new GetAccountCommand({}), { abortSignal: signal });
				} finally {
					client.destroy();
				}
			}
			if (account.SendingEnabled !== true)
				return {
					status: 'warning',
					message: 'AWS authentication succeeded, but SES sending is disabled in this region.'
				};
			if (!account.ProductionAccessEnabled)
				return {
					status: 'warning',
					message:
						'AWS authentication succeeded. SES is in sandbox mode: recipients must be verified. Sender verification and SendEmail permission were not tested.'
				};
			return {
				status: 'success',
				message:
					'AWS authentication succeeded. SES sending is enabled with production access in this region. Sender verification and SendEmail permission were not tested.'
			};
		}
		if (service === 'imagekit') {
			if (!config.imagekitKey?.trim()) return fail('Enter your ImageKit private API key.');
			const files = await get(
				'https://api.imagekit.io/v1/files?limit=1',
				`Basic ${Buffer.from(config.imagekitKey.trim() + ':').toString('base64')}`
			);
			if (!Array.isArray(files)) return fail('ImageKit returned an unexpected response.');
			return {
				status: 'success',
				message:
					'ImageKit authentication and media library access succeeded. No files were uploaded; upload permission was not tested.'
			};
		}
		const embedding = service === 'embeddings';
		const key = (embedding ? config.embeddingKey || config.aiKey : config.aiKey)?.trim();
		if (!key) return fail('Enter an API token before validating the connection.');
		const base = normalizeAiBaseUrl(
			(embedding ? config.embeddingBaseUrl || config.aiBaseUrl : config.aiBaseUrl) || ''
		);
		const models = [
			...new Set(
				(embedding
					? [config.embeddingModel]
					: [config.aiDraftModel, config.aiTranslationModel]
				).map((m) => m?.trim())
			)
		];
		if (models.some((m) => !m))
			return fail('Enter the model IDs before validating the connection.');
		for (const model of models) {
			const result = await get(`${base}/models/${encodeURIComponent(model!)}`, `Bearer ${key}`);
			if (typeof result?.id !== 'string')
				return fail('The provider returned an unexpected model response. Check the API base URL.');
		}
		return {
			status: 'success',
			message: `${embedding ? 'Embedding' : 'AI'} authentication and configured model access succeeded. No ${embedding ? 'embeddings were' : 'text was'} generated; billing and inference permissions were not tested.`
		};
	} catch (cause) {
		const name = cause instanceof Error ? cause.name : '';
		const code = cause instanceof Error ? cause.message : '';
		if (signal.aborted || ['AbortError', 'TimeoutError'].includes(name))
			return fail('The connection timed out. Try again.');
		if (
			[
				'InvalidClientTokenId',
				'UnrecognizedClientException',
				'SignatureDoesNotMatch',
				'InvalidSignatureException',
				'ExpiredTokenException'
			].includes(name) ||
			code === 'AUTH'
		)
			return fail('Authentication failed. Check your credentials and try again.');
		if (['AccessDenied', 'AccessDeniedException'].includes(name) || code === 'PERMISSION')
			return fail(
				service === 'aws'
					? 'AWS denied this check. The key needs ses:GetAccount permission in the selected region.'
					: 'Access denied. Check the API key permissions for this read-only check.'
			);
		if (code === 'NOT_FOUND')
			return fail('The model or API endpoint was not found. Check the base URL and model IDs.');
		if (code === 'RATE' || name === 'TooManyRequestsException')
			return fail('The provider rate-limited this check. Try again shortly.');
		return fail(
			'Could not validate this connection. Check the endpoint, region, credentials, and provider availability.'
		);
	}
}
