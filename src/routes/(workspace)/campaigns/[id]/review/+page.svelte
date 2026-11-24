<script lang="ts">
	import CampaignReview from '#lib/CampaignReview.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

{#key data.campaignId}<CampaignReview {data} campaignId={data.campaignId} />{/key}
