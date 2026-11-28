import { workerLifecycle } from '../src/lib/server/worker-lifecycle';
import { sendDueReminder } from '../src/lib/server/campaign-reminders';
import { releaseDueCampaigns } from '../src/lib/server/campaign-scheduler';
import { sql } from '../src/lib/server/db';
import { settings } from '../src/lib/server/settings';
import { sendNewsletterEmail } from '../src/lib/server/send-email';
async function tick() {
	await releaseDueCampaigns();
	const d = await sql.begin(async (tx) => {
		const [row] =
			await tx`select * from deliveries where status='queued' and exists(select 1 from campaigns where campaigns.id=deliveries.campaign_id and campaigns.status='sending') order by id for update skip locked limit 1`;
		if (row) await tx`update deliveries set status='processing' where id=${row.id}`;
		return row;
	});
	if (!d) return false;
	try {
		const [contact] = await sql`select * from contacts where id=${d.contact_id}`;
		if (!contact || contact.unsubscribed || contact.suppressed) {
			await sql`update deliveries set status='suppressed' where id=${d.id}`;
		} else {
			let providerId = null;
			if (d.mode === 'ses') {
				const config = await settings(true);
				const appUrl = new URL(process.env.APP_ORIGIN || '');
				if (appUrl.protocol !== 'https:')
					throw new Error('SES delivery requires an HTTPS APP_ORIGIN.');
				providerId = await sendNewsletterEmail(
					config,
					{
						email: d.email,
						name: d.name,
						subject: d.subject,
						body: d.body
					},
					{ origin: appUrl, token: d.token }
				);
			}
			await sql`update deliveries set status='sent',sent_at=now(),provider_id=${providerId} where id=${d.id}`;
		}
	} catch (e) {
		await sql`update deliveries set status='failed',error=${e instanceof Error ? e.message : 'Delivery failed'} where id=${d.id}`;
	}
	await sql`update campaigns set status=case when exists(select 1 from deliveries where campaign_id=${d.campaign_id} and status='failed') then 'attention' else 'sent' end,sent_at=now() where id=${d.campaign_id} and not exists(select 1 from deliveries where campaign_id=${d.campaign_id} and status in ('queued','processing'))`;
	return true;
}
console.log('Newsletter worker running. Local deliveries do not send email.');
async function runWorker(job: () => Promise<boolean>, idleMs: number) {
	const lifecycle = workerLifecycle();
	while (!lifecycle.stopping) {
		try {
			if (!(await job())) await lifecycle.sleep(idleMs);
		} catch (e) {
			console.error(e);
			await lifecycle.sleep(5000);
		}
	}

	lifecycle.close();
}

await Promise.all([runWorker(tick, 1500), runWorker(sendDueReminder, 30000)]);
await sql.end({ timeout: 5 });
