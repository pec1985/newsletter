export type ApiKeySummary = {
	id: string;
	name: string;
	prefix: string;
	created_at: string;
	last_used_at: string | null;
	revoked_at: string | null;
};
