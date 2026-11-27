import { error } from '@sveltejs/kit';
import { sql } from './db';
import { generateWithConfig } from './ai';
import { settings } from './settings';

export function signedBody(body: string, locale: string, config: Record<string, string>) {
	return (
		body +
		'\n\n' +
		(locale.startsWith('es') && config.signatureEs
			? config.signatureEs
			: config.signature || ''
		).replaceAll('\\n', '\n')
	);
}

// A persisted claim prevents duplicate AI calls from concurrent review tabs.
// Its ID also prevents late responses from replacing a newer draft or retry.
export async function prepareTranslation(
	campaignId: string,
	locale: string,
	retry = false,
	generate = generateWithConfig
) {
	const claim = await sql.begin(async (tx) => {
		const [campaign] = await tx`select * from campaigns where id=${campaignId} for update`;
		if (!campaign) error(404, 'Campaign not found.');
		if (campaign.status !== 'draft') error(409, 'This campaign is no longer a draft.');
		if (!campaign.subject.trim() || !campaign.body.trim() || !campaign.locales.includes(locale))
			error(400, 'Add a subject, body and this audience locale before preparing a preview.');
		const [existing] =
			await tx`select * from versions where campaign_id=${campaignId} and locale=${locale}`;
		if (existing?.status === 'ready') return null;
		if (existing?.status === 'translating') {
			if (Date.now() - new Date(existing.started_at).getTime() < 120000) return null;
			await tx`update versions set status='failed',error='Translation was interrupted. Retry to continue.' where id=${existing.id}`;
		}
		if (existing && !retry) return null;
		if (existing) await tx`delete from versions where id=${existing.id}`;
		const [version] =
			await tx`insert into versions (campaign_id,locale,subject,body,status,started_at)
			values (${campaignId},${locale},'','','translating',now()) returning id`;
		return { campaign, versionId: version.id };
	});
	if (!claim) return;
	try {
		const config = await settings(true);
		let { subject, body } = claim.campaign;
		if (locale !== claim.campaign.source_locale) {
			const result = await generate(
				[
					{
						role: 'system',
						content:
							'Translate this email faithfully. Keep the recipient placeholder {{name}} exactly as written. Preserve every URL and Markdown image. Return JSON with subject and body. Do not add content.'
					},
					{
						role: 'user',
						content: JSON.stringify({
							sourceLocale: claim.campaign.source_locale,
							targetLocale: locale,
							subject,
							body
						})
					}
				],
				{ campaignId, task: 'translate', locale },
				config
			);
			subject = result.subject;
			body = result.body;
		}
		body = signedBody(body, locale, config);
		await sql.begin(async (tx) => {
			const [campaign] = await tx`select status from campaigns where id=${campaignId} for update`;
			if (!campaign || campaign.status !== 'draft') return;
			await tx`update versions set subject=${subject},body=${body},status='ready',error=null
				where id=${claim.versionId} and status='translating'`;
		});
	} catch (cause) {
		await sql`update versions set status='failed',error=${cause instanceof Error ? cause.message : 'Translation failed. Try again.'}
			where id=${claim.versionId} and status='translating'`;
	}
}
