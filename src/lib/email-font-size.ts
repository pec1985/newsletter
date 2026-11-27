export function emailFontSize(value?: string) {
	return value && /^[1-9]\d{0,2}$/.test(value) ? `${value}px` : undefined;
}
