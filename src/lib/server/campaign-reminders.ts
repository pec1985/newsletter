import { sql } from './db';
import { sendNewsletterEmail } from './send-email';
import { settings } from './settings';

export async function sendDueReminder(send = sendNewsletterEmail) {
	const config = await settings(true);
	if (!config.notificationEmail) return false;
	return sql.begin(async (tx) => {
		const [campaign] = await tx`select id,title,scheduled_at from campaigns
			where status='scheduled' and mode='ses' and reminder_sent_at is null
			and scheduled_at > now() and extract(epoch from scheduled_at - now()) <= ${config.reminderHours}::numeric * 3600
			and (reminder_retry_at is null or reminder_retry_at <= now())
			order by scheduled_at,id limit 1 for update skip locked`;
		if (!campaign) return false;
		try {
			const review = new URL(`/campaigns/${campaign.id}/review`, process.env.APP_ORIGIN);
			const when = new Date(campaign.scheduled_at).toUTCString();
			await send(config, {
				email: config.notificationEmail,
				name: '',
				subject: `Review reminder: ${campaign.title.replace(/[\r\n]+/g, ' ')}`,
				body: `Your campaign is scheduled to send on ${when}. Please give the content one more look while there’s still time to make changes. It will send automatically as scheduled.\n\n[Review the campaign](${review.href})`
			});
		} catch (error) {
			console.error('Campaign reminder failed', campaign.id, error);
			await tx`update campaigns set reminder_retry_at=now()+interval '5 minutes' where id=${campaign.id}`;
			return true;
		}
		await tx`update campaigns set reminder_sent_at=now(),reminder_retry_at=null where id=${campaign.id}`;
		return true;
	});
}
