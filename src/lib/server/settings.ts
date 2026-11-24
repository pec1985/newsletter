import { priceKeys, parsePrice } from '../ai-cost';
import { defaultAiBaseUrl, normalizeAiBaseUrl } from './ai-config';
import { sql } from './db';
import { encrypt, decrypt } from './security';
export const secretKeys = ['awsSecretKey', 'aiKey', 'embeddingKey', 'imagekitKey'];
export async function settings(reveal = false): Promise<Record<string, string>> {
	const [row] = await sql`select value from settings where id = 1`;
	const values: Record<string, string> = row?.value || {};
	delete values.contactsApiKey;
	for (const key of secretKeys) {
		if (values[key]) values[key] = reveal ? decrypt(values[key]) : '••••••••';
	}
	return {
		...values,
		aiBaseUrl: values.aiBaseUrl || defaultAiBaseUrl,
		aiDraftModel: values.aiDraftModel || values.aiModel || 'gpt-4.1-mini',
		aiTranslationModel: values.aiTranslationModel || values.aiModel || 'gpt-4.1-mini',
		embeddingModel: values.embeddingModel || 'text-embedding-3-small',
		embeddingBaseUrl: values.embeddingBaseUrl || ''
	};
}
export async function saveSettings(input: Record<string, string>) {
	const [row] = await sql`select value from settings where id = 1`;
	const values = row?.value || {};
	const allowed = [
		'companyName',
		'companyContext',
		'companyTone',
		'companyAudience',
		'companyRules',
		'companyTerminology',
		'embeddingBaseUrl',
		'embeddingModel',
		'senderName',
		'senderEmail',
		'replyTo',
		'signature',
		'signatureEs',
		'awsRegion',
		'awsAccessKey',
		'aiModel',
		'aiBaseUrl',
		'aiDraftModel',
		'aiTranslationModel',
		...priceKeys,
		...secretKeys
	];
	for (const key of allowed) {
		if (typeof input[key] !== 'string' || input[key] === '••••••••') continue;
		if (priceKeys.includes(key)) parsePrice(input[key]);
		if (input[key].length > 20000) throw new Error('Setting is too long.');
		if (key === 'aiBaseUrl' || (key === 'embeddingBaseUrl' && input[key].trim())) {
			values[key] = normalizeAiBaseUrl(input[key]);
			continue;
		}
		if (
			['aiDraftModel', 'aiTranslationModel', 'embeddingModel'].includes(key) &&
			!input[key].trim()
		)
			throw new Error('Enter both a drafting model and a translation model.');
		values[key] = secretKeys.includes(key) && input[key] ? encrypt(input[key]) : input[key];
	}
	await sql`update settings set value=${sql.json(values)} where id=1`;
}
