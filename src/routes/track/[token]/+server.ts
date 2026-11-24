import { sql } from '#lib/server/db.js';
export async function GET({ params }: import('./$types').RequestEvent) {
	if (/^[a-f0-9]{64}$/.test(params.token))
		await sql.begin(async (tx) => {
			const [d] =
				await tx`update deliveries set first_opened_at=coalesce(first_opened_at,now()),last_opened_at=now(),open_count=open_count+1 where token=${params.token} and status in ('sent','delivered') returning id`;
			if (d) await tx`insert into events (delivery_id,type) values (${d.id},'open')`;
		});
	return new Response(
		Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'),
		{
			headers: {
				'Content-Type': 'image/gif',
				'Cache-Control': 'no-store, no-cache, must-revalidate'
			}
		}
	);
}
