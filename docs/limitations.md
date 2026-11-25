# Status and limitations

This is a single-workspace MVP with container deployment support. Before broader production use, add SES event ingestion for delivery/bounces/complaints, production login hardening, sending rate limits, pagination for large contact lists, and recovery controls for interrupted jobs. A worker crash after submission can leave a delivery in `processing`; jobs are deliberately not automatically replayed because SES does not guarantee idempotent sends. Failed deliveries are visible but do not yet have a retry UI.

## Email deliverability

Recorded opens are image requests, not proof of a human read. Email clients may block or proxy images. The footer link opens a confirmation page. SES campaigns also include a stable List-ID and RFC 8058 one-click unsubscribe headers. Mailbox providers can POST directly to opt out a recipient immediately. Opening either URL with GET never changes subscription status. Before a bulk send, inspect a delivered sample for passing SPF, DKIM and aligned DMARC. Verify that a passing DKIM signature covers both List-Unsubscribe and List-Unsubscribe-Post in its `h=` field. See [RFC 8058](https://www.rfc-editor.org/rfc/rfc8058#section-3.1) and [Gmail’s bulk sender requirements](https://support.google.com/mail/answer/81126).
