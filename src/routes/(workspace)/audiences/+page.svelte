<script lang="ts">
	import {
		usageRows,
		activityRows,
		usageOperators,
		activityOperators
	} from '#lib/audience-filters.js';
	import { page } from '$app/state';
	import Icon from '#lib/Icon.svelte';
	import AppShell from '#lib/AppShell.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
	let editorId = $derived<string | null>(form?.id ?? page.url.searchParams.get('edit'));
	let showError = $derived(Boolean(form?.message));
	const selected = $derived(data.audiences.find((a) => a.id === editorId));
	const values = $derived(showError ? form?.values : selected);

	const usage = $derived(showError && form ? form.values.usage : usageRows(selected));
	const activity = $derived(showError && form ? form.values.activity : activityRows(selected));

	function openEditor(id: string) {
		showError = false;
		editorId = id;
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
						<th scope="col">Audience</th><th scope="col">Eligible recipients</th><th scope="col">
							<span class="sr-only">Actions</span>
						</th>
					</tr>
				</thead>
				<tbody>
					{#each data.audiences as audience (audience.id)}
						<tr>
							<td><strong>{audience.name}</strong></td>
							<td>{audience.recipients.toLocaleString()}</td>
							<td class="row-action">
								<button
									class="secondary"
									aria-label={'Edit ' + audience.name}
									aria-haspopup="dialog"
									onclick={() => openEditor(audience.id)}
								>
									Edit
								</button>
							</td>
						</tr>
					{:else}
						<tr><td colspan="3">No saved audiences yet.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
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
			<form method="POST" action="/audiences">
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
				<p>
					Contacts must match every filter you fill in. Leave all filters blank to include every
					eligible contact.
				</p>
				<div class="filters">
					<div class="filter">
						<label for="filter-plan">Plan</label>
						<span class="equals" aria-label="equals">=</span>
						<input
							id="filter-plan"
							name="plan"
							maxlength="200"
							value={values?.plan ?? ''}
							placeholder="premium"
						/>
					</div>
					{#each usage as rule, i (i)}
						<div class="filter">
							<label for={'usage-' + i}>Usage</label>
							<div class="operator">
								<select aria-label="Usage operator" name="usage_operator" value={rule.operator}>
									{#each usageOperators as op (op)}<option value={op}>{op}</option>{/each}
								</select><span class="operator-chevron"><Icon name="down" size={12} /></span>
							</div>
							<input
								id={'usage-' + i}
								name="usage_value"
								maxlength="402"
								value={rule.value}
								placeholder="Number or label"
							/>
						</div>
					{/each}
					{#each activity as rule, i (i)}
						<div class="filter">
							<label for={'activity-' + i}>Last usage</label>
							<div class="operator">
								<select
									aria-label="Last usage operator"
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
									name="activity_value"
									type="number"
									min="1"
									max="36500"
									value={rule.value}
									placeholder="30"
								/><span>days ago</span>
							</div>
						</div>
					{/each}
				</div>
				{#if showError}<p role="alert">{form?.message}</p>{/if}
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
		max-width: 76rem;
		margin: auto;
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
	.row-action {
		text-align: right;
	}
	td:first-child {
		white-space: normal;
		overflow-wrap: anywhere;
	}
	dialog.modal {
		position: fixed;
		margin: auto;
		width: min(35rem, calc(100vw - 2rem));
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
		grid-template-columns: 6rem 4.5rem minmax(0, 1fr);
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
			gap: 0.35rem;
		}
		dialog.modal {
			padding: 1.25rem;
		}
	}
</style>
