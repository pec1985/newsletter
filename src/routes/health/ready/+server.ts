import { sql } from '#lib/server/db.js';

export async function GET() {
	const query = sql`select 1 from users limit 1`.execute();
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			query,
			new Promise((_, reject) => {
				timer = setTimeout(() => {
					query.cancel();
					reject(new Error('Readiness timeout'));
				}, 3000);
			})
		]);
		return new Response('ok', { headers: { 'cache-control': 'no-store' } });
	} catch {
		return new Response('unavailable', { status: 503, headers: { 'cache-control': 'no-store' } });
	} finally {
		clearTimeout(timer);
	}
}
