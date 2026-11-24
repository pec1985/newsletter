<script lang="ts">
	let { name = 'mail', size = 20 }: { name?: string; size?: number } = $props();
	const paths: Record<string, string> = {
		mail: 'M4 5h16v14H4z M4 6l8 6 8-6',
		plus: 'M12 5v14M5 12h14',
		chevron: 'M9 5l7 7-7 7',
		down: 'm6 9 6 6 6-6',
		search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
		settings:
			'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z',
		users:
			'M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M17 4a4 4 0 0 1 0 8M22 21v-3a4 4 0 0 0-3-4',
		chart: 'M4 3v17h17M8 15v-4M13 15V6M18 15V9',
		edit: 'm15 4 5 5M4 20l5-1L21 7l-5-5L4 14z',
		spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',
		globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18',
		image: 'M3 3h18v18H3zM3 16l6-6 5 5 3-3 4 4M15 7h.01',
		link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',
		eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
		check: 'm5 12 4 4L19 6',
		send: 'm22 2-7 20-4-9-9-4zM22 2 11 13',
		logout: 'M9 4H3v16h6M9 12h12m-4-4 4 4-4 4',
		close: 'm6 6 12 12M6 18 18 6',
		clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 7v5l3 2',
		key: 'M14 10l8-8M18 6l3 3M16 12a6 6 0 1 1-12-8 6 6 0 0 1 12 8',
		file: 'M6 3h8l4 4v14H6zM14 3v5h5M9 12h6M9 16h6',
		arrow: 'M12 19V5m-6 6 6-6 6 6'
	};
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.65"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	<path d={paths[name] || paths.mail} />
</svg>
