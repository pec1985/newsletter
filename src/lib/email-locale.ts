export function validLocale(value: unknown): value is string {
	return typeof value === 'string' && /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(value);
}

export function emailLocale(locale: string) {
	return locale.slice(0, 2).toLowerCase();
}

export function audienceLocales(locales: string[]) {
	return [...new Set(locales.map(emailLocale))];
}

// RTL scripts used by modern email locales, including explicit script variants.
const rtlScripts = new Set([
	'Adlm',
	'Arab',
	'Aran',
	'Hebr',
	'Mand',
	'Mend',
	'Nkoo',
	'Rohg',
	'Samr',
	'Syrc',
	'Thaa',
	'Yezi'
]);

export function emailDirection(locale: string | undefined): 'ltr' | 'rtl' | 'auto' {
	if (!locale) return 'auto';
	try {
		const script = new Intl.Locale(locale).maximize().script;
		return script ? (rtlScripts.has(script) ? 'rtl' : 'ltr') : 'auto';
	} catch {
		return 'auto';
	}
}
