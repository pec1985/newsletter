<script lang="ts">
	import {
		usageRows,
		activityRows,
		usageOperators,
		activityOperators
	} from '#lib/audience-filters.js';
	import { Tooltip } from 'flowbite-svelte';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { fromAction } from 'svelte/attachments';
	import { page } from '$app/state';
	import Icon from '#lib/Icon.svelte';
	import AppShell from '#lib/AppShell.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
	let deleting = $state<{ id: string; name: string } | null>(null);
	let editorId = $derived<string | null>(form?.id ?? page.url.searchParams.get('edit'));
	let showError = $derived(Boolean(form?.message));
	const selected = $derived(data.audiences.find((a) => a.id === editorId));
	const values = $derived(showError ? form?.values : selected);

	const usage = $derived(showError && form ? form.values.usage : usageRows(selected));
	const activity = $derived(showError && form ? form.values.activity : activityRows(selected));

	function skippedFields() {
		if (showError && form)
			return {
				plan: form.values.plan_empty,
				usage: form.values.usage_empty,
				activity: form.values.activity_empty
			};
		return {
			plan: !selected?.plan,
			usage: usage.every((rule) => !rule.value),
			activity: activity.every((rule) => !rule.value)
		};
	}
	let skipped = $derived(skippedFields());
	let saveError = $derived(form?.message ?? '');
	const saveAudience: SubmitFunction<undefined, { message: string }> = ({ formElement }) => {
		saveError = '';
		return async ({ result, update }) => {
			if (!formElement.isConnected) return;
			if (result.type === 'failure') {
				saveError = String(result.data?.message ?? 'Could not save the audience.');
				return;
			}
			await update();
			if (result.type === 'redirect' || result.type === 'success') editorId = null;
		};
	};
	function openEditor(id: string) {
		saveError = '';
		showError = false;
		editorId = id;
		skipped = skippedFields();
	}
</script>

<AppShell
	companyName={data.config.companyName || 'Postscript'}
	section="audiences"
	settingsTab=""
	title="Audiences"
