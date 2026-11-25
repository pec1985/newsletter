export const reasons = {
	frequency: 'I receive too many emails.',
	topics: 'The topics aren’t relevant to me.',
	unexpected: 'I didn’t expect to receive this newsletter.',
	preference: 'I prefer not to receive newsletters.',
	other: 'None of the above'
};
export function reasonLabel(code: string) {
	return code !== 'other' && Object.hasOwn(reasons, code)
		? reasons[code as keyof typeof reasons]
		: 'Other';
}
