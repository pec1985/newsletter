<script lang="ts">
	import { page } from '$app/state';
	import { beforeNavigate, goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import type { LayoutData } from '../routes/(workspace)/$types';
	import CampaignCalendar from './CampaignCalendar.svelte';
	import Icon from '#lib/Icon.svelte';
	import { campaignStatus, campaignAction } from '#lib/navigation.js';
	let {
		data,
		busy,
		oncreate
	}: { data: LayoutData; busy: string; oncreate: (day?: string) => Promise<void> } = $props();
	const view = $derived(page.url.searchParams.get('view') === 'calendar' ? 'Calendar' : 'Table');
	function selectView(mode: string, replace = false) {
		const url = new URL(page.url.href);
		url.searchParams.set('view', mode.toLowerCase());
		return goto(url, { replace, reset: false });
	}
	let filter = $state('all');
	let audienceFilter = $state('');
	let month = $state(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
	const returnKey = 'campaign-calendar-return';
	onMount(() => {
		const saved = sessionStorage.getItem(returnKey);
		if (!saved) return;
		sessionStorage.removeItem(returnKey);
		const requested = page.url.searchParams.get('view');
		if (requested !== null && requested !== 'calendar') return;
		const state = new URLSearchParams(saved);
		const restored = new Date(Number(state.get('month')));
		if (!Number.isFinite(restored.getTime())) return;
		month = restored;
		filter = state.get('status') || 'all';
		audienceFilter = state.get('audience') || '';
		if (requested === null) void selectView('Calendar', true);
	});
	beforeNavigate(({ to }) => {
		if (view === 'Calendar' && to?.url.pathname.startsWith('/campaigns/')) {
			sessionStorage.setItem(
				returnKey,
				new URLSearchParams({
					month: String(month.getTime()),
					status: filter,
					audience: audienceFilter
				}).toString()
			);
		}
	});
	let newestFirst = $state(true);
	const filters = [
		{ id: 'all', label: 'All campaigns' },
		{ id: 'draft', label: 'Drafts' },
		{ id: 'scheduled', label: 'Scheduled' },
		{ id: 'sending', label: 'Sending' },
		{ id: 'sent', label: 'Sent' },
		{ id: 'attention', label: 'Needs attention' }
	];
	const audienceCampaigns = $derived(
		data.campaigns.filter((campaign) => {
			if (!audienceFilter) return true;
			if (campaign.all_users) return audienceFilter === 'all-users';
			if (audienceFilter === 'unassigned') return campaign.audience_ids.length === 0;
			return campaign.audience_ids.includes(audienceFilter);
		})
	);
	const timestamp = (campaign: LayoutData['campaigns'][number]) =>
		new Date(campaign.scheduled_at ?? campaign.updated_at).getTime();
	const visibleCampaigns = $derived(
		audienceCampaigns
			.filter((campaign) => filter === 'all' || campaign.status === filter)
			.sort((a, b) => (newestFirst ? timestamp(b) - timestamp(a) : timestamp(a) - timestamp(b)))
	);
	const deliveryCounts = $derived.by(() => {
		const result = new SvelteMap<string, { total: number; sent: number }>();
		for (const delivery of data.deliverySummaries) {
			const counts = result.get(delivery.campaign_id) || { total: 0, sent: 0 };
			counts.total += delivery.total;
			counts.sent += delivery.sent;
			result.set(delivery.campaign_id, counts);
		}
		return result;
	});
	const dateFormatter = new Intl.DateTimeFormat(undefined, {
		dateStyle: 'short',
		timeStyle: 'short'
	});
</script>

<section class="campaign-list card" aria-label="Campaign list">
	<div class="list-toolbar">
		<div class="view-switch" role="group" aria-label="Campaign view">
			{#each ['Table', 'Calendar'] as mode (mode)}
				<button aria-pressed={view === mode} onclick={() => view !== mode && selectView(mode)}>
					{mode}
				</button>
			{/each}
		</div>
		<div class="filter-control">
			{#if filter === 'all'}<span aria-hidden="true">Filter</span>{/if}
			<select
				aria-label="Filter campaigns by status"
				class:show-placeholder={filter === 'all'}
				bind:value={filter}
			>
				{#each filters as item (item.id)}
					<option value={item.id}>
						{item.label} ({item.id === 'all'
							? audienceCampaigns.length
							: audienceCampaigns.filter((campaign) => campaign.status === item.id).length})
					</option>
				{/each}
			</select>
		</div>
		<div class="filter-control">
			<select aria-label="Filter campaigns by audience" bind:value={audienceFilter}>
				<option value="">All audiences</option>
				<option value="all-users">All users</option>
				{#each data.audiences as audience (audience.id)}
					<option value={audience.id}>{audience.name}</option>
				{/each}
				<option value="unassigned">No audience assigned</option>
			</select>
		</div>
		<button class="primary create-campaign" onclick={() => oncreate()} disabled={!!busy}>
			<Icon name="plus" size={17} />{busy === 'new' ? 'Creating…' : 'New campaign'}
		</button>
	</div>
	{#if view === 'Calendar'}
		<CampaignCalendar campaigns={visibleCampaigns} bind:month {oncreate} disabled={!!busy} />
	{:else}
		<div class="table-wrap">
			<table>
				<caption class="sr-only">
					Campaigns, audiences, sending status, recipients, and scheduled or last updated date
				</caption>
				<thead>
					<tr>
						<th scope="col">Campaign</th><th scope="col">Audience</th><th scope="col">Status</th><th
							scope="col"
						>
							Recipients
						</th><th scope="col" aria-sort={newestFirst ? 'descending' : 'ascending'}>
							<button
								onclick={() => (newestFirst = !newestFirst)}
								aria-label={newestFirst ? 'Sort dates oldest first' : 'Sort dates newest first'}
							>
								Dates <span aria-hidden="true">{newestFirst ? '↓' : '↑'}</span>
							</button>
						</th><th scope="col"><span class="sr-only">Action</span></th>
					</tr>
				</thead>
				<tbody>
					{#each visibleCampaigns as campaign (campaign.id)}
						{@const counts = deliveryCounts.get(campaign.id)}
						{@const audienceNames = campaign.all_users
							? ['All users']
							: data.audiences
									.filter((audience) => campaign.audience_ids.includes(audience.id))
									.map((audience) => audience.name)}
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
								<div class="audience-list">
									{#each audienceNames as name (name)}
										<span class="audience-pill">{name}</span>
									{:else}
										No audience assigned
									{/each}
								</div>
							</td>
							<td>
								<span class="campaign-status" data-status={campaign.status}>
									{campaignStatus(campaign.status)}
								</span>{#if campaign.status === 'sending'}<small>
										{counts?.sent || 0} of {counts?.total || 0} sent
									</small>{/if}
							</td>
							<td>
								{campaign.status === 'scheduled'
									? data.scheduledCounts[campaign.id]
									: campaign.status === 'draft'
										? '—'
										: counts?.total || 0}
							</td>
							<td class="date-cell">
								{dateFormatter.format(timestamp(campaign))}
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
							<td colspan="6">
								<div class="list-empty">
									<Icon name="mail" size={28} />
									<h2>
										{data.campaigns.length
											? 'No campaigns in this view'
											: 'Create your first campaign'}
									</h2>
									<p>
										{data.campaigns.length
											? 'Try another status or audience.'
											: 'Start with a draft, choose your audience, and send when you’re ready.'}
									</p>
									{#if data.campaigns.length}<button
											class="secondary"
											onclick={() => {
												filter = 'all';
												audienceFilter = '';
											}}
										>
											Show all campaigns
										</button>{:else}<button
											class="primary"
											onclick={() => oncreate()}
											disabled={!!busy}
										>
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
			{visibleCampaigns.length === 1 ? 'campaign' : 'campaigns'}{filter !== 'all' || audienceFilter
				? ` of ${data.campaigns.length}`
				: ''}
		</div>
	{/if}
</section>

<style>
	.campaign-list {
		margin: 32px 32px 0;
		overflow: hidden;
	}
	.list-toolbar select {
		appearance: none;
		padding-inline-end: 34px;
		max-width: min(18rem, 100%);
	}
	.filter-control {
		position: relative;
	}
	.filter-control::after {
		content: '';
		position: absolute;
		inset-inline-end: 14px;
		top: 50%;
		width: 7px;
		height: 7px;
		border: solid var(--text-secondary);
		border-width: 0 1.5px 1.5px 0;
		transform: translateY(-70%) rotate(45deg);
		pointer-events: none;
	}
	.view-switch {
		display: flex;
		gap: 2px;
		background: var(--surface-muted);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 3px;
		margin-inline-end: 6px;
	}
	.view-switch button {
		font-size: 13px;
		border-radius: 5px;
		padding: 7px 12px;
		color: var(--text-secondary);
	}
	.view-switch button[aria-pressed='true'] {
		background: var(--surface);
		color: var(--accent);
		font-weight: 600;
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.12);
	}
	.filter-control span {
		pointer-events: none;
		position: absolute;
		inset-inline-start: 14px;
		top: 50%;
		transform: translateY(-50%);
		font-size: 13px;
	}
	.show-placeholder {
		width: 5.5rem;
		text-indent: -9999px;
	}
	.show-placeholder option {
		text-indent: 0;
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
		width: 35%;
	}
	.audience-list {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
	}
	.audience-pill {
		max-width: 100%;
		padding: 3px 9px;
		border-radius: 999px;
		background: var(--accent-tint);
		color: var(--accent);
		font-size: 12px;
		overflow-wrap: anywhere;
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
