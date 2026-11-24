<script lang="ts">
	import type { LayoutData } from '../routes/(workspace)/$types';
	import Icon from '#lib/Icon.svelte';
	import { formatCampaignDate } from '#lib/campaign-dates.js';
	import { campaignStatus, campaignAction } from '#lib/navigation.js';
	let { data, busy, oncreate }: { data: LayoutData; busy: string; oncreate: () => Promise<void> } =
		$props();
	let filter = $state('all');
	const filters = [
		{ id: 'all', label: 'All campaigns' },
		{ id: 'draft', label: 'Drafts' },
		{ id: 'scheduled', label: 'Scheduled' },
		{ id: 'sending', label: 'Sending' },
		{ id: 'sent', label: 'Sent' },
		{ id: 'attention', label: 'Needs attention' }
	];
	const visibleCampaigns = $derived(
		data.campaigns.filter((campaign) => filter === 'all' || campaign.status === filter)
	);
	const deliveryCounts = $derived.by(() => {
		const result = new Map<string, { total: number; sent: number }>();
		for (const delivery of data.deliverySummaries) {
			const counts = result.get(delivery.campaign_id) || { total: 0, sent: 0 };
			counts.total += delivery.total;
			counts.sent += delivery.sent;
			result.set(delivery.campaign_id, counts);
		}
		return result;
	});
	const date = (value: unknown) =>
		value
			? new Date(String(value)).toLocaleDateString('en', {
					month: 'short',
					day: 'numeric',
					year: 'numeric'
				})
			: '—';
</script>

