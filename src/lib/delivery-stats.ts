export type DeliverySummary = {
	campaign_id: string;
	locale: string;
	total: number;
	sent: number;
	pending: number;
	failed: number;
	suppressed: number;
	opened: number;
};
export function summarizeDeliveries(rows: DeliverySummary[]) {
	return rows.reduce(
		(sum, row) => ({
			total: sum.total + row.total,
			sent: sum.sent + row.sent,
			pending: sum.pending + row.pending,
			failed: sum.failed + row.failed,
			suppressed: sum.suppressed + row.suppressed,
			opened: sum.opened + row.opened
		}),
		{ total: 0, sent: 0, pending: 0, failed: 0, suppressed: 0, opened: 0 }
	);
}
export type DeliveryRow = {
	id: string;
	name: string;
	email: string;
	locale: string;
	status: string;
	open_count: number;
	error: string | null;
	sent_at: string | null;
};
