<script lang="ts">
	import { reasons } from '#lib/unsubscribe.js';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
	const codes = Object.keys(reasons) as (keyof typeof reasons)[];
</script>

<svelte:head>
	<title
		>{data.unsubscribed
			? data.copy.unsubscribed
			: form?.subscribed
				? data.copy.subscribed
				: data.copy.title} · Postscript</title
	>
</svelte:head>
<div class="preference-page" lang={data.lang} dir="auto">
	<main class="panel">
		<div class="brand" dir="ltr">Postscript<span aria-hidden="true">✳</span></div>
		{#if data.unsubscribed}
			<h1>{data.copy.unsubscribed}</h1>
			<p>{data.copy.confirmation}</p>
			<form method="POST" action="?/resubscribe">
				<button class="primary">{data.copy.resubscribe}</button>
			</form>
		{:else if form?.subscribed}
			<h1>{data.copy.subscribed}</h1>
		{:else}
			<h1>{data.copy.title}</h1>
			<form method="POST" action="?/unsubscribe">
				<fieldset>
					<legend>{data.copy.question}</legend>
					{#if form?.invalid}<p class="error" role="alert">{data.copy.required}</p>{/if}
					<div class="choices">
						{#each codes as code (code)}
							<label>
								<input type="radio" name="reason" value={code} required />{data.copy[code]}
							</label>
						{/each}
					</div>
				</fieldset>
				<button class="primary">{data.copy.unsubscribe}</button>
			</form>
		{/if}
	</main>
</div>

<style>
	.preference-page {
		min-height: 100svh;
		display: grid;
		place-items: center;
		padding: clamp(1rem, 4vw, 3rem);
		background:
			radial-gradient(ellipse at top, var(--accent-tint), transparent 70%), var(--surface-muted);
	}
	.panel {
		width: min(100%, 32rem);
		min-width: 0;
		padding: clamp(1.25rem, 5vw, 2.5rem);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 1.25rem;
		box-shadow: 0 12px 40px rgb(35 20 60 / 0.07);
		overflow-wrap: anywhere;
	}
	.brand {
		font-size: 1.15rem;
		letter-spacing: -0.055em;
		margin-bottom: 1.65rem;
	}
	.brand > span {
		font-size: 1.25rem;
	}
	h1 {
		font-size: clamp(1.65rem, 4vw, 2rem);
		line-height: 1.14;
		text-wrap: balance;
	}
	p,
	fieldset {
		margin-top: 0.85rem;
	}
	fieldset {
		min-width: 0;
		padding: 0;
		border: 0;
	}
	legend {
		padding: 0;
		color: var(--text-secondary);
		font-size: 0.95rem;
	}
	.choices {
		margin-top: 1.15rem;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: 0.75rem;
	}
	label {
		display: grid;
		grid-template-columns: 1.125rem 1fr;
		align-items: center;
		gap: 0.75rem;
		min-height: 3rem;
		margin: 0;
		padding: 0.7rem 1rem;
		font-size: 0.94rem;
		line-height: 1.4;
		cursor: pointer;
	}
	label + label {
		border-top: 1px solid var(--border);
	}
	label:hover {
		background: var(--surface-muted);
	}
	label:has(:checked) {
		background: var(--accent-tint);
		color: var(--accent-dark);
	}
	label:has(:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: -3px;
	}
	input[type='radio'] {
		appearance: none;
		width: 1.125rem;
		height: 1.125rem;
		padding: 0;
		margin: 0;
		border: 1.5px solid var(--muted);
		border-radius: 50%;
		background: var(--surface);
	}
	input[type='radio']:checked {
		border: 5px solid var(--accent);
	}
	@media (forced-colors: active) {
		input[type='radio'] {
			appearance: auto;
		}
	}
	button.primary {
		width: 100%;
		margin-top: 1.5rem;
		min-height: 2.875rem;
		white-space: normal;
	}
</style>
