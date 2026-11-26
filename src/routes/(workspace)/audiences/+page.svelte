<script lang="ts">
	import { page } from '$app/state';
	import AppShell from '#lib/AppShell.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
	let editorId = $derived<string | null>(form?.id ?? page.url.searchParams.get('edit'));
	let showError = $derived(Boolean(form?.message));
	const selected = $derived(data.audiences.find((a) => a.id === editorId));
	const values = $derived(showError ? form?.values : selected);

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
				<label>
					Plan equals<input
						name="plan"
						maxlength="200"
						value={values?.plan ?? ''}
						placeholder="premium"
					/>
				</label>
				<label>
					Usage label equals<input
						name="usage_label"
						maxlength="200"
						value={values?.usage_label ?? ''}
						placeholder="frequent"
					/>
				</label>
				<p>For numeric usage, leave the label blank and enter a range.</p>
				<div class="pair">
					<label>
						Minimum usage<input
							name="min_usage"
							type="number"
							step="any"
							value={values?.min_usage ?? ''}
						/>
					</label>
					<label>
						Maximum usage<input
							name="max_usage"
							type="number"
							step="any"
							value={values?.max_usage ?? ''}
						/>
					</label>
				</div>
				<div class="pair">
					<label>
						Used within (days)<input
							name="active_within_days"
							type="number"
							min="1"
							max="36500"
							value={values?.active_within_days ?? ''}
						/>
					</label>
					<label>
						Inactive for over (days)<input
							name="inactive_days"
							type="number"
							min="1"
							max="36500"
							value={values?.inactive_days ?? ''}
						/>
					</label>
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
		width: min(32rem, calc(100vw - 2rem));
	}
	dialog::backdrop {
		background: rgb(24 16 39 / 0.5);
	}
	dialog h2 {
		margin: 0 0 1rem;
	}
	form,
	label {
		display: grid;
		gap: 0.4rem;
	}
	form {
		gap: 1rem;
	}
	.pair {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
	}
	input {
		min-width: 0;
	}
	p {
		color: var(--text-secondary);
	}
	.actions {
		justify-content: flex-end;
	}
	@media (max-width: 520px) {
		th,
		td {
			padding: 0.75rem;
		}
		.pair {
			grid-template-columns: 1fr;
		}
		dialog.modal {
			padding: 1.25rem;
		}
	}
</style>
