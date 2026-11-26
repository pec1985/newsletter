import { audienceSummaries, selectionMatch, selectionSummary } from '#lib/server/audiences.js';
import type { DeliverySummary } from '#lib/delivery-stats.js';
import { embeddingConnection } from '#lib/server/embeddings.js';
import { redirect } from '@sveltejs/kit';
import { sql } from '#lib/server/db.js';
import { settings } from '#lib/server/settings.js';
import type { LayoutServerLoad } from './$types';
export const load: LayoutServerLoad = async ({ locals, url, params }) => {
	const pathname = url.pathname;
	if (!locals.user) redirect(303, '/login?next=' + encodeURIComponent(pathname));
	const [campaigns, audiences, versions, deliverySummaries, config, aiUsage, documents] =
		await Promise.all([
			sql`select c.*,array(select ca.audience_id from campaign_audiences ca where ca.campaign_id=c.id order by ca.audience_id) as audience_ids from campaigns c order by c.created_at desc`,
			params.id || pathname === '/audiences' ? audienceSummaries() : [],
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
	const draft = campaigns.find((c) => c.id === params.id && c.status === 'draft');
	const savedAudienceSummary = draft
		? await selectionSummary(
				selectionMatch(
					draft.all_users,
					audiences.filter((a) => draft.audience_ids.includes(a.id))
				)
			)
		: { recipients: 0, locales: [] };
	return {
		savedAudienceSummary,
		campaigns: [...campaigns],
		audiences: [...audiences],
		versions: [...versions],
		deliverySummaries: [...deliverySummaries],
		config,
		aiUsage: [...aiUsage],
		documents: [...documents],
		embeddingProfile: embeddingConnection(config).profile,
		user: locals.user
	};
};