>
	<div class="audience-page">
		<header>
			<h1>Audiences</h1>
			<button class="primary" aria-haspopup="dialog" onclick={() => openEditor('')}>
				Add audience
			</button>
		</header>
		<div class="card table-wrap">
			<table aria-label="Saved audiences">
				<thead>
					<tr>
						<th scope="col">Audience</th><th scope="col">SQL query</th><th scope="col">
							Actions
						</th>
					</tr>
				</thead>
				<tbody>
					{#each data.audiences as audience (audience.id)}
						<tr>
							<td><strong>{audience.name}</strong></td>
							<td class="query">
								<button class="query-preview" aria-describedby={'full-sql-' + audience.id}>
									<code>{audience.filterSql || 'All eligible contacts'}</code>
								</button>
								<Tooltip
									id={'full-sql-' + audience.id}
									placement="bottom-start"
									strategy="fixed"
									arrow={false}
									class="sql-popup"
								>
									<code>{audience.query}</code>
								</Tooltip>
							</td>
							<td>
								<div class="row-actions">
									<button
										class="icon-button"
										title="Edit audience"
										aria-label={'Edit ' + audience.name}
										aria-haspopup="dialog"
										onclick={() => openEditor(audience.id)}
									>
										<Icon name="edit" size={18} />
									</button>
									<button
										class="icon-button remove"
										title="Delete audience"
										aria-label={'Delete ' + audience.name}
										aria-haspopup="dialog"
										onclick={() => (deleting = audience)}
									>
										<Icon name="trash" size={18} />
									</button>
								</div>
							</td>
						</tr>
					{:else}
						<tr><td colspan="3">No saved audiences yet.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
	{#if deleting}
		<dialog
			class="modal confirm"
			aria-labelledby="delete-title"
			aria-describedby="delete-description"
			{@attach (node) => {
				node.showModal();
			}}
			onclose={() => (deleting = null)}
		>
			<h2 id="delete-title">Delete audience?</h2>
			<p id="delete-description">
				Delete “{deleting.name}”? This removes it from draft audience selections.
			</p>
			<form method="POST" action="/audiences" class="actions">
				<input type="hidden" name="id" value={deleting.id} />
				<input type="hidden" name="intent" value="delete" />
				<button
					type="button"
					class="secondary"
					onclick={(event) => event.currentTarget.closest('dialog')?.close()}
				>
					Cancel
				</button>
				<button class="delete-button">Delete audience</button>
			</form>
		</dialog>
	{/if}
	{#if editorId === '' || selected}
		<dialog
			class="modal"
			aria-labelledby="editor-title"
			{@attach (node) => {
				node.showModal();
			}}
			onclose={() => (editorId = null)}
		>
			<h2 id="editor-title">{selected ? 'Edit audience' : 'Add audience'}</h2>
			<form
				method="POST"
				action="/audiences"
				{@attach fromAction(enhance<undefined, { message: string }>, () => saveAudience)}
			>
				<input type="hidden" name="id" value={selected?.id || ''} />
				<label>
					Name<input
						name="name"
						value={values?.name ?? ''}
						required
						maxlength="100"
						placeholder="Premium regulars"
					/>
				</label>
				<p>Check Empty to skip a filter. Blank usage and last usage fields are also skipped.</p>
				<div class="filters">
					<div class="filter">
						<label for="filter-plan">Plan</label>
						<span class="equals" aria-label="equals">=</span>
						<div class="operator">
							<select
								class="plan-select"
								id="filter-plan"
								name="plan"
								value={values?.plan ?? data.plans[0]}
								required
								disabled={skipped.plan}
							>
								{#each data.plans as plan (plan)}<option value={plan}>{plan}</option>{/each}
							</select>
							<span class="operator-chevron"><Icon name="down" size={12} /></span>
						</div>
						<label class="skip-filter">
							<input
								type="checkbox"
								name="plan_empty"
								aria-label="Skip plan filter"
								checked={skipped.plan}
								onchange={(event) => (skipped = { ...skipped, plan: event.currentTarget.checked })}
							/>Empty
						</label>
					</div>
					{#each usage as rule, i (i)}
						<div class="filter">
							<label for={'usage-' + i}>Usage</label>
							<div class="operator">
								<select
									aria-label="Usage operator"
									disabled={skipped.usage}
									name="usage_operator"
									value={rule.operator}
								>
									{#each usageOperators as op (op)}<option value={op}>{op}</option>{/each}
								</select><span class="operator-chevron"><Icon name="down" size={12} /></span>
							</div>
							<input
								id={'usage-' + i}
								disabled={skipped.usage}
								name="usage_value"
								maxlength="402"
								value={rule.value}
								placeholder="Number or label"
							/>
							{#if i === 0}<label class="skip-filter">
									<input
										type="checkbox"
										name="usage_empty"
										aria-label="Skip usage filter"
										checked={skipped.usage}
										onchange={(event) =>
											(skipped = { ...skipped, usage: event.currentTarget.checked })}
									/>Empty
								</label>{/if}
						</div>
					{/each}
					{#each activity as rule, i (i)}
						<div class="filter">
							<label for={'activity-' + i}>Last usage</label>
							<div class="operator">
								<select
									aria-label="Last usage operator"
									disabled={skipped.activity}
									name="activity_operator"
									value={rule.operator}
								>
									{#each activityOperators as op (op)}<option value={op}>{op}</option>{/each}
								</select><span class="operator-chevron"><Icon name="down" size={12} /></span>
							</div>
							<div class="duration">
								<input
									id={'activity-' + i}
									aria-label="Last usage in days ago"
									disabled={skipped.activity}
									name="activity_value"
									type="number"
									min="1"
									max="36500"
									value={rule.value}
									placeholder="30"
								/><span>days ago</span>
							</div>
							{#if i === 0}<label class="skip-filter">
									<input
										type="checkbox"
										name="activity_empty"
										aria-label="Skip last usage filter"
										checked={skipped.activity}
										onchange={(event) =>
											(skipped = { ...skipped, activity: event.currentTarget.checked })}
									/>Empty
								</label>{/if}
						</div>
					{/each}
				</div>
				{#if saveError}<p role="alert">{saveError}</p>{/if}
				<div class="actions">
					<button
						type="button"
						class="secondary"
						onclick={(event) => event.currentTarget.closest('dialog')?.close()}
					>
						Cancel
					</button>
					<button class="primary">Save audience</button>
				</div>
			</form>
		</dialog>
	{/if}
</AppShell>

<style>
	.audience-page {
		padding: clamp(1rem, 4vw, 3rem);
		width: 100%;
		margin: 0;
	}
	header,
	.actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	header {
		margin-bottom: 1.5rem;
	}
	table {
		font-size: 0.9375rem;
	}
	th {
		font-size: 0.875rem;
	}
	td {
		vertical-align: top;
	}
	td:first-child,
	td:last-child {
		width: 1%;
	}
	td:first-child strong {
		display: block;
		width: max-content;
		max-width: clamp(7rem, 18vw, 23rem);
		white-space: normal;
		overflow-wrap: anywhere;
	}
	.query-preview {
		display: block;
		width: 100%;
		text-align: start;
		white-space: pre-wrap;
		padding: 0;
	}
	.query-preview:hover,
	.query-preview:focus-visible {
		color: var(--accent);
	}
	:global(.sql-popup) {
		max-width: min(34rem, calc(100vw - 2rem));
		padding: 0.75rem 1rem;
		border-radius: 0.5rem;
		background: #241c32;
		color: white;
		box-shadow: 0 4px 16px #1f172333;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		text-align: start;
	}
	.query {
		white-space: normal;
		overflow-wrap: anywhere;
		line-height: 1.5;
	}
	.query code {
		font:
			0.875rem/1.55 ui-monospace,
			monospace;
	}
	.row-actions {
		display: flex;
		gap: 0.35rem;
	}
	.icon-button {
		display: grid;
		place-items: center;
		width: 2.5rem;
		height: 2.5rem;
		border: 1px solid var(--border);
		border-radius: 7px;
	}
	.icon-button:hover {
		color: var(--accent);
		background: var(--surface-muted);
	}
	.remove:hover {
		color: #a71930;
	}
	.confirm.modal {
		width: min(28rem, calc(100vw - 2rem));
	}
	.confirm .actions {
		display: flex;
	}
	.delete-button {
		background: #a71930;
		color: white;
		padding: 0.7rem 1rem;
		border-radius: 7px;
		font-weight: 600;
	}
	@media (max-width: 650px) {
		.query code {
			font-size: 0.75rem;
		}
		.row-actions {
			flex-direction: column;
		}
	}

	dialog.modal {
		position: fixed;
		margin: auto;
		width: min(40rem, calc(100vw - 2rem));
	}
	dialog::backdrop {
		background: rgb(24 16 39 / 0.5);
	}
	dialog h2 {
		margin: 0 0 1.25rem;
	}
	form,
	label {
		display: grid;
		gap: 0.4rem;
	}
	dialog label {
		margin: 0;
		font-size: 1rem;
		line-height: 1.4;
	}
	dialog input,
	dialog select {
		height: 2.875rem;
		font-size: 1rem;
	}
	form {
		gap: 1.25rem;
	}
	.filters {
		display: grid;
		gap: 0.75rem;
	}
	.filter {
		display: grid;
		grid-template-columns: 6rem 4.5rem minmax(0, 1fr) 4.5rem;
		align-items: center;
		gap: 0.6rem;
	}
	.operator {
		position: relative;
	}
	.operator-chevron {
		position: absolute;
		inset-inline-end: 0.5rem;
		top: 50%;
		transform: translateY(-50%);
		display: flex;
		pointer-events: none;
		color: var(--text-secondary);
	}
	.filter select {
		appearance: none;
		padding-inline: 0.25rem 1.5rem;
		text-align: center;
	}
	.filter .plan-select {
		text-align: start;
		padding-inline-start: 0.75rem;
	}
	.filter .skip-filter {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.875rem;
	}
	.filter input[type='checkbox'] {
		width: 1rem;
		height: 1rem;
		padding: 0;
		margin: 0;
		flex: none;
		accent-color: var(--accent);
	}
	.filter :disabled {
		opacity: 0.55;
	}
	.equals {
		text-align: center;
	}
	.filter select,
	.filter input {
		width: 100%;
		min-width: 0;
	}
	.duration {
		position: relative;
		min-width: 0;
	}
	.duration input {
		padding-right: 5.25rem;
		appearance: textfield;
	}
	.duration input::-webkit-inner-spin-button {
		appearance: none;
	}
	.duration span {
		position: absolute;
		right: 0.75rem;
		top: 50%;
		transform: translateY(-50%);
		pointer-events: none;
		white-space: nowrap;
		font-size: 0.9375rem;
		color: var(--text-secondary);
	}
	input {
		min-width: 0;
	}
	p[role='alert'] {
		color: #a71930;
		font-weight: 600;
	}
	p {
		color: var(--text-secondary);
	}
	.actions {
		padding-top: 1rem;
		border-top: 1px solid var(--border);
		justify-content: flex-end;
	}
	@media (max-width: 360px) {
		.duration input {
			padding-left: 0.4rem;
			padding-right: 4.25rem;
		}
		.duration span {
			right: 0.4rem;
		}
	}
	@media (max-width: 520px) {
		th,
		td {
			padding: 0.75rem;
		}
		.filter {
			grid-template-columns: 5rem 3.5rem minmax(0, 1fr);
			gap: 0.45rem 0.35rem;
		}
		.filter .skip-filter {
			grid-column: 3;
			justify-self: start;
		}
		dialog.modal {
			padding: 1.25rem;
		}
	}
</style>
