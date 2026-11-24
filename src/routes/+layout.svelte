<script lang="ts">
	import './layout.css';
	let { children } = $props();
</script>

<svelte:head>
	<link
		rel="stylesheet"
		href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap"
	/>
	<title>Postscript — Thoughtful emails, effortlessly.</title><meta
		name="description"
		content="Your AI newsletter workspace. Create thoughtful campaigns, in every language."
	/>
</svelte:head>
{@render children()}
