<script lang="ts">
	import Workspace from '#lib/Workspace.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

{#key data.campaignId}<Workspace {data} section="campaign" campaignId={data.campaignId} />{/key}
