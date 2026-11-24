import { error } from '@sveltejs/kit';
import { sql } from './db';
import { digest, token } from './security';

export function authorizeKeyManagement(request: Request, user: App.Locals['user'], url: URL) {
	if (!user) error(401, 'Sign in to manage API keys.');
	if (request.method !== 'GET' && request.headers.get('origin') !== url.origin)
		error(403, 'Invalid request origin.');
}
export const keySummaryColumns = sql`id,name,prefix,created_at,last_used_at,revoked_at`;
export async function createApiKey(name: unknown, userId: string) {
	if (typeof name !== 'string' || !name.trim() || name.trim().length > 100)
		error(400, 'Give the API key a name of 1–100 characters.');
	const key = `nl_${token()}`;
	const [apiKey] = await sql`insert into api_keys(name,key_hash,prefix,created_by)
 values(${name.trim()},${digest(key)},${key.slice(0, 12)},${userId}) returning ${keySummaryColumns}`;
	return { apiKey, key };
}
export async function authenticateApiKey(key: string) {
	if (key.length > 200) return false;
	const [found] =
		await sql`select id from api_keys where key_hash=${digest(key)} and revoked_at is null`;
	if (!found) return false;
	await sql`update api_keys set last_used_at=now() where id=${found.id} and revoked_at is null and (last_used_at is null or last_used_at<now()-interval '1 minute')`;
	return true;
}
