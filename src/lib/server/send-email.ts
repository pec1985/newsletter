import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { escapeHtml, personalizeEmail, renderEmail } from '../email';

import { emailFontSize, emailMaxWidth } from '../email-layout';

type Message = { email: string; name: string; subject: string; body: string };
type Delivery = { origin: URL; token: string };

export function newsletterContent(
	message: Message,
	delivery?: Delivery,
	fontSize?: string,
	maxWidth?: string
) {
	const width = emailMaxWidth(maxWidth);
	let html = renderEmail(message.body, message.name, width);
	let text = personalizeEmail(message.body, message.name);
	let headers;
	if (delivery) {
		const origin = delivery.origin.origin;
		const unsubscribe = `${origin}/unsubscribe/${delivery.token}`;
		html += `<p><a href="${escapeHtml(unsubscribe)}">Unsubscribe</a></p><img src="${escapeHtml(origin)}/track/${delivery.token}" width="1" height="1" alt="" />`;
		text += '\n\nUnsubscribe: ' + unsubscribe;
		headers = [
			{ Name: 'List-ID', Value: `Newsletter <newsletter.${delivery.origin.hostname}>` },
			{ Name: 'List-Unsubscribe', Value: `<${unsubscribe}/one-click>` },
			{ Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' }
		];
	}
	const size = emailFontSize(fontSize);
	if (size) html = `<div style="font-size: ${size}">${html}</div>`;
	if (width) {
		html = `<table role="presentation" align="center" width="${width}" cellpadding="0" cellspacing="0" border="0" style="width: ${width}px; max-width: 100%; margin: 0 auto; table-layout: fixed;"><tr><td>${html}</td></tr></table>`;
	}
	return {
		Headers: headers,
		Subject: { Data: personalizeEmail(message.subject, message.name), Charset: 'UTF-8' },
		Body: { Html: { Data: html, Charset: 'UTF-8' }, Text: { Data: text, Charset: 'UTF-8' } }
	};
}

export function senderAddress(email: string, senderName?: string) {
	const name = senderName?.replace(/[\x00-\x1f\x7f]+/g, ' ').trim();
	if (!name) return email;

	if (/^[\x20-\x7e]+$/.test(name)) {
		return `"${name.replace(/["\\]/g, '\\$&')}" <${email}>`;
	}

	// Eleven Unicode code points fit within the MIME limit of 75 bytes per encoded word.
	const words = name.match(/.{1,11}/gsu)!.map((part) => {
		return `=?UTF-8?B?${Buffer.from(part).toString('base64')}?=`;
	});
	return `${words.join(' ')} <${email}>`;
}

export async function sendNewsletterEmail(
	config: Record<string, string>,
	message: Message,
	delivery?: Delivery
) {
	const client = new SESv2Client({
		region: config.awsRegion || 'eu-west-1',
		credentials: { accessKeyId: config.awsAccessKey, secretAccessKey: config.awsSecretKey },
		maxAttempts: 1
	});
	const result = await client.send(
		new SendEmailCommand({
			FromEmailAddress: senderAddress(config.senderEmail, config.senderName),
			ReplyToAddresses: config.replyTo ? [config.replyTo] : undefined,
			Destination: { ToAddresses: [message.email] },
			Content: {
				Simple: newsletterContent(message, delivery, config.emailFontSize, config.emailMaxWidth)
			}
		})
	);
	return result.MessageId || null;
}
