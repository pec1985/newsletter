export function emailFontSize(value?: string) {
	return value && /^[1-9]\d{0,2}$/.test(value) ? `${value}px` : undefined;
}

export const emailMaxWidths = [480, 600, 720];

export function emailMaxWidth(value?: string) {
	return emailMaxWidths.find((width) => String(width) === value);
}
