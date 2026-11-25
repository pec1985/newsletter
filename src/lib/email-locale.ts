export function validLocale(value: unknown): value is string {
	return typeof value === 'string' && /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(value);
}

export function emailLocale(locale: string) {
	return locale.slice(0, 2).toLowerCase();
}

export function audienceLocales(locales: string[]) {
	return [...new Set(locales.map(emailLocale))];
}
