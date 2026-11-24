<script lang="ts">
	import Icon from './Icon.svelte';
	import { onMount, untrack } from 'svelte';
	import type { LayoutData } from '../routes/(workspace)/$types';
	import { summarizeDeliveries, type DeliveryRow } from '#lib/delivery-stats.js';
	import { renderEmail } from '#lib/email.js';
	let { data, campaignId }: { data: LayoutData; campaignId: string } = $props();
	const campaign = $derived(data.campaigns.find((c) => c.id === campaignId)!);
	const languages = $derived(data.deliverySummaries.filter((s) => s.campaign_id === campaignId));
	const summary = $derived(summarizeDeliveries(languages));
	const versions = $derived(data.versions.filter((v) => v.campaign_id === campaignId));
	let previewLocale = $state(
		untrack(
			() =>
				versions.find((v) => v.locale === campaign.source_locale)?.locale ||
				versions[0]?.locale ||
				campaign.source_locale
		)
	);
	const version = $derived(versions.find((v) => v.locale === previewLocale));
	let tab = $state('overview');
	let search = $state('');
	let appliedSearch = '';
	let filter = $state('all');
	let locale = $state('');
	let rows = $state<DeliveryRow[]>([]);
	let total = $state(0);
	let page = $state(1);
	let loading = $state(false);
	let problem = $state('');
	let controller: AbortController | undefined;
	const pageSize = 50;
	const number = (value: number) => value.toLocaleString();
	function language(value: string) {
		try {
			return new Intl.DisplayNames(['en'], { type: 'language' }).of(value) || value;
		} catch {
			return value;
		}
	}
	function deliveryStatus(value: string) {
		return value === 'sent'
			? campaign.mode === 'local'
				? 'Simulated'
				: 'Accepted by SES'
			: { queued: 'Queued', processing: 'Processing', failed: 'Failed', suppressed: 'Suppressed' }[
					value
				] || value;
	}
	async function loadRecipients(nextPage = 1) {
		controller?.abort();
		const request = new AbortController();
		controller = request;
		loading = true;
		problem = '';
		try {
			const query = new URLSearchParams({
				page: String(nextPage),
				q: appliedSearch,
				status: filter,
				locale
			});
			const response = await fetch(`/api/campaigns/${campaignId}/deliveries?${query}`, {
				signal: request.signal
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.message || 'Could not load recipients.');
			if (controller !== request) return;
			rows = result.rows;
			total = result.total;
			page = result.page;
		} catch (cause) {
			if (!request.signal.aborted)
				problem = cause instanceof Error ? cause.message : 'Could not load recipients.';
		} finally {
			if (controller === request) loading = false;
		}
	}
	function openTab(value: string) {
		tab = value;
		if (value === 'recipients') void loadRecipients(page);
		else {
			controller?.abort();
			loading = false;
		}
	}
	function applyFilters() {
		appliedSearch = search.trim();
		void loadRecipients(1);
	}
	function inspectStatus(value: string) {
		filter = value;
		search = '';
		appliedSearch = '';
		locale = '';
		page = 1;
		openTab('recipients');
	}
	onMount(() => {
		const timer = setInterval(() => {
			if (tab === 'recipients' && campaign.status === 'sending' && !loading)
				void loadRecipients(page);
		}, 5000);
		return () => {
			clearInterval(timer);
			controller?.abort();
		};
	});
</script>

<section class="campaign-stats" aria-label="Campaign statistics">
	<div class="stats-tabs" role="group" aria-label="Campaign report views">
		{#each [{ id: 'overview', label: 'Overview' }, { id: 'recipients', label: 'Recipients' }, { id: 'email', label: 'Email preview' }] as item}
			<button
				class:active={tab === item.id}
				aria-pressed={tab === item.id}
				onclick={() => openTab(item.id)}
			>
				{item.label}
			</button>
		{/each}
		{#if campaign.mode === 'local'}<span class="simulation">
				Development simulation · No emails sent
			</span>{/if}
	</div>
	{#if tab === 'overview'}
		<div class="summary-grid">
			<div>
				<span>Recipients</span><strong>{number(summary.total)}</strong><small>
					{languages.length} languages
				</small>
			</div>
			<div>
				<span>{campaign.mode === 'local' ? 'Simulated sends' : 'Accepted by SES'}</span><strong>
					{number(summary.sent)}
				</strong><small>{number(summary.pending)} pending</small>
			</div>
			<div>
				<span>Unique opens</span><strong>{number(summary.opened)}</strong><small>
					{summary.sent ? Math.round((summary.opened / summary.sent) * 100) : 0}% of {campaign.mode ===
					'local'
						? 'simulated sends'
						: 'accepted emails'}
				</small>
			</div>
			<div>
				<span>Delivery issues</span><strong>
					{number(summary.failed + summary.suppressed)}
				</strong><small>
					{number(summary.failed)} failed · {number(summary.suppressed)} suppressed
				</small>
			</div>
		</div>
		{#if summary.pending > 0}<div class="progress-strip" role="status">
				<div>
					<strong>
						{summary.sent + summary.failed + summary.suppressed === 0
							? 'Waiting for delivery processing'
							: 'Sending in progress'}
					</strong><span>
						{number(summary.total - summary.pending)} / {number(summary.total)} processed
					</span>
				</div>
				<progress
					aria-label="Recipients processed"
					max={Math.max(summary.total, 1)}
					value={summary.total - summary.pending}
				></progress>
			</div>{/if}
		<section class="report-card">
			<div class="section-heading">
				<h2>Delivery by language</h2>
				<button class="text-button" onclick={() => openTab('recipients')}>
					View recipients <Icon name="right" size={14} />
				</button>
			</div>
			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th>Language</th><th>Recipients</th><th>
								{campaign.mode === 'local' ? 'Simulated' : 'Accepted'}
							</th><th>Pending</th><th>Opens</th><th>Issues</th>
						</tr>
					</thead><tbody>
						{#each languages as row (row.locale)}<tr>
								<td>{language(row.locale)}</td><td>{number(row.total)}</td><td>
									{number(row.sent)}
								</td><td>{number(row.pending)}</td><td>{number(row.opened)}</td><td>
									{number(row.failed + row.suppressed)}
								</td>
							</tr>
						{:else}<tr><td colspan="6">No delivery records yet.</td></tr>{/each}
					</tbody>
				</table>
			</div>
			{#if summary.failed || summary.suppressed}<div class="issue-links">
					{#if summary.failed}<button class="text-button" onclick={() => inspectStatus('failed')}>
							Inspect {number(summary.failed)} failures
						</button>{/if}
					{#if summary.suppressed}<button
							class="text-button"
							onclick={() => inspectStatus('suppressed')}
						>
							Inspect {number(summary.suppressed)} suppressed recipients
						</button>{/if}
				</div>{/if}
		</section>
		<p class="report-note">
			Opens count tracking-image loads, not confirmed reads.{campaign.mode !== 'local'
				? ' SES acceptance does not confirm inbox delivery.'
				: ''}
		</p>
	{:else if tab === 'recipients'}
		<section class="report-card" aria-label="Delivery recipients">
			<form
				class="recipient-filters"
				onsubmit={(event) => {
					event.preventDefault();
					applyFilters();
				}}
			>
				<input
					aria-label="Search recipients"
					placeholder="Search name or email"
					bind:value={search}
					maxlength="200"
				/>
				<span class="select-control">
					<select aria-label="Filter delivery status" bind:value={filter} onchange={applyFilters}>
						<option value="all">All statuses</option><option value="sent">
							{campaign.mode === 'local' ? 'Simulated' : 'Accepted by SES'}
						</option><option value="queued">Queued</option><option value="processing">
							Processing
						</option><option value="opened">Opened</option><option value="failed">
							Failed
						</option><option value="suppressed">Suppressed</option>
					</select><Icon name="down" size={14} />
				</span>
				<span class="select-control">
					<select
						aria-label="Filter recipient language"
						bind:value={locale}
						onchange={applyFilters}
					>
						<option value="">All languages</option>{#each languages as row}<option
								value={row.locale}
							>
								{language(row.locale)}
							</option>{/each}
					</select><Icon name="down" size={14} />
				</span>
				<button class="secondary" type="submit">Search</button>
			</form>
			{#if problem}<div class="recipient-error" role="alert">
					{problem}<button class="text-button" onclick={() => loadRecipients(page)}>Retry</button>
				</div>{/if}
			<div class="table-wrap" aria-busy={loading}>
				<table>
					<thead>
						<tr><th>Recipient</th><th>Language</th><th>Status</th><th>Opens</th></tr>
					</thead><tbody>
						{#each rows as row (row.id)}<tr>
								<td><strong>{row.name}</strong><small>{row.email}</small></td><td>
									{language(row.locale)}
								</td><td>
									<span class="delivery-status" class:failed={row.status === 'failed'}>
										{deliveryStatus(row.status)}
									</span>{#if row.error}<details>
											<summary>Error details</summary>
											<p>{row.error}</p>
										</details>{/if}
								</td><td>{number(row.open_count)}</td>
							</tr>
						{:else}<tr>
								<td colspan="4">
									{loading ? 'Loading recipients…' : 'No recipients match these filters.'}
								</td>
							</tr>{/each}
					</tbody>
				</table>
			</div>
			<div class="pagination">
				<span aria-live="polite">
					{loading
						? 'Loading…'
						: total
							? `${number((page - 1) * pageSize + 1)}–${number(Math.min(page * pageSize, total))} of ${number(total)} recipients`
							: '0 recipients'}
				</span>
				<div>
					<button
						class="secondary"
						disabled={loading || page <= 1}
						onclick={() => loadRecipients(page - 1)}
					>
						Previous
					</button><button
						class="secondary"
						disabled={loading || page * pageSize >= total}
						onclick={() => loadRecipients(page + 1)}
					>
						Next
					</button>
				</div>
			</div>
		</section>
	{:else}
		<section class="report-card email-report">
			<div class="section-heading">
				<h2>Campaign email</h2>
				<span class="select-control">
					<select aria-label="Preview language" bind:value={previewLocale}>
						{#each versions as row}<option value={row.locale}>{language(row.locale)}</option>{/each}
					</select><Icon name="down" size={14} />
				</span>
			</div>
			<h3>{version?.subject || campaign.subject}</h3>
			<div class="email-preview">{@html renderEmail(version?.body || campaign.body)}</div>
		</section>
	{/if}
</section>

<style>
	.campaign-stats {
		margin: 0 32px;
	}
	.stats-tabs {
		display: flex;
		align-items: center;
		gap: 24px;
		border-bottom: 1px solid var(--border);
		margin-bottom: 24px;
		flex-wrap: wrap;
	}
	.stats-tabs button {
		padding: 14px 0;
		color: var(--text-secondary);
		border-bottom: 2px solid transparent;
		font-size: 14px;
	}
	.stats-tabs button.active {
		color: var(--accent);
		border-color: var(--accent);
		font-weight: 600;
	}
	.simulation {
		margin-left: auto;
		color: var(--muted);
		font-size: 12px;
	}
	.summary-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		margin-bottom: 24px;
	}
	.summary-grid > div {
		padding: 22px 24px;
		display: grid;
		gap: 7px;
		border-right: 1px solid var(--border);
	}
	.summary-grid > div:last-child {
		border-right: 0;
	}
	.summary-grid span,
	.summary-grid small {
		color: var(--text-secondary);
		font-size: 12px;
	}
	.summary-grid strong {
		font-size: 30px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.progress-strip {
		padding: 0 0 24px;
	}
	.progress-strip > div {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 10px;
		font-size: 13px;
		color: var(--text-secondary);
	}
	.progress-strip strong {
		font-weight: 500;
	}
	progress {
		width: 100%;
		height: 6px;
		border: 0;
		border-radius: 4px;
		overflow: hidden;
		accent-color: var(--accent);
		display: block;
	}
	progress::-webkit-progress-bar {
		background: var(--border);
	}
	progress::-webkit-progress-value {
		background: var(--accent);
	}
	.report-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		overflow: hidden;
	}
	.section-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 18px 24px;
		gap: 16px;
	}
	h2 {
		font-size: 16px;
		font-weight: 600;
	}
	th,
	td {
		padding: 14px 24px;
		font-size: 13px;
	}
	th {
		text-transform: none;
		letter-spacing: 0;
	}
	td strong,
	td small {
		display: block;
	}
	td small {
		margin-top: 4px;
		color: var(--muted);
		font-size: 12px;
	}
	td {
		overflow-wrap: anywhere;
	}
	.report-note {
		color: var(--muted);
		font-size: 12px;
		margin-top: 16px;
	}
	.recipient-filters {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 12px;
		padding: 18px 24px;
	}
	.recipient-filters input {
		flex: 1;
		min-width: 180px;
		width: auto;
	}
	.pagination {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 16px 24px;
		color: var(--muted);
		font-size: 12px;
	}
	.pagination > div {
		display: flex;
		gap: 8px;
	}
	.delivery-status {
		font-size: 12px;
		background: var(--surface-muted);
		padding: 4px 8px;
		border-radius: 4px;
		white-space: nowrap;
	}
	.failed {
		color: var(--danger-text);
		background: var(--danger-bg);
	}
	details {
		margin-top: 8px;
		max-width: 440px;
	}
	details summary {
		cursor: pointer;
		font-size: 12px;
	}
	details p {
		padding: 8px 0;
	}
	.recipient-error,
	.issue-links {
		padding: 16px 24px;
		display: flex;
		gap: 16px;
	}
	.recipient-error {
		color: var(--danger-text);
	}
	.email-report h3 {
		padding: 0 24px 20px;
		font-size: 20px;
	}
	.email-preview {
		padding: 24px;
		border-top: 1px solid var(--border);
	}
	button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 3px;
	}
	@media (max-width: 900px) {
		.summary-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.summary-grid > div {
			border-bottom: 1px solid var(--border);
		}
		.simulation {
			margin-left: 0;
			padding-bottom: 12px;
		}
	}
	@media (max-width: 600px) {
		.campaign-stats {
			margin: 0 20px;
		}
		.summary-grid > div {
			padding: 16px;
		}
		.stats-tabs {
			gap: 16px;
		}
		th,
		td {
			padding: 12px;
		}
		.pagination {
			flex-wrap: wrap;
		}
	}
</style>
