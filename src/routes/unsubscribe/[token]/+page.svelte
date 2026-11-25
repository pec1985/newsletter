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
<div class="login-page" lang={data.lang} dir="auto">
	<main class="login-card">
		<div class="brand" dir="ltr">Postscript<span>✳</span></div>
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
					{#each codes as code (code)}
						<label>
							<input type="radio" name="reason" value={code} required />{data.copy[code]}
						</label>
					{/each}
				</fieldset>
				<button class="primary">{data.copy.unsubscribe}</button>
			</form>
		{/if}
	</main>
</div>

<style>
	h1 {
		margin: 1.5rem 0 0.75rem;
		line-height: 1.15;
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 1rem 0 0.5rem;
	}
	legend {
		margin-bottom: 0.75rem;
	}
	fieldset label {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		border: 1px solid var(--border);
		border-radius: 0.5rem;
		margin-bottom: 0.4rem;
		cursor: pointer;
	}
	fieldset input {
		width: 1rem;
		height: 1rem;
		flex: none;
		margin: 0;
		padding: 0;
	}
</style>
