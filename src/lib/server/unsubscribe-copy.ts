import { reasons } from '../unsubscribe';
import { requestCompletion } from './ai';
import { settings } from './settings';

const english = {
	title: 'Unsubscribe from the newsletter?',
	question: 'Why would you like to unsubscribe?',
	unsubscribe: 'Unsubscribe',
	unsubscribed: 'You’re unsubscribed.',
	confirmation: 'You won’t receive future newsletters from us.',
	resubscribe: 'Subscribe again',
	subscribed: 'You’re subscribed again.',
	required: 'Choose one of the options below.',
	...reasons
};
type Copy = typeof english;
const keys = Object.keys(english) as (keyof Copy)[];
const cache = new Map<
	string,
	{ result: Promise<{ copy: Copy; lang: string }>; retryAfter: number }
>();

export async function unsubscribeCopy(locale: string, campaignId: string) {
	const fallback = { copy: english, lang: 'en' };
	if (/^en(?:-|$)/i.test(locale)) return fallback;
	const cached = cache.get(locale);
	if (cached && cached.retryAfter > Date.now()) return cached.result;
	const entry = { result: translate(), retryAfter: Infinity };
	cache.set(locale, entry);
	return entry.result;

	async function translate() {
		try {
			const { message } = await requestCompletion(
				[
					{
						role: 'system',
						content:
							'Translate these newsletter subscription interface strings to the target locale. Return a JSON object with the same keys and only translated plain text values.'
					},
					{ role: 'user', content: JSON.stringify({ locale, strings: english }) }
				],
				{ task: 'translate', locale, campaignId, timeoutMs: 20000 },
				await settings(true)
			);
			const response = JSON.parse(message.content ?? '');
			const parsed = response?.strings ?? response;
			if (
				!keys.every(
					(key) =>
						typeof parsed?.[key] === 'string' && parsed[key].trim() && parsed[key].length <= 500
				)
			)
				throw new Error('Incomplete translation');
			return {
				copy: Object.fromEntries(keys.map((key) => [key, parsed[key]])) as Copy,
				lang: locale
			};
		} catch {
			entry.retryAfter = Date.now() + 60000;
			return fallback;
		}
	}
}
