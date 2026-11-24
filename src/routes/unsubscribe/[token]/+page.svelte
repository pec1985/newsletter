<script lang="ts">
	let { form } = $props();
</script>

<div class="login-page">
	<div class="login-card">
		<div class="brand">Postscript<span>✳</span></div>
		<h1>{form?.success ? 'You’re unsubscribed.' : 'A little less email?'}</h1>
		<p>
			{form?.success
				? 'You won’t receive future newsletters from us.'
				: 'Confirm below to unsubscribe from future newsletters.'}
		</p>
		{#if !form?.success}<form method="POST"><button class="primary">Unsubscribe</button></form>{/if}
	</div>
</div>
