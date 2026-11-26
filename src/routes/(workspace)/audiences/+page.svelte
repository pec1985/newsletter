<script lang="ts">
	import { page } from '$app/state';
	import AppShell from '#lib/AppShell.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
	const selected = $derived(data.audiences.find((a) => a.id === page.url.searchParams.get('edit')));
	const values = $derived(form?.values ?? selected);
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
			<p>Save a set of contact filters to reuse across campaigns.</p>
		</header>
		<div class="panels">
			<section class="card">
				<h2>Saved audiences</h2>
				{#each data.audiences as audience (audience.id)}
					<a class="audience-row" href={'/audiences?edit=' + audience.id}>
						<strong>{audience.name}</strong><span>{audience.recipients} eligible recipients</span>
					</a>
				{:else}<p>Your saved audiences will appear here.</p>{/each}
			</section>
			<section class="card">
				<h2>{selected ? 'Edit audience' : 'Create audience'}</h2>
				{#key selected?.id}
					<form method="POST">
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
						{#if form?.message}<p role="alert">{form.message}</p>{/if}
						<div class="actions">
							<button class="primary">Save audience</button>{#if selected}<a href="/audiences">
									Create another audience
								</a>{/if}
						</div>
					</form>
				{/key}
			</section>
		</div>
	</div>
</AppShell>

<style>
	.audience-page {
		padding: clamp(1rem, 4vw, 3rem);
		max-width: 76rem;
		margin: auto;
	}
	.panels {
		display: grid;
		grid-template-columns: minmax(14rem, 2fr) minmax(18rem, 3fr);
		gap: 1.5rem;
		align-items: start;
		margin-top: 1.5rem;
	}
	.card {
		padding: 1.5rem;
	}
	h2 {
		margin: 0 0 1rem;
	}
	form,
	label {
		display: grid;
		gap: 0.45rem;
	}
	form {
		gap: 1rem;
	}
	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}
	label,
	input {
		min-width: 0;
	}
	.audience-row,
	.actions {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		flex-wrap: wrap;
	}
	.audience-row {
		justify-content: space-between;
		padding: 0.8rem 0;
		border-bottom: 1px solid var(--border);
	}
	p,
	.audience-row span {
		color: var(--text-secondary);
	}
	@media (max-width: 760px) {
		.panels,
		.pair {
			grid-template-columns: 1fr;
		}
	}
</style>
