<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import Icon from '#lib/Icon.svelte';
	import { workspaceLinks, settingsLinks } from '#lib/navigation.js';
	let {
		companyName,
		section,
		settingsTab,
		title,
		campaignHref = '',
		step = '',
		children
	}: {
		companyName: string;
		section: string;
		settingsTab: string;
		title: string;
		campaignHref?: string;
		step?: string;
		children: Snippet;
	} = $props();
	let collapsed = $state(false);
	onMount(() => {
		try {
			collapsed = localStorage.getItem('newsletter.sidebar.collapsed') === 'true';
		} catch {
			/* Storage may be disabled. */
		}
	});
	function toggleSidebar() {
		collapsed = !collapsed;
		try {
			localStorage.setItem('newsletter.sidebar.collapsed', String(collapsed));
		} catch {
			/* Keep the current session usable. */
		}
	}
	const campaignSection = $derived(section === 'campaign' || section === 'campaigns');
	const configuration = $derived(
		section === 'settings' && settingsLinks.some((link) => link.id === settingsTab)
	);
	const pageLabel = $derived(
		campaignSection
			? 'Campaigns'
			: section === 'contacts'
				? 'Contacts'
				: [...workspaceLinks, ...settingsLinks].find((link) => link.id === settingsTab)?.label ||
					'Settings'
	);
</script>

