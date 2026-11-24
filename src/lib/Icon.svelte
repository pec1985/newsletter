<script lang="ts">
	import {
		CloseSidebarOutline,
		EnvelopeOutline,
		PlusOutline,
		ChevronRightOutline,
		ChevronDownOutline,
		SearchOutline,
		CogOutline,
		UsersOutline,
		ChartOutline,
		PenOutline,
		WandMagicSparklesOutline,
		GlobeOutline,
		ImageOutline,
		LinkOutline,
		EyeOutline,
		CheckOutline,
		PaperPlaneOutline,
		ArrowRightToBracketOutline,
		CloseOutline,
		ClockOutline,
		ApiKeyOutline,
		FileLinesOutline,
		ArrowUpOutline,
		CalendarMonthOutline,
		ChevronLeftOutline,
		ArrowRightOutline,
		LetterBoldOutline,
		LetterItalicOutline
	} from 'flowbite-svelte-icons';

	let { name = 'mail', size = 20 }: { name?: string; size?: number } = $props();
	const icons = {
		sidebar: CloseSidebarOutline,
		mail: EnvelopeOutline,
		plus: PlusOutline,
		chevron: ChevronRightOutline,
		down: ChevronDownOutline,
		search: SearchOutline,
		settings: CogOutline,
		users: UsersOutline,
		chart: ChartOutline,
		edit: PenOutline,
		spark: WandMagicSparklesOutline,
		globe: GlobeOutline,
		image: ImageOutline,
		link: LinkOutline,
		eye: EyeOutline,
		check: CheckOutline,
		send: PaperPlaneOutline,
		logout: ArrowRightToBracketOutline,
		close: CloseOutline,
		clock: ClockOutline,
		key: ApiKeyOutline,
		file: FileLinesOutline,
		arrow: ArrowUpOutline,
		calendar: CalendarMonthOutline,
		left: ChevronLeftOutline,
		right: ArrowRightOutline,
		bold: LetterBoldOutline,
		italic: LetterItalicOutline
	};
	const Glyph = $derived(icons[name as keyof typeof icons] ?? EnvelopeOutline);
</script>

<Glyph width={size} height={size} aria-hidden="true" />
