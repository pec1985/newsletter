export function localDateTime(value: unknown): string {
	if (!value) return '';
	const date = new Date(String(value));
	if (!Number.isFinite(date.getTime())) return '';
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function formatCampaignDate(value: unknown): string {
	return value
		? new Date(String(value)).toLocaleString('en', {
				month: 'short',
				day: 'numeric',
				year: 'numeric',
				hour: 'numeric',
				minute: '2-digit',
				timeZoneName: 'short'
			})
		: 'Not set';
}