<div class="product-shell" class:collapsed>
	<a class="skip-link" href="#main-content">Skip to content</a>
	<aside id="workspace-navigation" class="product-sidebar">
		<a class="company" href="/campaigns" aria-label={`${companyName} campaigns`}>
			<span class="company-icon">{companyName.slice(0, 1)}</span>
			<strong class="nav-text">{companyName}</strong>
		</a>
		<nav aria-label="Main navigation" class="primary-navigation">
			<a
				href="/campaigns"
				aria-label="Campaigns"
				title="Campaigns"
				class:active={campaignSection}
				aria-current={campaignSection ? 'page' : undefined}
			>
				<Icon name="mail" size={19} /><span class="nav-text">Campaigns</span>
			</a>
			<a
				href="/contacts"
				aria-label="Contacts"
				title="Contacts"
				class:active={section === 'contacts'}
				aria-current={section === 'contacts' ? 'page' : undefined}
			>
				<Icon name="users" size={19} /><span class="nav-text">Contacts</span>
			</a>
			<div class="nav-group-label">Content</div>
			{#each workspaceLinks as link (link.id)}
				<a
					href={`/settings/${link.id}`}
					aria-label={link.label}
					title={link.label}
					class:active={section === 'settings' && settingsTab === link.id}
					aria-current={section === 'settings' && settingsTab === link.id ? 'page' : undefined}
				>
					<Icon name={link.icon} size={19} /><span class="nav-text">{link.label}</span>
				</a>
			{/each}
		</nav>
		<nav class="utility-navigation" aria-label="Configuration">
			<a
				href="/settings"
				aria-label="Settings"
				title="Settings"
				class:active={configuration}
				aria-current={configuration ? 'page' : undefined}
			>
				<Icon name="settings" size={19} /><span class="nav-text">Settings</span>
			</a>
		</nav>
	</aside>
	<main id="main-content" class="product-main" tabindex="-1">
		<header class="product-topbar">
			<button
				class="sidebar-toggle"
				onclick={toggleSidebar}
				aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
				title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
				aria-expanded={!collapsed}
				aria-controls="workspace-navigation"
			>
				<Icon name="sidebar" size={20} />
			</button>
			<nav aria-label="Breadcrumb" class="product-breadcrumbs">
				{#if campaignSection && section === 'campaign'}
					<a href="/campaigns">Campaigns</a><Icon name="chevron" size={14} />
					{#if campaignHref && step}
						<a class="campaign-crumb" href={campaignHref}>{title}</a><Icon
							name="chevron"
							size={14}
						/>
						<span aria-current="page">{step}</span>
					{:else}<span aria-current="page">{title}</span>{/if}
				{:else if configuration}
					<a href="/settings">Settings</a><Icon name="chevron" size={14} /><span
						aria-current="page"
					>
						{pageLabel}
					</span>
				{:else}<span aria-current="page">{pageLabel}</span>{/if}
			</nav>
		</header>
		{@render children()}
	</main>
</div>

<style>
	.product-shell {
		display: grid;
		grid-template-columns: 280px minmax(0, 1fr);
		min-height: 100dvh;
	}
	.product-sidebar {
		position: sticky;
		top: 0;
		height: 100dvh;
		padding: 28px 16px 20px;
		display: flex;
		flex-direction: column;
		background: var(--sidebar);
		border-right: 1px solid var(--sidebar);
		overflow-y: auto;

		color: var(--sidebar-text);
	}
	.company {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 0 12px;
		margin-bottom: 38px;
	}
	.company strong {
		font-size: 16px;
		overflow-wrap: anywhere;
		min-width: 0;
	}
	.company-icon {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		flex-shrink: 0;
		border: 1px solid #8b5ce5;
		border-radius: 10px;
		color: #fff;
		background: var(--accent);
		font-weight: 600;
	}
	.primary-navigation,
	.utility-navigation {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	.primary-navigation a,
	.utility-navigation a {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px;
		border-radius: 7px;
		color: var(--sidebar-text);
		font-size: 14px;
		font-weight: 500;
	}
	.primary-navigation a:hover,
	.utility-navigation a:hover {
		background: var(--sidebar-hover);
	}
	.primary-navigation a.active,
	.utility-navigation a.active {
		background: var(--accent);
		color: #fff;
		font-weight: 600;
	}
	.nav-group-label {
		margin: 27px 12px 7px;
		color: var(--sidebar-muted);
		font-size: 12px;
		font-weight: 500;
	}
	.utility-navigation {
		margin-top: auto;
		padding-top: 24px;
	}
	.product-main {
		min-width: 0;
		padding-bottom: 40px;
		outline: none;
	}
	.product-topbar {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		min-height: 64px;
		padding: 16px 32px;
		border-bottom: 1px solid var(--border);
		background: var(--surface);
	}
	.product-breadcrumbs {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
		font-size: 13px;
		color: var(--text-secondary);
	}
	.product-breadcrumbs a {
		white-space: nowrap;
		color: var(--accent);
	}
	.product-breadcrumbs .campaign-crumb {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.product-breadcrumbs a:hover {
		text-decoration: underline;
	}
	.product-breadcrumbs span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	a:focus-visible {
		outline: 2px solid #b899ff;
		outline-offset: 3px;
	}
	.skip-link {
		position: fixed;
		left: 16px;
		top: -100px;
		z-index: 30;
		padding: 12px;
		border-radius: 6px;
		background: white;
	}
	.skip-link:focus {
		top: 12px;
	}
	@media (max-width: 1100px) {
		.product-shell {
			grid-template-columns: 240px minmax(0, 1fr);
		}
		.product-sidebar {
			padding-inline: 12px;

			background: var(--sidebar);

			color: var(--sidebar-text);

			border-right: 1px solid var(--sidebar);
		}
	}
	@media (max-width: 760px) {
		.product-shell {
			grid-template-columns: 1fr;
		}
		.product-sidebar {
			position: static;
			height: auto;
			padding: 16px;
			overflow: visible;

			background: var(--sidebar);

			color: var(--sidebar-text);

			border-right: 1px solid var(--sidebar);
		}
		.company {
			margin-bottom: 16px;
			padding: 0;
		}
		.primary-navigation {
			flex-direction: row;
			flex-wrap: wrap;
			gap: 4px;
		}
		.primary-navigation a,
		.utility-navigation a {
			padding: 10px;
			font-size: 13px;
		}
		.nav-group-label {
			display: none;

			color: var(--sidebar-muted);
		}
		.utility-navigation {
			margin: 4px 0 0;
			padding: 0;
		}
		.product-topbar {
			padding-inline: 20px;
			min-height: 56px;
		}
	}

	.product-topbar {
		gap: 16px;
	}
	.sidebar-toggle {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		flex-shrink: 0;
		border: 1px solid var(--border);
		border-radius: 7px;
		color: var(--text-secondary);
	}
	.sidebar-toggle:hover {
		background: var(--accent-tint);
		color: var(--accent);
	}
	.product-shell.collapsed {
		grid-template-columns: 76px minmax(0, 1fr);
	}
	.collapsed .product-sidebar {
		padding-inline: 12px;
	}
	.collapsed .company {
		padding: 0;
		justify-content: center;
	}
	.collapsed .nav-text {
		display: none;
	}
	.collapsed .primary-navigation a,
	.collapsed .utility-navigation a {
		justify-content: center;
		padding: 13px 0;
	}
	.collapsed .nav-group-label {
		font-size: 0;
		margin: 18px 8px 10px;
		border-top: 1px solid var(--sidebar-hover);
	}
	@media (max-width: 760px) {
		.product-shell.collapsed {
			grid-template-columns: 1fr;
		}
		.collapsed .product-sidebar {
			display: none;
		}
	}
</style>
