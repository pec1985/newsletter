<script lang="ts">
	import type { LayoutData } from '../routes/(workspace)/$types';
	import Icon from './Icon.svelte';
	import { campaignStatus } from './navigation.js';

	let {
		campaigns,
		month = $bindable(),
		oncreate,
		disabled
	}: {
		campaigns: LayoutData['campaigns'];
		month: Date;
		oncreate: (day: string) => Promise<void>;
		disabled: boolean;
	} = $props();
	const today = new Date();
	const fullDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' });
	let expandedDay = $state<number | null>(null);
	const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
	const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
	const time = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });
	const weekdays = Array.from({ length: 7 }, (_, i) => weekday.format(new Date(2024, 0, 1 + i)));
	const leading = $derived((month.getDay() + 6) % 7);
	const days = $derived.by(() => {
		const length = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
		const result = Array.from({ length }, (_, index) => ({
			date: new Date(month.getFullYear(), month.getMonth(), index + 1),
			events: [] as { id: string; subject: string; status: string; when: Date; hasTime: boolean }[]
		}));
		for (const campaign of campaigns) {
			const timestamp = campaign.sent_at ?? campaign.scheduled_at;
			const value = timestamp ?? (campaign.planned_day ? campaign.planned_day + 'T12:00' : null);
			if (!value) continue;
			const when = new Date(value);
			if (when.getFullYear() !== month.getFullYear() || when.getMonth() !== month.getMonth())
				continue;
			result[when.getDate() - 1].events.push({
				id: campaign.id,
				subject: campaign.subject || 'Untitled campaign',
				status: campaign.status,
				hasTime: !!timestamp,
				when
			});
		}
		for (const day of result)
			day.events.sort((a, b) => +a.when - +b.when || a.subject.localeCompare(b.subject));
		return result;
	});
	const count = $derived(days.reduce((total, day) => total + day.events.length, 0));
	function changeMonth(date: Date, offset = 0) {
		month = new Date(date.getFullYear(), date.getMonth() + offset, 1);
		expandedDay = null;
	}
</script>

<section aria-label="Campaign calendar">
	<div class="month-toolbar">
		<h2 aria-live="polite">{monthLabel.format(month)}</h2>
		<div class="month-controls">
			<button class="secondary" aria-label="Previous month" onclick={() => changeMonth(month, -1)}>
				<Icon name="left" size={16} />
			</button>
			<button class="secondary" onclick={() => changeMonth(new Date())}>Today</button>
			<button class="secondary" aria-label="Next month" onclick={() => changeMonth(month, 1)}>
				<Icon name="chevron" size={16} />
			</button>
		</div>
	</div>
	<div class="scroll">
		<div class="month-grid">
			{#each weekdays as label (label)}<div class="weekday">{label}</div>{/each}
			{#each Array(leading) as _, i (i)}<div class="outside"></div>{/each}
			{#each days as day (day.date.getTime())}
				{@const number = day.date.getDate()}
				<div class="day">
					<time
						class="number"
						aria-current={day.date.toDateString() === today.toDateString() ? 'date' : undefined}
						datetime={day.date.toLocaleDateString('sv-SE')}
					>
						{number}
					</time>
					<button
						type="button"
						class="add-day"
						{disabled}
						aria-label={'Create campaign for ' + fullDate.format(day.date)}
						title={'Create campaign for ' + fullDate.format(day.date)}
						onclick={() => oncreate(day.date.toLocaleDateString('sv-SE'))}
					>
						<Icon name="plus" size={15} />
					</button>
					{#each day.events.slice(0, expandedDay === number ? undefined : 2) as event (event.id)}
						<a
							href={'/campaigns/' + event.id}
							title={campaignStatus(event.status) + ' · ' + event.subject}
						>
							<span class="event-time">{event.hasTime ? time.format(event.when) : 'Draft'}</span>
							<span class="subject">{event.subject}</span>
						</a>
					{/each}
					{#if day.events.length > 2}
						<button
							class="more"
							aria-expanded={expandedDay === number}
							onclick={() => (expandedDay = expandedDay === number ? null : number)}
						>
							{expandedDay === number ? 'Show less' : '+' + (day.events.length - 2) + ' more'}
						</button>
					{/if}
				</div>
			{/each}
			{#each Array((7 - ((leading + days.length) % 7)) % 7) as _, i (i)}<div
					class="outside"
				></div>{/each}
		</div>
	</div>
	<p class="summary">
		{count === 0
			? 'No campaigns in this month for the current view.'
			: count + (count === 1 ? ' campaign' : ' campaigns') + ' this month'}
	</p>
</section>

<style>
	.month-toolbar,
	.month-controls {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.month-toolbar {
		justify-content: space-between;
		padding: 16px 20px;
		flex-wrap: wrap;
	}
	h2 {
		font-size: 18px;
		font-weight: 600;
	}
	.month-controls button {
		min-height: 32px;
		padding: 6px 9px;
	}
	.scroll {
		overflow-x: auto;
	}
	.month-grid {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		min-width: 550px;
		border-top: 1px solid var(--border);
	}
	.weekday,
	.day,
	.outside {
		border-bottom: 1px solid var(--border);
		border-inline-end: 1px solid var(--border);
	}
	.weekday,
	.outside {
		background: var(--surface-muted);
	}
	.weekday {
		padding: 8px 10px;
		font-size: 12px;
		color: var(--text-secondary);
		font-weight: 600;
	}
	.add-day {
		float: inline-end;
		display: inline-grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: 5px;
		color: var(--accent);
		background: var(--accent-tint);
	}
	@media (hover: hover) and (pointer: fine) {
		.add-day {
			opacity: 0;
		}
		.day:hover .add-day,
		.day:focus-within .add-day {
			opacity: 1;
		}
	}
	@media (any-pointer: coarse) {
		.add-day {
			opacity: 1;
			min-width: 32px;
			min-height: 32px;
		}
	}
	.day a {
		clear: both;
	}
	.day {
		padding: 7px;
		min-height: 92px;
	}
	.number {
		display: inline-grid;
		place-items: center;
		width: 23px;
		height: 23px;
		font-size: 12px;
		font-weight: 600;
	}
	.number[aria-current='date'] {
		border-radius: 50%;
		background: var(--accent);
		color: white;
	}
	a {
		display: block;
		margin-top: 3px;
		padding: 4px 6px;
		border-radius: 4px;
		background: var(--accent-tint);
		color: var(--accent);
		font-size: 12px;
	}
	a:hover .subject {
		text-decoration: underline;
	}
	.event-time {
		font-size: 11px;
	}
	.subject {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 600;
	}
	.more {
		color: var(--accent);
		font-size: 12px;
		padding: 4px;
	}
	.summary {
		padding: 14px 20px;
		font-size: 13px;
		color: var(--text-secondary);
	}
</style>
