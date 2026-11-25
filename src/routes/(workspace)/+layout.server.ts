import type { DeliverySummary } from '#lib/delivery-stats.js';
import { embeddingConnection } from '#lib/server/embeddings.js';
import { redirect } from '@sveltejs/kit';
import { sql } from '#lib/server/db.js';
import { settings } from '#lib/server/settings.js';
import type { LayoutServerLoad } from './$types';
export const load: LayoutServerLoad = async ({ locals, url, params }) => {
	const pathname = url.pathname;
	if (!locals.user) redirect(303, '/login?next=' + encodeURIComponent(pathname));
	const [campaigns, contacts, versions, deliverySummaries, config, aiUsage, documents] =
		await Promise.all([
			sql`select * from campaigns order by created_at desc`,
			params.id
				? sql`select * from contacts where exists(select 1 from campaigns where id::text=${params.id} and status='draft') order by name`
				: [],
			sql`select * from versions where campaign_id::text=${params.id || ''} order by locale`,
			sql<DeliverySummary[]>`select campaign_id,locale,count(*)::int as total,
				count(*) filter(where status='sent')::int as sent,
				count(*) filter(where status in ('queued','processing'))::int as pending,
				count(*) filter(where status='failed')::int as failed,
				count(*) filter(where status='suppressed')::int as suppressed,
				count(*) filter(where first_opened_at is not null)::int as opened
				from deliveries group by campaign_id,locale order by campaign_id,locale`,
			settings(),
			sql`select id,campaign_id,document_id,task,locale,model,status,input_tokens,cached_input_tokens,output_tokens,rates,cost_usd,pricing_status,created_at from ai_usage order by created_at desc`,
			sql`select id,title,filename,status,chunk_count,indexed_chunks,embedding_profile,embedding_model,revision,error,created_at,updated_at from knowledge_documents order by created_at desc`
		]);
	return {
		campaigns: [...campaigns],
		contacts: [...contacts],
		versions: [...versions],
		deliverySummaries: [...deliverySummaries],
		config,
		aiUsage: [...aiUsage],
		documents: [...documents],
		embeddingProfile: embeddingConnection(config).profile,
		user: locals.user
	};
};
