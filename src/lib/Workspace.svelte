<script lang="ts">
	import { reasonLabel } from '#lib/unsubscribe.js';
	import { page } from '$app/state';
	import { invalidateAll, goto, beforeNavigate } from '$app/navigation';
	import { onMount, untrack, tick } from 'svelte';
	import type { LayoutData } from '../routes/(workspace)/$types';
	import type { PageData as ContactsData } from '../routes/(workspace)/contacts/$types';
	import Icon from '#lib/Icon.svelte';
	import KnowledgePanel from '#lib/KnowledgePanel.svelte';
	import AppShell from '#lib/AppShell.svelte';
	import CampaignList from '#lib/CampaignList.svelte';
	import CampaignStats from '#lib/CampaignStats.svelte';
	import DeadlinePicker from '#lib/DeadlinePicker.svelte';
	import ServiceValidation from '#lib/ServiceValidation.svelte';
	import ContactsApiDocs from '#lib/ContactsApiDocs.svelte';
	import ApiKeysPanel from '#lib/ApiKeysPanel.svelte';
	import { localDateTime, formatCampaignDate } from '#lib/campaign-dates.js';
	import { campaignStatus } from '#lib/navigation.js';
	import { summarizeDeliveries } from '#lib/delivery-stats.js';
	import { workspaceLinks, settingsLinks } from '#lib/navigation.js';
	import { summarizeSpend } from '#lib/ai-cost.js';
	import { renderEmail } from '#lib/email.js';
	let {
		data,
		section = 'campaign',
		contactList,
		settingsTab = 'context',
		campaignId = ''
	}: {
		data: LayoutData;
		contactList?: ContactsData['contactList'];
		section?: string;
		settingsTab?: string;
		campaignId?: string;
	} = $props();
	const initialCampaign = untrack(() => data.campaigns.find((c) => c.id === campaignId));
	let bypassNavigationGuard = false;
	let editorTab = $state('write');
	let showAssistant = $state(false);
	let assistantLauncher = $state<HTMLButtonElement>();
	let assistantInput = $state<HTMLTextAreaElement>();
	let conversation = $state<HTMLDivElement>();
	async function openAssistant() {
		showAssistant = true;
		await tick();
		assistantInput?.focus({ preventScroll: true });
		if (conversation) conversation.scrollTop = conversation.scrollHeight;
	}
	function closeAssistant() {
		showAssistant = false;
		assistantLauncher?.focus({ preventScroll: true });
	}
	$effect(() => {
		const count = campaign?.messages.length;
		const pending = busy === 'chat';
		if (showAssistant && conversation && (count || pending)) {
			const node = conversation;
			const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 140;
			if (nearBottom)
				void tick().then(() => {
					node.scrollTop = node.scrollHeight;
				});
		}
	});
	let audience = $state<string[]>(initialCampaign?.locales || []);
	let sourceLocale = $state(initialCampaign?.source_locale || 'en');
	let showAudience = $state(false);
	let showSpend = $state(false);
	let scheduledAt = $state(localDateTime(initialCampaign?.scheduled_at));
	let timezone = $state('');
	let subject = $state(initialCampaign?.subject || '');
	let body = $state(initialCampaign?.body || '');
	const title = $derived(subject.trim() || 'Untitled campaign');
	let message = $state('');
	let busy = $state('');
	let notice = $state('');
	let problem = $state('');
	let searchTimer: ReturnType<typeof setTimeout>;
	beforeNavigate(() => clearTimeout(searchTimer));

	function updateFilters(form: HTMLFormElement, delay = 0) {
		clearTimeout(searchTimer);
		const url = new URL(page.url.href);
		for (const [key, value] of new FormData(form)) {
			const text = String(value);
			if (text && (key === 'q' || text !== 'all')) url.searchParams.set(key, text);
			else url.searchParams.delete(key);
		}
		url.searchParams.delete('page');
		searchTimer = setTimeout(() => void goto(url, { reset: false, replace: true }), delay);
	}

	function contactsPageHref(number: number) {
		const url = new URL(page.url.href);
		url.searchParams.set('page', String(number));
		return url.pathname + url.search;
	}
	const configuration = $derived(settingsLinks.some((link) => link.id === settingsTab));
	const settingsLabel = $derived(
		[...workspaceLinks, ...settingsLinks].find((link) => link.id === settingsTab)?.label ||
			'Settings'
	);
	let showContact = $state(false);
	let contactName = $state('');
	let contactEmail = $state('');
	let newLocale = $state('en');
	let config = $state<Record<string, string>>(untrack(() => ({ ...data.config })));
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
	const deliverySummary = $derived(
		summarizeDeliveries(data.deliverySummaries.filter((d) => d.campaign_id === campaign?.id))
	);
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
	const dirty = $derived(
		section === 'campaign' &&
			campaign?.status === 'draft' &&
			(scheduledAt !== localDateTime(campaign.scheduled_at) ||
				subject !== campaign.subject ||
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
			scheduledAt = localDateTime(campaign.scheduled_at);
			subject = campaign.subject;
			body = campaign.body;
			audience = campaign.locales.filter((locale: string) => audienceLocales.includes(locale));
			sourceLocale = campaign.source_locale;
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
		timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		scheduledAt = localDateTime(campaign?.scheduled_at);
		const timer = setInterval(() => {
			if (
				(['campaign', 'campaigns'].includes(section) &&
					data.campaigns.some((c) => ['sending', 'scheduled'].includes(c.status))) ||
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
			if (action === 'chat' || action === 'review') await invalidateAll();
		} finally {
			busy = '';
		}
	}
	async function persist() {
		if (!campaign || !dirty) return;
		await api('save', {
			id: campaign.id,
			subject,
			body,
			locales: audience,
			source_locale: sourceLocale,
			scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null
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
			await navigateAfterMutation('/campaigns', true);
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
	async function review() {
		await run('review', async () => {
			if (!campaign) return;
			if (dirty) await persist();
			await navigateAfterMutation(`/campaigns/${campaign.id}/review`);
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
			: section === 'campaigns'
				? 'Campaigns'
				: section === 'contacts'
					? 'Contacts'
					: settingsLabel} — Postscript</title
	>
</svelte:head>
<AppShell companyName={config.companyName || 'Your company'} {section} {settingsTab} {title}>
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
	{#if section === 'campaigns'}
		<CampaignList {data} {busy} oncreate={createCampaign} />
	{:else if section === 'campaign' && campaign}
		<div class="page-heading campaign-heading">
			<div>
				<div class="title-row">
					<span class:green={campaign.status === 'sent'} class="badge">
						{campaignStatus(campaign.status)}
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
							{#if campaign.sent_at}· {date(campaign.sent_at)}{/if} · {deliverySummary.total.toLocaleString()}
							recipients
						</span>{/if}
				</p>
			</div>
			<div class="heading-actions">
				{#if campaign.status === 'draft'}<DeadlinePicker
						bind:value={scheduledAt}
						disabled={!!busy}
						{timezone}
					/><span class="save-status">
						<Icon name={dirty ? 'edit' : 'check'} size={14} />{dirty
							? 'Unsaved changes'
							: 'All changes saved'}
					</span><button class="secondary" onclick={deleteDraft} disabled={!!busy}>
						{busy === 'delete' ? 'Deleting…' : 'Delete draft'}
					</button><button class="secondary" onclick={save} disabled={!!busy}>
						{busy === 'save' ? 'Saving…' : 'Save draft'}
					</button><button
						class="primary"
						onclick={review}
						disabled={!!busy || !subject.trim() || !body.trim() || !eligible.length}
					>
						<Icon name="send" size={16} />{busy === 'review' ? 'Opening…' : 'Review & send'}
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
								<Icon name="bold" size={16} />
							</button><button
								aria-label="Insert italic text"
								onclick={() => insert('*your text*')}
							>
								<Icon name="italic" size={16} />
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
			</div>
			{#if showAssistant}
				<div
					class="assistant-panel floating-assistant"
					id="drafting-assistant"
					role="dialog"
					aria-label="AI writing assistant"
					tabindex="-1"
					onkeydown={(event) => {
						if (event.key === 'Escape' && !showAudience && !showSpend) {
							event.stopPropagation();
							closeAssistant();
						}
					}}
				>
					<div class="assistant-title">
						<span class="ai-icon"><Icon name="spark" size={20} /></span>
						<div>
							<h2>Writing assistant</h2>
							<p>Draft, refine, and find the right words.</p>
						</div>
						<button
							class="assistant-close"
							aria-label="Close writing assistant"
							title="Close writing assistant"
							onclick={closeAssistant}
						>
							<Icon name="close" size={20} />
						</button>
					</div>
					<div class="conversation" bind:this={conversation}>
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
							bind:this={assistantInput}
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
				</div>
			{/if}
			<button
				class="assistant-launcher"
				bind:this={assistantLauncher}
				onclick={() => (showAssistant ? closeAssistant() : openAssistant())}
				aria-label={showAssistant ? 'Close writing assistant' : 'Open writing assistant'}
				aria-expanded={showAssistant}
				aria-controls="drafting-assistant"
				aria-haspopup="dialog"
			>
				<Icon name={showAssistant ? 'close' : 'spark'} size={22} /><span>
					{busy === 'chat' ? 'Writing…' : 'AI assistant'}
				</span>
			</button>
		{:else}
			{#if campaign.status === 'scheduled'}
				<section class="schedule-summary card">
					<h2>Scheduled for {formatCampaignDate(campaign.scheduled_at)}</h2>
					<p>
						All languages are approved. {campaign.mode === 'local'
							? 'Delivery will be simulated; no emails will be sent.'
							: 'Delivery will start automatically at this time.'}
					</p>
					<div>
						<a class="secondary" href={`/campaigns/${campaign.id}/review`}>View approved emails</a>
						<button
							class="secondary"
							disabled={!!busy}
							onclick={() =>
								run('cancel-schedule', async () => {
									await api('cancel-schedule', { id: campaign.id });
									await invalidateAll();
								})}
						>
							{busy === 'cancel-schedule' ? 'Canceling…' : 'Cancel schedule & edit'}
						</button>
					</div>
				</section>
			{:else}<CampaignStats {data} campaignId={campaign.id} />{/if}
		{/if}
	{:else if section === 'contacts' && contactList}
		<section class="card contacts-card">
			<form
				class="table-toolbar"
				method="GET"
				onsubmit={(event) => {
					event.preventDefault();
					updateFilters(event.currentTarget);
				}}
			>
				<div class="search-box">
					<Icon name="search" size={17} /><input
						aria-label="Search contacts"
						placeholder="Search by name or email…"
						name="q"
						value={contactList.query}
						oninput={(event) => updateFilters(event.currentTarget.form!, 250)}
					/>
				</div>
				<span class="select-control">
					<select
						aria-label="Filter contacts by email permission"
						name="permission"
						value={contactList.permission}
						onchange={(event) => updateFilters(event.currentTarget.form!)}
					>
						<option value="all">All permissions</option><option value="allowed">
							Can receive email
						</option><option value="blocked">Cannot receive email</option>
					</select><Icon name="down" size={14} />
				</span>
				<span class="select-control">
					<select
						aria-label="Filter contacts by locale"
						name="locale"
						value={contactList.locale}
						onchange={(event) => updateFilters(event.currentTarget.form!)}
					>
						<option value="all">All languages</option>{#each contactList.locales as l (l)}<option
								value={l}
							>
								{language(l)}
							</option>{/each}
					</select><Icon name="down" size={14} />
				</span><button
					type="button"
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
			</form>
			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th>Name</th><th>Email address</th><th>Language</th><th>Email permission</th><th>
								<span class="sr-only">Actions</span>
							</th>
						</tr>
					</thead><tbody>
						{#each contactList.rows as c (c.id)}<tr>
								<td>
									<div class="contact-name">
										<span class="avatar">{c.name.slice(0, 1)}</span><strong>{c.name}</strong>
									</div>
								</td><td>{c.email}</td><td>
									<span class="locale-tag">{c.locale.toUpperCase()}</span>
									{language(c.locale)}
								</td><td>
									<span class:green={!c.unsubscribed && !c.suppressed} class="badge">
										{c.unsubscribed || c.suppressed ? 'Cannot send' : 'Can send'}
									</span>
									{#if c.unsubscribed || c.suppressed}<small>
											{[
												c.unsubscribed && `Unsubscribed · ${reasonLabel(c.unsubscribe_reason)}`,
												c.suppressed && 'Suppressed'
											]
												.filter(Boolean)
												.join(' · ')}
										</small>{/if}
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
				{contactList.total ? contactList.offset + 1 : 0}–{contactList.offset +
					contactList.rows.length} of {contactList.total.toLocaleString('en')} contacts
				{#if contactList.pages > 1}
					<nav aria-label="Contacts pagination">
						{#if contactList.page > 1}<a href={contactsPageHref(contactList.page - 1)} rel="prev">
								Previous
							</a>{/if}
						Page {contactList.page} of {contactList.pages}
						{#if contactList.page < contactList.pages}<a
								href={contactsPageHref(contactList.page + 1)}
								rel="next"
							>
								Next
							</a>{/if}
					</nav>
				{/if} <span>Imports preserve existing unsubscribes.</span>
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
					void goto('/settings/api-keys');
				}}
			>
				API settings
			</button>
		</div>
	{:else if section === 'settings'}
		<div class="settings-layout" class:content-settings={!configuration}>
			{#if configuration}
				<nav class="settings-nav" aria-label="Settings navigation">
					{#each settingsLinks as tab (tab.id)}<a
							class:active={settingsTab === tab.id}
							href={`/settings/${tab.id}`}
							aria-current={settingsTab === tab.id ? 'page' : undefined}
						>
							<Icon name={tab.icon} size={18} />{tab.label}
						</a>{/each}
					<form method="POST" action="/logout" class="settings-logout">
						<button type="submit"><Icon name="logout" size={18} /> Sign out</button>
					</form>
				</nav>
			{/if}
			<section class="card settings-card">
				{#if settingsTab === 'account'}
					<form method="POST" action="?/credentials">
						<label>
							Username<input
								name="username"
								value={page.form?.username ?? data.user.username}
								autocomplete="username"
								required
							/>
						</label>
						<label>
							Current password<input
								type="password"
								name="currentPassword"
								autocomplete="current-password"
								required
								maxlength="1024"
							/>
						</label>
						<label>
							New password (optional)<input
								type="password"
								name="newPassword"
								autocomplete="new-password"
								minlength="8"
								maxlength="1024"
								aria-describedby="password-hint"
							/>
						</label>
						<p id="password-hint" class="field-hint">
							Use at least 8 characters. Leave blank to keep your current password.
						</p>
						<label>
							Confirm new password<input
								type="password"
								name="confirmation"
								autocomplete="new-password"
								maxlength="1024"
							/>
						</label>
						{#if page.form?.error}<p role="alert">{page.form.error}</p>{/if}
						{#if page.form?.saved}<p role="status">Account updated.</p>{/if}
						<button class="primary" type="submit">Save account changes</button>
					</form>
				{:else if settingsTab === 'knowledge'}<KnowledgePanel
						{data}
					/>{:else if settingsTab === 'api-keys'}<ApiKeysPanel
					/>{:else if settingsTab === 'api-docs'}<ContactsApiDocs />{:else}
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
								Used to translate approved drafts for each audience locale. Both fields can use the
								same model.
							</div>
							<hr />
							<ServiceValidation service="ai" label="AI connection" {config} disabled={!!busy} />
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
								Used to index documents and search for relevant sections. Your provider must support
								the embeddings endpoint.
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
								Blank URL or token uses the AI connection above. After changing the embedding model
								or endpoint, reindex your documents. Existing drafts and sources are preserved.
							</div>
							<ServiceValidation
								service="embeddings"
								label="embeddings"
								{config}
								disabled={!!busy}
							/>
						{:else if settingsTab === 'sender'}
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
								Localhost images and pixels are only accessible on this machine; real campaigns need
								a public HTTPS app URL.
							</div>
							<div class="field-hint">
								SES delivery, bounce, and complaint webhooks are not connected in this first draft.
								“Sent” means accepted by SES.
							</div>
							<ServiceValidation service="aws" label="AWS SES" {config} disabled={!!busy} />
						{:else if settingsTab === 'images'}
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
							<ServiceValidation service="imagekit" label="ImageKit" {config} disabled={!!busy} />
						{/if}
						<div class="settings-footer">
							<span><Icon name="key" size={13} /> Credentials stay on the server.</span><button
								class="primary"
								disabled={!!busy}
							>
								{busy === 'settings' ? 'Saving…' : 'Save changes'}
							</button>
						</div>
					</form>{/if}
			</section>
		</div>
	{:else}<div class="empty">
			<h1>A fresh start.</h1>
			<p>Your first newsletter is one idea away.</p>
			<button class="primary" onclick={createCampaign}>Create a campaign</button>
		</div>{/if}
</AppShell>
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

<style>
	.schedule-summary {
		margin: 0 32px;
		padding: 28px;
		display: grid;
		gap: 16px;
	}
	.schedule-summary div {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
	}
	@media (max-width: 760px) {
		.schedule-summary {
			margin-inline: 20px;
		}
	}
</style>
