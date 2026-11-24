<script lang="ts">
	import Workspace from '#lib/Workspace.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

{#key data.settingsTab}<Workspace {data} section="settings" settingsTab={data.settingsTab} />{/key}
