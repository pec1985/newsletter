import { audienceLocales, emailLocale } from '../email-locale';
import { sql } from './db';

export async function migrateEmailLocales() {
	await sql.begin(async (tx) => {
		await tx`update contacts set locale=lower(left(locale, 2))
			where locale <> lower(left(locale, 2))`;
		const drafts =
			await tx`select id, source_locale, locales from campaigns where status='draft' for update`;
		for (const draft of drafts) {
			const source = emailLocale(draft.source_locale);
			const locales = audienceLocales(draft.locales);
			if (
				source === draft.source_locale &&
				locales.length === draft.locales.length &&
				locales.every((locale, index) => locale === draft.locales[index])
			)
				continue;
			await tx`update campaigns set source_locale=${source}, locales=${locales} where id=${draft.id}`;
		}
	});
}
