import { sql } from '../src/lib/server/db';
import { settings } from '../src/lib/server/settings';
import { renderEmail, escapeHtml } from '../src/lib/email';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
async function tick() {
	const d = await sql.begin(async (tx) => {
		const [row] =
			await tx`select * from deliveries where status='queued' order by id for update skip locked limit 1`;
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
				const origin = process.env.APP_ORIGIN || 'http://localhost:5173';
				const unsubscribe = `${origin}/unsubscribe/${d.token}`;
				const html =
					renderEmail(d.body) +
					`<p><a href="${escapeHtml(unsubscribe)}">Unsubscribe</a></p><img src="${escapeHtml(origin)}/track/${d.token}" width="1" height="1" alt="" />`;
				const client = new SESv2Client({
					region: config.awsRegion || 'eu-west-1',
					credentials: { accessKeyId: config.awsAccessKey, secretAccessKey: config.awsSecretKey },
					maxAttempts: 1
				});
				const result = await client.send(
					new SendEmailCommand({
						FromEmailAddress: config.senderEmail,
						ReplyToAddresses: config.replyTo ? [config.replyTo] : undefined,
						Destination: { ToAddresses: [d.email] },
						Content: {
							Simple: {
								Subject: { Data: d.subject, Charset: 'UTF-8' },
								Body: {
									Html: { Data: html, Charset: 'UTF-8' },
									Text: { Data: d.body + '\n\nUnsubscribe: ' + unsubscribe, Charset: 'UTF-8' }
								}
							}
						}
					})
				);
				providerId = result.MessageId || null;
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
while (true) {
	try {
		if (!(await tick())) await Bun.sleep(1500);
	} catch (e) {
		console.error(e);
		await Bun.sleep(5000);
	}
}
