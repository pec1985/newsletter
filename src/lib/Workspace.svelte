<script lang="ts">
	import { invalidateAll, goto, beforeNavigate } from '$app/navigation';
	import { onMount, untrack } from 'svelte';
	import type { LayoutData } from '../routes/(workspace)/$types';
	import Icon from '#lib/Icon.svelte';
	import KnowledgePanel from '#lib/KnowledgePanel.svelte';
	import { summarizeSpend } from '#lib/ai-cost.js';
	import { renderEmail } from '#lib/email.js';
	let {
		data,
		section = 'campaign',
		settingsTab = 'context',
		campaignId = ''
	}: { data: LayoutData; section?: string; settingsTab?: string; campaignId?: string } = $props();
	const initialCampaign = untrack(() => data.campaigns.find((c) => c.id === campaignId));
	let bypassNavigationGuard = false;
	let editorTab = $state('write');
	let audience = $state<string[]>(initialCampaign?.locales || []);
	let sourceLocale = $state(initialCampaign?.source_locale || 'en');
	let showAudience = $state(false);
	let showSpend = $state(false);
	let subject = $state(initialCampaign?.subject || '');
	let body = $state(initialCampaign?.body || '');
	const title = $derived(subject.trim() || 'Untitled campaign');
	let message = $state('');
	let busy = $state('');
	let notice = $state('');
	let problem = $state('');
	let search = $state('');
	let contactSearch = $state('');
	let contactLocale = $state('all');
	let showContact = $state(false);
	let contactName = $state('');
	let contactEmail = $state('');
	let newLocale = $state('en');
	let showReview = $state(false);
	let deliveryMode = $state('local');
	let previewLocale = $state(initialCampaign?.source_locale || 'en');
	let config = $state<Record<string, string>>(untrack(() => ({ ...data.config })));
	let generatedKey = $state('');
	let selectedDelivery = $state('');
	let loadedStamp = initialCampaign ? `${initialCampaign.id}:${initialCampaign.updated_at}` : '';
	let editingContactId = $state('');
	let bodyInput = $state<HTMLTextAreaElement>();
	const campaign = $derived(data.campaigns.find((c) => c.id === campaignId));
	const campaignUsage = $derived(data.aiUsage.filter((row) => row.campaign_id === campaign?.id));
	const spend = $derived(
		summarizeSpend(
			campaignUsage.map((row) => ({
				task: row.task,
				cost_usd: row.cost_usd,
				pricing_status: row.pricing_status
			}))
		)
	);
	const money = (amount: number) =>
		amount > 0 && amount < 0.000001
			? '<$0.000001'
			: new Intl.NumberFormat('en-US', {
					style: 'currency',
					currency: 'USD',
					minimumFractionDigits: 2,
					maximumFractionDigits: 6
				}).format(amount);
	const taskSpend = (task: string) => {
		const rows = campaignUsage.filter((row) => row.task === task);
		if (!rows.length) return 'No recorded usage';
		if (rows.every((row) => row.cost_usd === null)) return 'Unknown';
		return (
			money(rows.reduce((total, row) => total + Number(row.cost_usd ?? 0), 0)) +
			(rows.some((row) => row.cost_usd === null) ? ' + unknown' : '')
		);
	};
	const campaignDeliveries = $derived(
		data.deliveries.filter((d) => d.campaign_id === campaign?.id)
	);
	const versions = $derived(data.versions.filter((v) => v.campaign_id === campaign?.id));
	const currentVersion = $derived(versions.find((v) => v.locale === previewLocale));
	const eligible = $derived(
		data.contacts.filter((c) => !c.unsubscribed && !c.suppressed && audience.includes(c.locale))
	);
	const locales = $derived([
		...new Set(['en', 'es', ...data.contacts.map((c) => String(c.locale)), ...audience])
	]);
	const audienceLocales = $derived(
		[...new Set<string>(data.contacts.map((c) => String(c.locale)))].sort(
			(a, b) => language(a).localeCompare(language(b), 'en') || a.localeCompare(b)
		)
	);
	const selectedAudienceCount = $derived(
		audienceLocales.filter((locale) => audience.includes(locale)).length
	);
	const allAudiencesSelected = $derived(
		audienceLocales.length > 0 && selectedAudienceCount === audienceLocales.length
	);
	const localeCounts = $derived.by(() => {
		const counts: Record<string, number> = {};
		for (const contact of data.contacts) {
			if (!contact.unsubscribed && !contact.suppressed)
				counts[contact.locale] = (counts[contact.locale] || 0) + 1;
		}
		return counts;
	});
	const filteredContacts = $derived(
		data.contacts.filter(
			(c) =>
				(contactLocale === 'all' || c.locale === contactLocale) &&
				`${c.name} ${c.email}`.toLowerCase().includes(contactSearch.toLowerCase())
		)
	);
	const opened = $derived(campaignDeliveries.filter((d) => d.first_opened_at).length);
	const dirty = $derived(
		section === 'campaign' &&
			campaign?.status === 'draft' &&
			(subject !== campaign.subject ||
				body !== campaign.body ||
				sourceLocale !== campaign.source_locale ||
				JSON.stringify(audience) !== JSON.stringify(campaign.locales))
	);
	const language = (locale: string) => {
		try {
			return new Intl.DisplayNames(['en'], { type: 'language' }).of(locale) || locale;
		} catch {
			return locale;
		}
	};
	const date = (value: unknown) =>
		value
			? new Date(String(value)).toLocaleDateString('en', { month: 'short', day: 'numeric' })
			: '—';
	$effect(() => {
		if (campaign && loadedStamp !== `${campaign.id}:${campaign.updated_at}`) {
			loadedStamp = `${campaign.id}:${campaign.updated_at}`;
			subject = campaign.subject;
			body = campaign.body;
			audience = campaign.locales.filter((locale: string) => audienceLocales.includes(locale));
			sourceLocale = campaign.source_locale;
			previewLocale = campaign.source_locale;
		}
	});
	$effect(() => {
		config = { ...data.config };
	});
	const settingsDirty = $derived(
		section === 'settings' && JSON.stringify(config) !== JSON.stringify(data.config)
	);
	beforeNavigate(({ cancel, willUnload, from, to }) => {
		if (bypassNavigationGuard || from?.url.pathname === to?.url.pathname) return;
		if (dirty || settingsDirty) {
			if (
				willUnload ||
				!window.confirm('You have unsaved changes. Leave this page and discard them?')
			)
				cancel();
		}
	});
	async function navigateAfterMutation(href: string, replace = false) {
		bypassNavigationGuard = true;
		try {
			await goto(href, { replace, refreshAll: true });
		} finally {
			bypassNavigationGuard = false;
		}
	}
	onMount(() => {
		const timer = setInterval(() => {
			if (
				(section === 'campaign' && data.campaigns.some((c) => c.status === 'sending')) ||
				(section === 'settings' &&
					settingsTab === 'knowledge' &&
					data.documents.some((d) => ['pending', 'indexing'].includes(d.status)))
			)
				void invalidateAll();
		}, 2500);
		return () => clearInterval(timer);
	});
	async function api(path: string, payload: unknown) {
		const response = await fetch(`/api/${path}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
		const result = await response.json();
		if (!response.ok) throw new Error(result.message || 'Something went wrong.');
		return result;
	}
	async function run(action: string, fn: () => Promise<void>) {
		busy = action;
		problem = '';
		notice = '';
		try {
			await fn();
		} catch (e) {
			problem = e instanceof Error ? e.message : 'Something went wrong.';
			if (action === 'chat' || action === 'prepare') await invalidateAll();
		} finally {
			busy = '';
		}
	}
	async function persist() {
		if (!campaign) return;
		await api('save', {
			id: campaign.id,
			subject,
			body,
			locales: audience,
			source_locale: sourceLocale
		});
	}
	async function save() {
		await run('save', async () => {
			await persist();
			await invalidateAll();
			notice = 'Draft saved.';
		});
	}
	async function deleteDraft() {
		if (!campaign || campaign.status !== 'draft' || busy) return;
		const id = campaign.id;
		if (
			!window.confirm(
				`Delete “${title || campaign.title}”? This permanently removes the draft, its conversation, and prepared translations. This cannot be undone.`
			)
		)
			return;
		await run('delete', async () => {
			await api('delete-draft', { id });
			const next = data.campaigns.find((item) => item.id !== id);
			await navigateAfterMutation(next ? `/campaigns/${next.id}` : '/campaigns', true);
		});
	}
	async function createCampaign() {
		await run('new', async () => {
			if (dirty) await persist();
			if (settingsDirty && !window.confirm('Discard unsaved settings and create a campaign?'))
				return;
			const c = await api('campaigns', {});
			await navigateAfterMutation(`/campaigns/${c.id}`);
		});
	}
	async function chat() {
		await run('chat', async () => {
			const id = campaign?.id;
			if (!id) return;
			if (dirty) await persist();
			await api('chat', { id, message });
			message = '';
			await invalidateAll();
		});
	}
	async function prepare() {
		await run('prepare', async () => {
			const id = campaign?.id;
			if (!id) return;
			if (dirty) await persist();
			await api('translate', { id });
			await invalidateAll();
			previewLocale = audience[0];
			showReview = true;
		});
	}
	async function send() {
		await run('send', async () => {
			const id = campaign?.id;
			if (!id) return;
			const result = await api('send', { id, mode: deliveryMode });
			showReview = false;
			await invalidateAll();
			notice = `${result.count} ${deliveryMode === 'local' ? 'local test deliveries' : 'emails'} queued.`;
		});
	}
	function modal(node: HTMLElement, close: () => void) {
		const previous = document.activeElement as HTMLElement | null;
		const focusable = () =>
			Array.from(
				node.querySelectorAll<HTMLElement>(
					'button:not(:disabled), input, select, textarea, a[href], [tabindex="0"]'
				)
			);
		focusable()[0]?.focus();
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				close();
			}
			if (event.key === 'Tab') {
				const elements = focusable();
				const first = elements[0],
					last = elements.at(-1);
				if (event.shiftKey && document.activeElement === first) {
					event.preventDefault();
					last?.focus();
				} else if (!event.shiftKey && document.activeElement === last) {
					event.preventDefault();
					first?.focus();
				}
			}
		};
		node.addEventListener('keydown', onKey);
		return {
			destroy() {
				node.removeEventListener('keydown', onKey);
				previous?.focus();
			}
		};
	}
	function insert(text: string) {
		const position = bodyInput?.selectionStart ?? body.length;
		body = body.slice(0, position) + text + body.slice(position);
	}
	async function upload(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		await run('upload', async () => {
			const form = new FormData();
			form.set('file', file);
			const response = await fetch('/api/media', { method: 'POST', body: form });
			const result = await response.json();
			if (!response.ok) throw new Error(result.message);
			insert(`\n\n![${file.name.replace(/[\[\]]/g, '')}](${result.url})\n\n`);
			notice = `Image added · ${result.storage} storage`;
		});
		input.value = '';
	}
	async function addContact() {
		await run('contact', async () => {
			await api(editingContactId ? 'edit-contact' : 'contacts', {
				id: editingContactId,
				name: contactName,
				email: contactEmail,
				locale: newLocale
			});
			await invalidateAll();
			showContact = false;
			contactName = '';
			contactEmail = '';
			notice = 'Contact saved.';
		});
	}
</script>

<svelte:head>
	<title
		>{section === 'campaign'
			? title
			: section === 'contacts'
				? 'Contacts'
				: `Settings · ${settingsTab}`} — Postscript</title
	>
</svelte:head>
<div class="app-shell">
	<aside class="sidebar">
		<a class="brand" href="/">postscript<span>✳</span></a>
		<div class="workspace-switch">
			<span class="workspace-icon">{(config.companyName || 'Your company').slice(0, 1)}</span>
			<div>
				<strong>{config.companyName || 'Your company'}</strong><small>Newsletter workspace</small>
			</div>
			<Icon name="down" size={14} />
		</div>
		<button class="primary new-campaign" onclick={createCampaign} disabled={!!busy}>
			<Icon name="plus" size={17} /> New campaign <kbd>+</kbd>
		</button>
		<div class="sidebar-label">YOUR CAMPAIGNS <span>{data.campaigns.length}</span></div>
		<div class="search-box sidebar-search">
			<Icon name="search" size={15} /><input
				aria-label="Search campaigns"
				placeholder="Find a campaign…"
				bind:value={search}
			/>
		</div>
		<nav class="campaign-nav">
			{#each data.campaigns.filter((c) => (c.subject || 'Untitled campaign')
					.toLowerCase()
					.includes(search.toLowerCase())) as c (c.id)}
				<a
					class:active={section === 'campaign' && campaign?.id === c.id}
					href={`/campaigns/${c.id}`}
					aria-current={campaign?.id === c.id ? 'page' : undefined}
				>
					<Icon name={c.status === 'draft' ? 'file' : 'chart'} size={18} /><span>
						<strong>{c.subject || 'Untitled campaign'}</strong><small>
							<span class:sent={c.status === 'sent'} class="mini-dot"></span>{c.status === 'draft'
								? 'Draft'
								: c.status === 'sending'
									? 'Sending'
									: c.status === 'attention'
										? 'Needs attention'
										: 'Sent'}<span class="nav-date">{date(c.created_at)}</span>
						</small>
					</span>
				</a>
			{/each}
		</nav>
		<div class="sidebar-bottom">
			<a
				href="/contacts"
				class:active={section === 'contacts'}
				aria-current={section === 'contacts' ? 'page' : undefined}
			>
				<Icon name="users" size={18} /> Contacts <span class="count">{data.contacts.length}</span>
			</a>
			<a
				href="/settings/context"
				class:active={section === 'settings'}
				aria-current={section === 'settings' ? 'page' : undefined}
			>
				<Icon name="settings" size={18} /> Settings
			</a>
			<div class="user-row">
				<span class="avatar">A</span>
				<div><strong>Admin</strong><small>Local workspace</small></div>
				<form method="POST" action="/logout">
					<button aria-label="Sign out"><Icon name="logout" size={17} /></button>
				</form>
			</div>
		</div>
	</aside>
	<main>
		<header class="topbar">
			<div class="breadcrumbs">
				Workspace <Icon name="chevron" size={13} />
				<span>
					{section === 'campaign' ? 'Campaigns' : section === 'contacts' ? 'Contacts' : 'Settings'}
				</span>{#if section === 'campaign' && campaign}<Icon name="chevron" size={13} /><strong>
						{title}
					</strong>{/if}
			</div>
			<span class="environment"><span class="status-dot"></span> Local development</span>
		</header>
		{#if problem}<div class="toast error" role="alert">
				{problem}<button aria-label="Dismiss error" onclick={() => (problem = '')}>
					<Icon name="close" size={16} />
				</button>
			</div>{/if}
		{#if notice}<div class="toast success" role="status">
				<Icon name="check" size={16} />{notice}<button
					aria-label="Dismiss notification"
					onclick={() => (notice = '')}
				>
					<Icon name="close" size={16} />
				</button>
			</div>{/if}
		{#if section === 'campaign' && campaign}
			<div class="page-heading campaign-heading">
				<div>
					<div class="title-row">
						<h1>{title}</h1>
						<span class:green={campaign.status === 'sent'} class="badge">
							{campaign.status === 'draft'
								? 'Draft'
								: campaign.status === 'sending'
									? 'Sending'
									: campaign.status === 'attention'
										? 'Needs attention'
										: 'Sent'}
						</span>
					</div>
					<p class="campaign-cost-line">
						<button onclick={() => (showSpend = true)} aria-haspopup="dialog">
							AI spend: {spend.requests
								? spend.unknown === spend.requests
									? 'Unknown'
									: money(spend.total) + (spend.unknown ? ' + unknown' : ' estimated')
								: 'No recorded usage'} <span>View breakdown</span>
						</button>
						{#if campaign.status !== 'draft'}<span>
								· {date(campaign.sent_at)} · {campaignDeliveries.length} recipients
							</span>{/if}
					</p>
				</div>
				<div class="heading-actions">
					{#if campaign.status === 'draft'}<span class="save-status">
							<Icon name={dirty ? 'edit' : 'check'} size={14} />{dirty
								? 'Unsaved changes'
								: 'All changes saved'}
						</span><button class="secondary" onclick={deleteDraft} disabled={!!busy}>
							{busy === 'delete' ? 'Deleting…' : 'Delete draft'}
						</button><button class="secondary" onclick={save} disabled={!!busy}>
							{busy === 'save' ? 'Saving…' : 'Save draft'}
						</button><button
							class="primary"
							onclick={prepare}
							disabled={!!busy || !subject.trim() || !body.trim() || !eligible.length}
						>
							<Icon name="send" size={16} />{busy === 'prepare' ? 'Preparing…' : 'Review & send'}
						</button>{:else}<button class="secondary" onclick={() => invalidateAll()}>
							<Icon name="chart" size={16} /> Refresh results
						</button>{/if}
				</div>
			</div>
			{#if campaign.status === 'draft'}
				<div class="draft-grid">
					<section class="editor-panel">
						<div class="panel-toolbar">
							<div class="tabs">
								<button class:chosen={editorTab === 'write'} onclick={() => (editorTab = 'write')}>
									<Icon name="edit" size={16} /> Compose
								</button><button
									class:chosen={editorTab === 'preview'}
									onclick={() => (editorTab = 'preview')}
								>
									<Icon name="eye" size={16} /> Preview
								</button>
							</div>
							<span class="plain-label">Simple by design</span>
						</div>
						<div class="email-fields">
							<label class="inline-field subject-field">
								<span>Subject</span>
								<input
									aria-label="Email subject"
									placeholder="A subject worth opening"
									maxlength="500"
									bind:value={subject}
								/>
							</label>
						</div>
						{#if editorTab === 'write'}<div class="format-toolbar">
								<button aria-label="Insert bold text" onclick={() => insert('**your text**')}>
									<strong>B</strong>
								</button><button
									aria-label="Insert italic text"
									onclick={() => insert('*your text*')}
								>
									<em>I</em>
								</button><span class="toolbar-divider"></span><button
									aria-label="Insert a link"
									title="Insert a link"
									onclick={() => insert('[link text](https://example.com)')}
								>
									<Icon name="link" size={17} />
								</button><label class="upload-button" title="Insert an image">
									<Icon name="image" size={18} /><span class="sr-only">Upload image</span><input
										type="file"
										accept="image/png,image/jpeg,image/webp,image/gif"
										onchange={upload}
										disabled={!!busy}
									/>
								</label><span class="format-hint">Markdown supported</span><button
									class="audience-toolbar-button"
									aria-haspopup="dialog"
									onclick={() => (showAudience = true)}
								>
									<Icon name="users" size={16} /> Audience <Icon name="down" size={14} />
								</button>
							</div>
							<textarea
								class="body-editor"
								aria-label="Email body"
								placeholder="Start with a hello. Or ask the assistant for a first draft…"
								bind:value={body}
								bind:this={bodyInput}></textarea>{:else}<div class="email-preview">
								{@html renderEmail(body)}
								<div class="signature">{config.signature?.replaceAll('\\n', '\n')}</div>
								<a class="unsubscribe-preview" href="#preview" onclick={(e) => e.preventDefault()}>
									Unsubscribe
								</a>
							</div>{/if}
						<div class="editor-footer">
							<span>
								<Icon name="users" size={14} />{eligible.length.toLocaleString()} recipients · {selectedAudienceCount}
								locales
							</span>
							<span>{body.trim() ? body.trim().split(/\s+/).length : 0} words</span>
						</div>
					</section>
					<aside class="assistant-panel">
						<div class="assistant-title">
							<span class="ai-icon"><Icon name="spark" size={20} /></span>
							<div>
								<h2>Your writing partner</h2>
								<p>A little help finding the right words.</p>
							</div>
						</div>
						<div class="assistant-context">
							<Icon name="file" size={15} /><span>Company instructions + knowledge</span><button
								aria-label="Edit company context"
								onclick={() => {
									void goto('/settings/context');
								}}
							>
								<Icon name="chevron" size={14} />
							</button>
						</div>
						<div class="conversation">
							<span class="conversation-date">
								LET’S MAKE SOMETHING GOOD
							</span>{#each campaign.messages as m, i (i)}<div
									class:user-message={m.role === 'user'}
									class="chat-message"
								>
									{#if m.role === 'assistant'}<span class="chat-avatar">
											<Icon name="spark" size={14} />
										</span>{/if}
									<div>
										{m.content}
										{#if m.sources?.length}<details class="chat-sources">
												<summary>
													Sources consulted · {m.sources.length}
												</summary>{#each m.sources as source}<details>
														<summary>{source.title} · {source.heading}</summary><small>
															{source.filename} · Revision {source.revision}
														</small>
														<pre>{source.content}</pre>
													</details>{/each}
											</details>{/if}
									</div>
								</div>{/each}{#if busy === 'chat'}<div class="thinking">
									Finding the words…
								</div>{/if}{#if !config.aiKey}<div class="assistant-setup">
									<Icon name="key" size={16} />
									<p>
										Bring your own AI key.<br /><button
											onclick={() => {
												void goto('/settings/ai');
											}}
										>
											Configure your AI engine
										</button> to start the conversation.
									</p>
								</div>{/if}
						</div>
						<div class="suggestions">
							<button onclick={() => (message = 'Make this more personal and conversational.')}>
								Make it more personal
							</button><button
								onclick={() => (message = 'Suggest a shorter, more compelling subject line.')}
							>
								Improve the subject
							</button>
						</div>
						<form
							class="chat-input"
							onsubmit={(e) => {
								e.preventDefault();
								void chat();
							}}
						>
							<textarea
								aria-label="Message the writing assistant"
								bind:value={message}
								placeholder="What would you like to share?"
								rows="3"></textarea>
							<div>
								<span>Your ideas. Your voice.</span><button
									class="primary icon-button"
									aria-label="Send message"
									disabled={!!busy || !message.trim()}
								>
									<Icon name="arrow" size={18} />
								</button>
							</div>
						</form>
						<p class="assistant-footnote">You’re always the editor. Review before sending.</p>
					</aside>
				</div>
			{:else}
				<div class="analytics">
					<div class="metric">
						<span>Recipients</span><strong>{campaignDeliveries.length}</strong><small>
							Across {campaign.locales.length} languages
						</small>
					</div>
					<div class="metric">
						<span>{campaign.mode === 'local' ? 'Simulated sends' : 'Accepted by SES'}</span><strong>
							{campaignDeliveries.filter((d) => d.status === 'sent').length}
						</strong><small>
							{campaignDeliveries.filter((d) => d.status === 'queued' || d.status === 'processing')
								.length} pending
						</small>
					</div>
					<div class="metric">
						<span>Unique recorded opens</span><strong>{opened}</strong><small>
							{campaignDeliveries.length
								? Math.round((opened / campaignDeliveries.length) * 100)
								: 0}% of recipients
						</small>
					</div>
					<div class="metric">
						<span>Failed / suppressed</span><strong>
							{campaignDeliveries.filter((d) => ['failed', 'suppressed'].includes(d.status)).length}
						</strong><small>See delivery details below</small>
					</div>
				</div>
				<div class="results-grid">
					<section class="card">
						<div class="card-heading">
							<h2>Delivery activity</h2>
							<span class="badge">
								{campaign.mode === 'local' ? 'Local test' : 'Live campaign'}
							</span>
						</div>
						<p class="helper">Recorded opens measure image loads, not confirmed reads.</p>
						<div class="table-wrap">
							<table>
								<thead>
									<tr><th>Recipient</th><th>Language</th><th>Status</th><th>Opens</th></tr>
								</thead><tbody>
									{#each campaignDeliveries as d}<tr>
											<td><strong>{d.name}</strong><small>{d.email}</small></td><td>
												{language(d.locale)}
											</td><td><span class="badge" title={d.error || ''}>{d.status}</span></td><td>
												{d.open_count}{#if d.mode === 'local' && d.status === 'sent'}<button
														class="text-button"
														onclick={() => {
															selectedDelivery = d.token;
														}}
													>
														Test open
													</button>{/if}
											</td>
										</tr>{/each}
								</tbody>
							</table>
						</div>
					</section>
					<section class="card sent-preview">
						<div class="card-heading">
							<h2>The email you sent</h2>
							<select aria-label="Preview language" bind:value={previewLocale}>
								{#each versions as v}<option value={v.locale}>{language(v.locale)}</option>{/each}
							</select>
						</div>
						<h3>{currentVersion?.subject || campaign.subject}</h3>
						<div class="email-preview">
							{@html renderEmail(currentVersion?.body || campaign.body)}
						</div>
					</section>
				</div>
			{/if}
		{:else if section === 'contacts'}
			<div class="contact-summary">
				<div><strong>{data.contacts.length}</strong><span>Total contacts</span></div>
				<div>
					<strong>
						{data.contacts.filter((c) => !c.unsubscribed && !c.suppressed).length}
					</strong><span>Subscribed</span>
				</div>
				<div>
					<strong>{new Set(data.contacts.map((c) => c.locale)).size}</strong><span>Languages</span>
				</div>
				<div>
					<strong>{data.contacts.filter((c) => c.unsubscribed).length}</strong><span>
						Unsubscribed
					</span>
				</div>
			</div>
			<section class="card contacts-card">
				<div class="table-toolbar">
					<div class="search-box">
						<Icon name="search" size={17} /><input
							aria-label="Search contacts"
							placeholder="Search by name or email…"
							bind:value={contactSearch}
						/>
					</div>
					<select aria-label="Filter contacts by locale" bind:value={contactLocale}>
						<option value="all">All languages</option>{#each locales as l}<option value={l}>
								{language(l)}
							</option>{/each}
					</select><button
						class="primary"
						onclick={() => {
							editingContactId = '';
							contactName = '';
							contactEmail = '';
							newLocale = 'en';
							showContact = true;
						}}
					>
						<Icon name="plus" size={16} /> Add contact
					</button>
				</div>
				<div class="table-wrap">
					<table>
						<thead>
							<tr><th>Name</th><th>Email address</th><th>Language</th><th>Status</th><th></th></tr>
						</thead><tbody>
							{#each filteredContacts as c}<tr>
									<td>
										<div class="contact-name">
											<span class="avatar">{c.name.slice(0, 1)}</span><strong>{c.name}</strong>
										</div>
									</td><td>{c.email}</td><td>
										<span class="locale-tag">{c.locale.toUpperCase()}</span>
										{language(c.locale)}
									</td><td>
										<span class:green={!c.unsubscribed && !c.suppressed} class="badge">
											{c.unsubscribed ? 'Unsubscribed' : c.suppressed ? 'Suppressed' : 'Subscribed'}
										</span>
									</td><td>
										<button
											class="text-button"
											onclick={() => {
												editingContactId = c.id;
												contactName = c.name;
												contactEmail = c.email;
												newLocale = c.locale;
												showContact = true;
											}}
										>
											Edit
										</button>{#if !c.unsubscribed}<button
												class="text-button"
												onclick={() =>
													run('unsubscribe', async () => {
														await api('unsubscribe-contact', { id: c.id });
														await invalidateAll();
													})}
											>
												Unsubscribe
											</button>{/if}
									</td>
								</tr>{:else}<tr>
									<td colspan="5" class="empty">No contacts match your search.</td>
								</tr>{/each}
						</tbody>
					</table>
				</div>
				<div class="table-footer">
					{filteredContacts.length} contacts <span>Imports preserve existing unsubscribes.</span>
				</div>
			</section>
			<div class="subtle-callout">
				<Icon name="key" size={20} />
				<div>
					<strong>Your audience, connected.</strong>
					<p>Add contacts from your app with the contacts API.</p>
				</div>
				<button
					class="secondary"
					onclick={() => {
						void goto('/settings/api');
					}}
				>
					API settings
				</button>
			</div>
		{:else if section === 'settings'}
			<div class="settings-layout">
				<nav class="settings-nav">
					{#each [{ id: 'context', icon: 'file', label: 'Writing instructions' }, { id: 'knowledge', icon: 'search', label: 'Knowledge base' }, { id: 'ai', icon: 'spark', label: 'AI engine' }, { id: 'sender', icon: 'edit', label: 'Sender & signature' }, { id: 'delivery', icon: 'mail', label: 'Email delivery' }, { id: 'images', icon: 'image', label: 'Images' }, { id: 'api', icon: 'key', label: 'API access' }] as tab}<a
							class:active={settingsTab === tab.id}
							href={`/settings/${tab.id}`}
							aria-current={settingsTab === tab.id ? 'page' : undefined}
						>
							<Icon name={tab.icon} size={18} />{tab.label}
						</a>{/each}<a href="/contacts">
						<Icon name="users" size={18} /> Contacts
					</a>
				</nav>
				<section class="card settings-card">
					{#if settingsTab === 'knowledge'}<KnowledgePanel {data} />{:else}
						<form
							onsubmit={(e) => {
								e.preventDefault();
								void run('settings', async () => {
									await api('settings', config);
									await invalidateAll();
									notice = 'Settings saved.';
								});
							}}
						>
							{#if settingsTab === 'context'}
								<h2>Writing instructions</h2>
								<p>
									These instructions are included in every drafting request. Upload long reference
									documents to the Knowledge base.
								</p>
								<label>
									Company name<input bind:value={config.companyName} placeholder="Your company" />
								</label><label>
									Company description<textarea
										rows="7"
										maxlength="20000"
										bind:value={config.companyContext}
										placeholder="What do you do? Who do you help? How do you like to sound?"
									></textarea>
								</label>
								<div class="field-hint">
									Include your products, audience, voice, and preferred terminology.
								</div>
								<label class="ai-token-field">
									Tone of voice<textarea
										rows="3"
										maxlength="20000"
										bind:value={config.companyTone}
										placeholder="Warm, direct, conversational. Avoid hype."></textarea>
								</label>
								<label>
									Target audience<textarea
										rows="3"
										maxlength="20000"
										bind:value={config.companyAudience}
										placeholder="Who are you writing to? What do they care about?"></textarea>
								</label>
								<label>
									Writing rules<textarea
										rows="4"
										maxlength="20000"
										bind:value={config.companyRules}
										placeholder="Requirements the assistant must follow in every email."></textarea>
								</label>
								<label>
									Preferred terminology<textarea
										rows="3"
										maxlength="20000"
										bind:value={config.companyTerminology}
										placeholder="Product names, preferred terms, and words to avoid."></textarea>
								</label>
								<div class="field-hint">
									Each field supports up to 20,000 characters. Keep these concise; relevant
									documentation is retrieved separately.
								</div>
							{:else if settingsTab === 'ai'}
								<h2>Your AI engine</h2>
								<p>Connect OpenAI or an OpenAI-compatible API and choose a model for each task.</p>
								<label>
									API base URL<input
										type="url"
										required
										bind:value={config.aiBaseUrl}
										placeholder="https://api.openai.com/v1"
									/>
								</label>
								<div class="field-hint">
									Include the API version path, such as /v1. OpenAI uses /responses; other providers
									use /chat/completions.
								</div>
								<label class="ai-token-field">
									API token<input
										type="password"
										autocomplete="off"
										bind:value={config.aiKey}
										placeholder="Your provider’s API token"
									/>
								</label>
								<hr />
								<label>
									Email drafting model<input
										required
										bind:value={config.aiDraftModel}
										placeholder="Model ID for drafting"
									/>
								</label>
								<div class="field-hint">
									Used for the writing conversation and drafting or revising your emails.
								</div>
								<label class="ai-token-field">
									Translation model<input
										required
										bind:value={config.aiTranslationModel}
										placeholder="Model ID for translation"
									/>
								</label>
								<div class="field-hint">
									Used to translate approved drafts for each audience locale. Both fields can use
									the same model.
								</div>
								<hr />
								<h3>Token prices · USD per 1 million tokens</h3>
								<p class="pricing-explanation">
									Enter the prices from your provider. These are used to estimate campaign spend.
									Leave unknown prices blank; enter 0 only for a free rate.
								</p>
								{#each [{ label: 'Email drafting', prefix: 'aiDraft' }, { label: 'Translation', prefix: 'aiTranslation' }] as pricing}
									<fieldset class="token-pricing">
										<legend>{pricing.label}</legend>
										<div class="price-fields">
											<label>
												Input<input
													inputmode="decimal"
													placeholder="Not configured"
													bind:value={config[pricing.prefix + 'InputPrice']}
												/>
											</label>
											<label>
												Cached input<input
													inputmode="decimal"
													placeholder="Same as input"
													bind:value={config[pricing.prefix + 'CachedPrice']}
												/>
											</label>
											<label>
												Output<input
													inputmode="decimal"
													placeholder="Not configured"
													bind:value={config[pricing.prefix + 'OutputPrice']}
												/>
											</label>
										</div>
									</fieldset>
								{/each}
								<div class="field-hint">
									Cached tokens use the input rate unless you specify a cached rate. Update prices
									when changing models or providers. Saved prices apply to future requests only.
								</div>
								<hr />
								<h3>Knowledge embeddings</h3>
								<p>
									Used to index documents and search for relevant sections. Your provider must
									support the embeddings endpoint.
								</p>
								<label>
									Embedding model<input
										bind:value={config.embeddingModel}
										required
										placeholder="text-embedding-3-small"
									/>
								</label>
								<label>
									Embedding API base URL <span class="muted">Optional</span><input
										type="url"
										bind:value={config.embeddingBaseUrl}
										placeholder="Use the AI base URL"
									/>
								</label>
								<label>
									Embedding API token <span class="muted">Optional</span><input
										type="password"
										autocomplete="off"
										bind:value={config.embeddingKey}
										placeholder="Use the AI token"
									/>
								</label>
								<label>
									Embedding input price · USD / 1M tokens<input
										inputmode="decimal"
										bind:value={config.embeddingInputPrice}
										placeholder="Not configured"
									/>
								</label>
								<div class="field-hint">
									Blank URL or token uses the AI connection above. After changing the embedding
									model or endpoint, reindex your documents. Existing drafts and sources are
									preserved.
								</div>
							{:else if settingsTab === 'sender'}
								<h2>From a person, to a person.</h2>
								<p>The name and signature your readers will get to know.</p>
								<div class="field-grid">
									<label>Sender name<input bind:value={config.senderName} /></label><label>
										Sender email<input type="email" bind:value={config.senderEmail} />
									</label>
								</div>
								<label>
									Reply-to email<input
										type="email"
										bind:value={config.replyTo}
										placeholder="hello@yourcompany.com"
									/>
								</label><label>
									Default signature<textarea rows="4" bind:value={config.signature}></textarea>
								</label><label>
									Spanish signature <span class="muted">Optional</span><textarea
										rows="4"
										bind:value={config.signatureEs}></textarea>
								</label>
								<div class="field-hint">
									Signatures are included in the reviewed language versions before sending.
								</div>
							{:else if settingsTab === 'delivery'}
								<h2>A clear path to the inbox.</h2>
								<p>
									Connect AWS SES to send real emails. Local test mode works without credentials.
								</p>
								<label>
									AWS region<input bind:value={config.awsRegion} placeholder="eu-west-1" />
								</label><label>
									Access key ID<input autocomplete="off" bind:value={config.awsAccessKey} />
								</label><label>
									Secret access key<input
										type="password"
										autocomplete="off"
										bind:value={config.awsSecretKey}
									/>
								</label>
								<div class="info-box">
									Use an SES-verified sender. In the SES sandbox, recipients must also be verified.
									Localhost images and pixels are only accessible on this machine; real campaigns
									need a public HTTPS app URL.
								</div>
								<div class="field-hint">
									SES delivery, bounce, and complaint webhooks are not connected in this first
									draft. “Sent” means accepted by SES.
								</div>
							{:else if settingsTab === 'images'}
								<h2>A picture, right where it belongs.</h2>
								<p>
									Upload any image into your email. Images are served through this app’s public
									media URLs.
								</p>
								<label>
									ImageKit private API key<input
										type="password"
										autocomplete="off"
										bind:value={config.imagekitKey}
									/>
								</label>
								<div class="info-box">
									Without an ImageKit key, uploads are stored in local Postgres for testing. With a
									key, new uploads go to ImageKit. Existing image URLs keep working.
								</div>
								<div class="field-hint">PNG, JPG, WebP, or GIF · Up to 5 MB per image</div>
							{:else}
								<h2>Keep your audience in sync.</h2>
								<p>
									Import or update contacts from your app. Email addresses identify existing
									contacts.
								</p>
								<button
									type="button"
									class="secondary"
									onclick={() =>
										run('key', async () => {
											const result = await api('api-key', {});
											generatedKey = result.key;
											await invalidateAll();
										})}
								>
									{config.contactsApiKey ? 'Rotate API key' : 'Generate API key'}
								</button>{#if generatedKey}<label>
										Copy your key now<input readonly value={generatedKey} />
									</label>
									<div class="field-hint">
										Rotating the key invalidates the previous key immediately.
									</div>{/if}
								<h3 class="api-heading">POST /api/contacts</h3>
								<pre>Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{JSON.stringify(
										{
											name: 'Sofia García',
											email: 'sofia@example.com',
											locale: 'es',
											unsubscribed: false
										},
										null,
										2
									)}</pre>
								<div class="field-hint">
									Accepts one contact or an array of up to 1,000. Existing unsubscribes are never
									reset by an import.
								</div>{/if}
							{#if settingsTab !== 'api'}<div class="settings-footer">
									<span><Icon name="key" size={13} /> Credentials stay on the server.</span><button
										class="primary"
										disabled={!!busy}
									>
										{busy === 'settings' ? 'Saving…' : 'Save changes'}
									</button>
								</div>{/if}
						</form>{/if}
				</section>
			</div>
		{:else}<div class="empty">
				<h1>A fresh start.</h1>
				<p>Your first newsletter is one idea away.</p>
				<button class="primary" onclick={createCampaign}>Create a campaign</button>
			</div>{/if}
		<footer class="app-footer">
			<span>Made for words worth opening.</span><span>
				postscript <span class="brand-star">✳</span>
			</span>
		</footer>
	</main>
</div>
{#if showContact}<div class="modal-backdrop">
		<div
			class="modal"
			role="dialog"
			tabindex="-1"
			aria-modal="true"
			aria-label="Add or update a contact"
			use:modal={() => (showContact = false)}
		>
			<button class="modal-close" aria-label="Close" onclick={() => (showContact = false)}>
				<Icon name="close" />
			</button><span class="section-icon"><Icon name="users" size={24} /></span>
			<h2>A new connection.</h2>
			<p>Add a contact, or update one using their existing email.</p>
			<form
				onsubmit={(e) => {
					e.preventDefault();
					void addContact();
				}}
			>
				<label>Name<input required bind:value={contactName} /></label><label>
					Email<input required type="email" bind:value={contactEmail} />
				</label><label>
					Locale<input
						required
						pattern={'[a-z]{2,3}(-[A-Za-z0-9]{2,8})*'}
						bind:value={newLocale}
						placeholder="en, es, en-GB…"
					/>
				</label><button class="primary full" disabled={!!busy}>Save contact</button>
			</form>
		</div>
	</div>{/if}
{#if showReview}<div class="modal-backdrop">
		<div
			class="modal review-modal"
			role="dialog"
			tabindex="-1"
			aria-modal="true"
			aria-label="Review campaign"
			use:modal={() => (showReview = false)}
		>
			<button class="modal-close" aria-label="Close review" onclick={() => (showReview = false)}>
				<Icon name="close" />
			</button><span class="eyebrow">ONE LAST LOOK</span>
			<h2>Ready for their inbox?</h2>
			<p>
				{eligible.length} recipients · {audience.length} languages. Review each version before sending.
			</p>
			<div class="review-controls">
				<select aria-label="Review language" bind:value={previewLocale}>
					{#each versions as v}<option value={v.locale}>{language(v.locale)}</option>{/each}
				</select><span>Signature included</span>
			</div>
			<div class="review-email">
				<h3>{currentVersion?.subject}</h3>
				<div class="email-preview">{@html renderEmail(currentVersion?.body || '')}</div>
				<small>Unsubscribe link and tracking pixel are added per recipient.</small>
			</div>
			<label>
				Delivery mode<select bind:value={deliveryMode}>
					<option value="local">Local test — no real emails</option><option value="ses">
						AWS SES — send real emails
					</option>
				</select>
			</label><button class="primary full" disabled={!!busy} onclick={send}>
				<Icon name="send" size={17} />{busy === 'send'
					? 'Queuing…'
					: deliveryMode === 'local'
						? 'Run local delivery test'
						: `Send to ${eligible.length} contacts`}
			</button>
		</div>
	</div>{/if}
{#if selectedDelivery}<div class="modal-backdrop">
		<div
			class="modal"
			role="dialog"
			tabindex="-1"
			aria-modal="true"
			aria-label="Test tracking"
			use:modal={() => {
				selectedDelivery = '';
				void invalidateAll();
			}}
		>
			<button
				class="modal-close"
				aria-label="Close tracking test"
				onclick={() => {
					selectedDelivery = '';
					void invalidateAll();
				}}
			>
				<Icon name="close" />
			</button>
			<h2>A recorded open.</h2>
			<p>
				This local test loads the delivery’s real tracking pixel. Close this window to refresh the
				results.
			</p>
			<img src={`/track/${selectedDelivery}`} alt="" width="1" height="1" /><button
				class="primary"
				onclick={() => {
					selectedDelivery = '';
					void invalidateAll();
				}}
			>
				Back to results
			</button>
		</div>
	</div>{/if}

{#if showAudience}
	<div class="modal-backdrop">
		<div
			class="modal audience-modal"
			role="dialog"
			tabindex="-1"
			aria-modal="true"
			aria-label="Choose audience"
			use:modal={() => (showAudience = false)}
		>
			<button
				class="modal-close"
				aria-label="Close audience picker"
				onclick={() => (showAudience = false)}
			>
				<Icon name="close" />
			</button>
			<h2>Choose your audience</h2>
			<p>
				Select the locales that should receive this campaign. Unsubscribed and suppressed contacts
				are excluded.
			</p>
			<div class="audience-selection-actions">
				<label class="audience-select-all">
					<input
						type="checkbox"
						checked={allAudiencesSelected}
						indeterminate={selectedAudienceCount > 0 && !allAudiencesSelected}
						disabled={!audienceLocales.length}
						onchange={(event) =>
							(audience = event.currentTarget.checked ? [...audienceLocales] : [])}
					/> Select all
				</label>
				<span>{selectedAudienceCount} of {audienceLocales.length} locales selected</span>
			</div>
			<div class="audience-locale-list">
				{#each audienceLocales as locale (locale)}
					<label class="audience-locale-row">
						<input type="checkbox" value={locale} bind:group={audience} />
						<span><strong>{language(locale)}</strong><small>{locale}</small></span>
						<span class="audience-recipient-count">
							{(localeCounts[locale] || 0).toLocaleString()} contacts
						</span>
					</label>
				{:else}<p class="audience-empty">Add contacts to see available audiences.</p>{/each}
			</div>
			<div class="audience-picker-footer">
				<span aria-live="polite">
					{eligible.length.toLocaleString()} eligible recipients
				</span><button class="primary" onclick={() => (showAudience = false)}>Done</button>
			</div>
		</div>
	</div>
{/if}

{#if showSpend}
	<div class="modal-backdrop">
		<div
			class="modal spend-modal"
			role="dialog"
			tabindex="-1"
			aria-modal="true"
			aria-label="Campaign AI spending"
			use:modal={() => (showSpend = false)}
		>
			<button
				class="modal-close"
				aria-label="Close spending breakdown"
				onclick={() => (showSpend = false)}
			>
				<Icon name="close" />
			</button>
			<h2>Campaign AI spending</h2>
			<p>
				Reported token usage × the prices saved for each request. Estimates in USD, excluding email
				delivery, taxes, and provider-specific fees.
			</p>
			<div class="spend-summary">
				<div><span>Drafting</span><strong>{taskSpend('draft')}</strong></div>
				<div><span>Translation</span><strong>{taskSpend('translate')}</strong></div>
				<div><span>Knowledge search</span><strong>{taskSpend('embedding_search')}</strong></div>
				<div>
					<span>{spend.unknown ? 'Known subtotal' : 'Total estimate'}</span><strong>
						{spend.requests
							? spend.unknown === spend.requests
								? 'Unknown'
								: money(spend.total)
							: 'No recorded usage'}
					</strong>
				</div>
			</div>
			{#if spend.unknown}<div class="info-box">
					{spend.unknown} request(s) have unknown costs because usage or prices are missing, or the request
					has not completed. The known subtotal is not a complete campaign total.
				</div>{/if}
			<div class="table-wrap">
				<table>
					<thead>
						<tr><th>Task / model</th><th>Input / cached / output</th><th>Estimated cost</th></tr>
					</thead><tbody>
						{#each campaignUsage as row (row.id)}
							<tr>
								<td>
									<strong>
										{row.task === 'draft'
											? 'Drafting'
											: row.task === 'translate'
												? 'Translation'
												: 'Knowledge search'}{row.locale ? ' · ' + row.locale : ''}
									</strong><small>{row.model}</small><small>
										{date(row.created_at)} · {row.status.replaceAll('_', ' ')}
									</small>
								</td><td>
									{row.input_tokens ?? '—'} / {row.cached_input_tokens ?? '—'} / {row.output_tokens ??
										'—'}<small>
										USD / 1M: {row.rates.input ?? '—'} / {row.rates.cached ?? '—'} / {row.rates
											.output ?? '—'}
									</small>
								</td><td>
									{row.cost_usd === null ? 'Unknown' : money(Number(row.cost_usd))}<small>
										{row.pricing_status === 'missing_prices'
											? 'Prices not configured'
											: row.pricing_status === 'unknown_usage'
												? 'Usage unavailable'
												: 'Estimated'}
									</small>
								</td>
							</tr>
						{:else}<tr><td colspan="3">No AI usage recorded yet.</td></tr>{/each}
					</tbody>
				</table>
			</div>
			<p class="spend-footnote">
				Tracking starts with this update; earlier conversations cannot be reconstructed. Revisions,
				repeated translations, and invalid generations with reported usage are included. Prices are
				preserved per request.
			</p>
			<button
				class="secondary"
				onclick={() => {
					showSpend = false;
					void goto('/settings/ai');
				}}
			>
				Configure token prices
			</button>
		</div>
	</div>
{/if}
