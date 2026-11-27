export const workspaceLinks = [
	{ id: 'context', icon: 'edit', label: 'Writing instructions' },
	{ id: 'knowledge', icon: 'file', label: 'Knowledge base' }
];

export const settingsLinks = [
	{ id: 'account', icon: 'users', label: 'Account' },
	{ id: 'team', icon: 'users', label: 'Team members' },
	{ id: 'sender', icon: 'mail', label: 'Sender & signature' },
	{ id: 'ai', icon: 'spark', label: 'AI engine' },
	{ id: 'delivery', icon: 'send', label: 'Email delivery' },
	{ id: 'images', icon: 'image', label: 'Image storage' },
	{ id: 'api-keys', icon: 'key', label: 'API keys' },
	{ id: 'api-docs', icon: 'file', label: 'API documentation' }
];

export const campaignStatus = (status: string) =>
	({
		draft: 'Draft',
		scheduled: 'Scheduled',
		sending: 'Sending',
		sent: 'Sent',
		attention: 'Needs attention'
	})[status] || status;

export const campaignAction = (status: string) =>
	status === 'draft'
		? 'Edit draft'
		: status === 'scheduled'
			? 'View schedule'
			: status === 'sending'
				? 'View progress'
				: 'View results';
