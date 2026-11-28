<script lang="ts">
	import { untrack } from 'svelte';
	import Icon from './Icon.svelte';
	import { localDateTime } from '#lib/campaign-dates.js';
	let {
		value = $bindable(''),
		disabled = false,
		timezone = '',
		close
	}: { value?: string; disabled?: boolean; timezone?: string; close: () => void } = $props();
	let month = $state(
		untrack(() => (value ? new Date(value.length === 10 ? value + 'T12:00' : value) : new Date()))
	);
	const weekdays = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
	const monthLabel = $derived(month.toLocaleDateString('en', { month: 'long', year: 'numeric' }));
	const selectedDay = $derived(value.slice(0, 10));
	const time = $derived(value ? value.slice(11, 16) : '09:00');
	const days = $derived.by(() => {
		const year = month.getFullYear();
		const m = month.getMonth();
		const offset = (new Date(year, m, 1).getDay() + 6) % 7;
		return Array.from({ length: offset + new Date(year, m + 1, 0).getDate() }, (_, i) =>
			i < offset ? null : new Date(year, m, i - offset + 1, 12)
		);
	});
	function select(date: Date) {
		value = localDateTime(date).slice(0, 10) + (time ? `T${time}` : '');
	}
</script>

<div class="calendar-header">
	<button
		type="button"
		aria-label="Previous month"
		onclick={() => (month = new Date(month.getFullYear(), month.getMonth() - 1, 1))}
	>
		<Icon name="left" size={16} />
	</button>
	<strong aria-live="polite">{monthLabel}</strong>
	<button
		type="button"
		aria-label="Next month"
		onclick={() => (month = new Date(month.getFullYear(), month.getMonth() + 1, 1))}
	>
		<Icon name="chevron" size={16} />
	</button>
</div>
<div class="calendar-grid">
	{#each weekdays as day (day)}<span class="weekday" aria-hidden="true">{day}</span>{/each}
	{#each days as date, index (date?.getTime() ?? index)}
		{#if date}
			{@const key = localDateTime(date).slice(0, 10)}
			<button
				type="button"
				class="day"
				aria-label={date.toLocaleDateString('en', { dateStyle: 'full' })}
				aria-pressed={key === selectedDay}
				data-today={key === localDateTime(new Date()).slice(0, 10)}
				{disabled}
				onclick={() => select(date)}
			>
				{date.getDate()}
			</button>
		{:else}<span></span>{/if}
	{/each}
</div>
<label class="time-field">
	Send at<input
		type="time"
		value={time}
		disabled={disabled || !value}
		oninput={(event) => {
			if (selectedDay)
				value = selectedDay + (event.currentTarget.value ? `T${event.currentTarget.value}` : '');
		}}
	/>
</label>
<p>{timezone || 'Your local timezone'}</p>
<div class="calendar-actions">
	<button
		type="button"
		class="clear"
		disabled={disabled || !value}
		onclick={() => {
			value = '';
			close();
		}}
	>
		Clear deadline
	</button>
	<button type="button" class="primary" onclick={close}>Done</button>
</div>

<style>
	.calendar-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 12px;
		font-size: 14px;
	}
	.calendar-header button {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: 6px;
		font-size: 24px;
	}
	.calendar-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 3px;
	}
	.weekday {
		text-align: center;
		font-size: 11px;
		color: var(--text-secondary);
		padding: 6px 0;
	}
	.day {
		height: 34px;
		border-radius: 7px;
		font-size: 13px;
		padding: 0;
	}
	.day:hover,
	.calendar-header button:hover {
		background: var(--surface-muted);
	}
	.day[data-today='true'] {
		box-shadow: inset 0 0 0 1px var(--accent);
	}
	.day[aria-pressed='true'] {
		background: var(--accent);
		color: white;
	}
	.time-field {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin: 16px 0 0;
		font-size: 13px;
	}
	.time-field input {
		width: 132px;
		padding: 8px;
	}
	p {
		margin: 8px 0 16px;
		color: var(--text-secondary);
		font-size: 11px;
	}
	.calendar-actions {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		border-top: 1px solid var(--border);
		padding-top: 12px;
	}
	.clear {
		font-size: 12px;
		color: var(--text-secondary);
	}
	button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>