<section class="campaign-list card" aria-label="Campaign list">
	<div class="list-toolbar">
		<div class="status-filters" role="group" aria-label="Filter campaigns by status">
			{#each filters as item (item.id)}
				<button
					class:chosen={filter === item.id}
					aria-pressed={filter === item.id}
					onclick={() => (filter = item.id)}
				>
					{item.label}<span>
						{item.id === 'all'
							? data.campaigns.length
							: data.campaigns.filter((c) => c.status === item.id).length}
					</span>
				</button>
			{/each}
		</div>
		<button class="primary create-campaign" onclick={oncreate} disabled={!!busy}>
			<Icon name="plus" size={17} />{busy === 'new' ? 'Creating…' : 'New campaign'}
		</button>
	</div>
	<div class="table-wrap">
		<table>
			<caption class="sr-only">
				Campaigns, sending status, recipients, and last updated date
			</caption>
			<thead>
				<tr>
					<th scope="col">Campaign</th><th scope="col">Status</th><th scope="col">Recipients</th><th
						scope="col"
					>
						Dates
					</th><th scope="col"><span class="sr-only">Action</span></th>
				</tr>
			</thead>
			<tbody>
				{#each visibleCampaigns as campaign (campaign.id)}
					{@const counts = deliveryCounts.get(campaign.id)}
					<tr>
						<td class="campaign-name">
							<a href={`/campaigns/${campaign.id}`}>
								<span class="campaign-icon">
									<Icon name={campaign.status === 'draft' ? 'file' : 'send'} size={18} />
								</span><span>
									<strong>{campaign.subject || 'Untitled campaign'}</strong><small>
										{campaign.locales.length}
										{campaign.locales.length === 1 ? 'language' : 'languages'}{campaign.status !==
											'draft' && campaign.mode === 'local'
											? ' · Local test'
											: ''}
									</small>
								</span>
							</a>
						</td>
						<td>
							<span class="campaign-status" data-status={campaign.status}>
								{campaignStatus(campaign.status)}
							</span>{#if campaign.status === 'sending'}<small>
									{counts?.sent || 0} of {counts?.total || 0} sent
								</small>{/if}
						</td>
						<td>{campaign.status === 'draft' ? '—' : counts?.total || 0}</td>
						<td class="date-cell">
							{#if campaign.scheduled_at}<small>
									Send on {formatCampaignDate(campaign.scheduled_at)}
								</small>{/if}{#if !campaign.scheduled_at}{date(campaign.updated_at)}{/if}
						</td>
						<td>
							<a
								class="row-action"
								href={`/campaigns/${campaign.id}`}
								aria-label={`${campaignAction(campaign.status)}: ${campaign.subject || 'Untitled campaign'}`}
							>
								{campaignAction(campaign.status)}<Icon name="chevron" size={15} />
							</a>
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="5">
							<div class="list-empty">
								<Icon name="mail" size={28} />
								<h2>
									{data.campaigns.length
										? 'No campaigns in this view'
										: 'Create your first campaign'}
								</h2>
								<p>
									{data.campaigns.length
										? 'Choose another status to find your campaigns.'
										: 'Start with a draft, choose your audience, and send when you’re ready.'}
								</p>
								{#if data.campaigns.length}<button
										class="secondary"
										onclick={() => (filter = 'all')}
									>
										Show all campaigns
									</button>{:else}<button class="primary" onclick={oncreate} disabled={!!busy}>
										New campaign
									</button>{/if}
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<div class="list-footer">
		{visibleCampaigns.length}
		{visibleCampaigns.length === 1 ? 'campaign' : 'campaigns'}{filter !== 'all'
			? ` of ${data.campaigns.length}`
			: ''}
	</div>
</section>

<style>
	.campaign-list {
		margin: 32px 32px 0;
		overflow: hidden;
	}
	.status-filters {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.create-campaign {
		margin-left: auto;
		white-space: nowrap;
	}
	.list-toolbar {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		padding: 16px 20px;
		border-bottom: 1px solid var(--border);
	}
	.status-filters button {
		display: flex;
		gap: 8px;
		align-items: center;
		padding: 8px 10px;
		border-radius: 6px;
		font-size: 13px;
		color: var(--text-secondary);
	}
	.status-filters button.chosen {
		background: var(--accent);
		color: #fff;
		font-weight: 600;
	}
	.status-filters button:hover:not(.chosen) {
		background: var(--surface-muted);
	}
	.status-filters span {
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}
	table {
		width: 100%;
		min-width: 740px;
	}
	th {
		font-size: 12px;
		text-transform: none;
		letter-spacing: 0;
		color: var(--text-secondary);
		background: var(--surface-muted);
		padding: 14px 20px;

		font-weight: 600;
	}
	td {
		padding: 20px;
		font-size: 13px;
		color: var(--text-secondary);
		vertical-align: middle;
	}
	tbody tr:hover {
		background: var(--surface-muted);
	}
	.campaign-name {
		width: 45%;
	}
	.campaign-name a {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.campaign-name strong {
		display: block;
		font-size: 14px;
		font-weight: 600;
		color: var(--text);
		line-height: 1.5;
		overflow-wrap: anywhere;
	}
	.campaign-name a:hover strong {
		text-decoration: underline;
	}
	.campaign-icon {
		display: grid;
		place-items: center;
		width: 36px;
		height: 40px;
		border: 1px solid #d4bff5;
		border-radius: 7px;
		flex-shrink: 0;
		color: var(--accent);

		background: var(--accent-tint);
	}
	small {
		display: block;
		margin-top: 5px;
		color: var(--text-secondary);
		font-size: 12px;
	}
	.campaign-status {
		display: inline-flex;
		white-space: nowrap;
		padding: 4px 9px;
		border-radius: 5px;
		font-size: 12px;
		background: var(--surface-muted);
		color: var(--text-secondary);
	}
	.campaign-status[data-status='sent'] {
		background: var(--success-bg);
		color: var(--success-text);
	}
	.campaign-status[data-status='sending'] {
		background: var(--accent-tint);
		color: var(--accent);
	}
	.campaign-status[data-status='attention'] {
		background: var(--warning-bg);
		color: var(--warning-text);
	}
	.row-action {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 6px;
		white-space: nowrap;
		color: var(--accent);
		font-size: 13px;
		font-weight: 500;
	}
	.row-action:hover {
		text-decoration: underline;
	}
	.date-cell {
		white-space: nowrap;
	}
	.list-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		padding: 48px 24px;
		text-align: center;
	}
	.list-empty h2 {
		font-size: 20px;
	}
	.list-empty p {
		font-size: 14px;
	}
	.list-footer {
		padding: 14px 20px;
		font-size: 12px;
		color: var(--text-secondary);
		border-top: 1px solid var(--border);
	}
	a:focus-visible,
	button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 3px;
	}
	@media (max-width: 760px) {
		.campaign-list {
			margin-inline: 20px;
		}
		.list-toolbar {
			padding: 12px;
		}
	}
</style>
