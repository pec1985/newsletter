import { embeddingConnection } from '#lib/server/embeddings.js';
import { redirect } from '@sveltejs/kit';
import { sql } from '#lib/server/db.js';
import { settings } from '#lib/server/settings.js';
import type { LayoutServerLoad } from './$types';
export const load: LayoutServerLoad = async ({ locals, url }) => {
	const pathname = url.pathname;
	if (!locals.user) redirect(303, '/login?next=' + encodeURIComponent(pathname));
	const [campaigns, contacts, versions, deliveries, config, aiUsage, documents] = await Promise.all(
		[
			sql`select * from campaigns order by created_at desc`,
			sql`select * from contacts order by name`,
			sql`select * from versions`,
			sql`select id,campaign_id,contact_id,email,name,locale,subject,body,token,status,mode,sent_at,first_opened_at,open_count,error from deliveries order by sent_at desc nulls last`,
			settings(),
			sql`select id,campaign_id,document_id,task,locale,model,status,input_tokens,cached_input_tokens,output_tokens,rates,cost_usd,pricing_status,created_at from ai_usage order by created_at desc`,
			sql`select id,title,filename,status,chunk_count,indexed_chunks,embedding_profile,embedding_model,revision,error,created_at,updated_at from knowledge_documents order by created_at desc`
		]
	);
	return {
		campaigns: [...campaigns],
		contacts: [...contacts],
		versions: [...versions],
		deliveries: [...deliveries],
		config,
		aiUsage: [...aiUsage],
		documents: [...documents],
		embeddingProfile: embeddingConnection(config).profile,
		user: locals.user
	};
};
