<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { invalidateAll, goto, beforeNavigate } from '$app/navigation';
	import type { LayoutData } from '../routes/(workspace)/$types';
	import { renderEmail } from '#lib/email.js';
	import Icon from '#lib/Icon.svelte';
	import AppShell from '#lib/AppShell.svelte';
	import { formatCampaignDate } from '#lib/campaign-dates.js';

	let { data, campaignId }: { data: LayoutData; campaignId: string } = $props();
	const campaign = $derived(data.campaigns.find((c) => c.id === campaignId)!);
	const locales = $derived<string[]>(campaign.locales);
	const versions = $derived(data.versions.filter((v) => v.campaign_id === campaignId));
	let selected = $state<string>(untrack(() => campaign.locales[0] || ''));
	const selectedLocale = $derived(locales.includes(selected) ? selected : locales[0]);
	const current = $derived(versions.find((v) => v.locale === selectedLocale));
	const approvedCount = $derived(
		locales.filter((locale) =>
			versions.some((v) => v.locale === locale && v.status === 'ready' && v.approved_at)
		).length
	);
	const recipients = $derived(
		data.contacts.filter((c) => !c.unsubscribed && !c.suppressed && locales.includes(c.locale))
	);
	const editable = $derived(campaign.status === 'draft');
	const canSend = $derived(
		editable && locales.length > 0 && approvedCount === locales.length && recipients.length > 0
	);
	let busy = $state('');
	let problem = $state('');
	let editingId = $state('');
	let editSubject = $state('');
	let editBody = $state('');
	let originalSubject = $state('');
	let originalBody = $state('');
	const editDirty = $derived(
		!!editingId && (editSubject !== originalSubject || editBody !== originalBody)
	);
	beforeNavigate(({ cancel, willUnload }) => {
		if (editDirty && (willUnload || !window.confirm('Discard unsaved changes to this language?')))
			cancel();
	});
	function cancelEdit() {
		if (busy || (editDirty && !window.confirm('Discard unsaved changes to this language?')))
			return false;
		editingId = '';
		return true;
	}
	function selectLocale(locale: string) {
		if (locale === selectedLocale || !cancelEdit()) return;
		selected = locale;
	}
	function edit() {
		if (!current || !editable || busy) return;
		editingId = current.id;
		editSubject = originalSubject = current.subject;
		editBody = originalBody = current.body;
		problem = '';
	}
	async function saveEdit() {
		if (!editingId || busy || !editable) return;
		busy = 'edit';
		problem = '';
		try {
			await api('edit-version', { version_id: editingId, subject: editSubject, body: editBody });
			editingId = '';
			await invalidateAll();
		} catch (cause) {
			problem = cause instanceof Error ? cause.message : 'Could not save this language.';
		} finally {
			busy = '';
		}
	}
	const active = new Set<string>();
	let stopped = false;
	let polling = false;
	function language(locale: string) {
		try {
			return new Intl.DisplayNames(['en'], { type: 'language' }).of(locale) || locale;
		} catch {
			return locale;
		}
	}
	function status(locale: string) {
		const version = versions.find((v) => v.locale === locale);
		if (version?.status === 'failed') return 'Translation failed';
		if (version?.status !== 'ready') return 'Translating…';
		return version.approved_at ? 'Approved' : 'Ready to review';
	}
	async function api(path: string, payload: Record<string, unknown>) {
		const response = await fetch(`/api/${path}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id: campaignId, ...payload })
		});
		const result = await response.json();
		if (!response.ok) throw new Error(result.message || 'Something went wrong.');
		return result;
	}
	async function translate(locale: string, retry = false) {
		if (active.has(locale) || stopped || !editable) return;
		active.add(locale);
		try {
			await api('translate', { locale, retry });
			if (!stopped) await invalidateAll();
		} catch (cause) {
			if (!stopped)
				problem = cause instanceof Error ? cause.message : 'Could not prepare translations.';
		} finally {
			active.delete(locale);
		}
	}
	function prepareMissing() {
		if (!editable || !campaign.subject.trim() || !campaign.body.trim()) return;
		for (const locale of locales) {
			if (active.size >= 3) break;
			const version = versions.find((v) => v.locale === locale);
			if (!version || version.status === 'translating') void translate(locale);
		}
	}
	onMount(() => {
		prepareMissing();
		const timer = setInterval(async () => {
			if (polling) return;
			polling = true;
			try {
				await invalidateAll();
				if (!stopped) prepareMissing();
			} catch {
				if (!stopped) problem = 'Could not refresh previews. Check your connection.';
			} finally {
				polling = false;
			}
		}, 1500);
		return () => {
			stopped = true;
			clearInterval(timer);
		};
	});
	async function approve() {
		if (!current || current.status !== 'ready' || busy || !editable) return;
		busy = 'approve';
		problem = '';
		try {
			await api('approve-version', { version_id: current.id, approved: !current.approved_at });
			await invalidateAll();
		} catch (cause) {
			problem = cause instanceof Error ? cause.message : 'Could not save approval.';
		} finally {
			busy = '';
		}
	}
	async function send() {
		if (!canSend || busy || editingId) return;
		busy = 'send';
		problem = '';
		try {
			await api('send', {});
			await goto(`/campaigns/${campaignId}`, { refreshAll: true });
		} catch (cause) {
			problem = cause instanceof Error ? cause.message : 'Could not send campaign.';
		} finally {
			busy = '';
		}
	}
</script>

<svelte:head><title>Review translations — {campaign.subject} — Postscript</title></svelte:head>
<AppShell
	companyName={data.config.companyName || 'Your company'}
	section="campaign"
	settingsTab=""
	title={campaign.subject || campaign.title}
	campaignHref={`/campaigns/${campaignId}`}
	step="Review & send"
>
	<div class="review-page">
		<a class="skip-link" href="#translation-preview">Skip to email preview</a>
		<header class="review-header">
			<div class="heading">
				<a class="back-link" href={`/campaigns/${campaignId}`}>
					<Icon name="chevron" size={14} /> Back to draft
				</a>
			</div>
			<button class="primary" onclick={send} disabled={!canSend || !!busy || !!editingId}>
				<Icon name="send" size={16} />{busy === 'send'
					? campaign.scheduled_at
						? 'Scheduling…'
						: 'Sending…'
					: campaign.scheduled_at
						? 'Schedule send'
						: 'Send Now'}
			</button>
		</header>
		{#if campaign.scheduled_at}<p class="campaign-notice">
				{#if campaign.scheduled_at}Send on {formatCampaignDate(campaign.scheduled_at)}.{/if}
			</p>{/if}
		{#if problem}<div class="review-error" role="alert">
				{problem}<button class="secondary" onclick={() => (problem = '')}>Dismiss</button>
			</div>{/if}
		{#if !editable}<p class="campaign-notice" role="status">
				This campaign has already been queued. These previews are read-only.
			</p>{/if}
		<div class="review-layout">
			<aside class="locale-sidebar" aria-label="Language previews">
				<div class="sidebar-heading">
					<h2>Languages</h2>
					<span>{locales.length}</span>
				</div>
				<p class="progress" aria-live="polite">{approvedCount} of {locales.length} approved</p>
				<nav aria-label="Select a language">
					{#each locales as locale (locale)}
						<button
							class="locale-item"
							class:selected={selectedLocale === locale}
							aria-current={selectedLocale === locale ? 'true' : undefined}
							onclick={() => selectLocale(locale)}
							disabled={!!busy}
						>
							<span class="locale-title">{language(locale)} <small>{locale}</small></span>
							<span
								class="locale-status"
								class:approved={status(locale) === 'Approved'}
								class:failed={status(locale) === 'Translation failed'}
							>
								{#if status(locale) === 'Approved'}<Icon name="check" size={14} />{/if}{status(
									locale
								)}
							</span>
						</button>
					{/each}
				</nav>
			</aside>
			<section
				id="translation-preview"
				class="preview-panel"
				aria-label="Translated email"
				tabindex="-1"
			>
				{#if selectedLocale}
					<div class="preview-heading">
						<div>
							<span class="eyebrow">EMAIL PREVIEW</span>
							<h2>{language(selectedLocale)}</h2>
							<p>
								{selectedLocale === campaign.source_locale ? 'Original language' : 'AI translation'} ·
								Signature included
							</p>
						</div>
						{#if current?.status === 'ready' && !editingId}<div class="preview-actions">
								<button class="secondary" onclick={edit} disabled={!!busy || !editable}>
									<Icon name="edit" size={16} />Edit
								</button><button
									class={current.approved_at ? 'secondary' : 'primary'}
									onclick={approve}
									disabled={!!busy || !editable}
								>
									<Icon name="check" size={16} />{busy === 'approve'
										? 'Saving…'
										: current.approved_at
											? 'Revoke approval'
											: `Approve ${language(selectedLocale)}`}
								</button>
							</div>{/if}
					</div>
					{#if editingId}
						<form
							class="email-card email-editor"
							onsubmit={(event) => {
								event.preventDefault();
								void saveEdit();
							}}
						>
							<label>
								Subject<input
									bind:value={editSubject}
									maxlength="500"
									required
									disabled={!!busy || !editable}
								/>
							</label>
							<label>
								Email body<textarea
									bind:value={editBody}
									rows="20"
									maxlength="100000"
									required
									disabled={!!busy || !editable}></textarea>
							</label>
							<p class="preview-note">
								Markdown supported · Includes the signature. Saving changes requires approval again.
							</p>
							<div class="preview-actions">
								<button type="button" class="secondary" onclick={cancelEdit} disabled={!!busy}>
									Cancel
								</button><button
									type="submit"
									class="primary"
									disabled={!!busy || !editable || !editSubject.trim() || !editBody.trim()}
								>
									{busy === 'edit' ? 'Saving…' : 'Save changes'}
								</button>
							</div>
						</form>
					{:else if current?.status === 'ready'}
						<article class="email-card" lang={selectedLocale} dir="auto">
							<header>
								<span>Subject</span>
								<h3>{current.subject}</h3>
							</header>
							<div class="email-preview">{@html renderEmail(current.body)}</div>
						</article>
						<p class="preview-note">Unsubscribe link and tracking pixel are added per recipient.</p>
					{:else if current?.status === 'failed'}
						<div class="empty-preview" role="status">
							<Icon name="mail" size={28} />
							<h3>This translation needs another try</h3>
							<p>{current.error}</p>
							<button
								class="secondary"
								disabled={!editable}
								onclick={() => translate(selectedLocale, true)}
							>
								Retry translation
							</button>
						</div>
					{:else if !campaign.subject.trim() || !campaign.body.trim()}
						<div class="empty-preview">
							<h3>Finish your draft first</h3>
							<p>Add a subject and email body, then return to review.</p>
							<a class="secondary" href={`/campaigns/${campaignId}`}>Back to draft</a>
						</div>
					{:else}
						<div class="empty-preview" role="status" aria-live="polite">
							<div class="spinner"></div>
							<h3>Preparing {language(selectedLocale)}…</h3>
							<p>You can review other languages while this translation is in progress.</p>
							<div class="skeleton"></div>
							<div class="skeleton short"></div>
						</div>
					{/if}
				{:else}<div class="empty-preview">
						<h2>No audience selected</h2>
						<p>Choose audience languages in your draft to prepare previews.</p>
						<a class="secondary" href={`/campaigns/${campaignId}`}>Back to draft</a>
					</div>{/if}
				<footer class="review-footer">
					<span>{recipients.length} eligible recipients</span><span>
						{canSend
							? 'All languages approved. Ready to send.'
							: 'Approve every language before sending.'}
					</span>
				</footer>
			</section>
		</div>
	</div>
</AppShell>

<style>
	.review-page {
		padding: 0;
		background: var(--surface-muted);
	}
	.review-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
		padding: 24px 32px;
		flex-wrap: wrap;
	}
	.heading {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 20px;
		min-width: 0;
	}
	.back-link {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--text-secondary);
		font-size: 13px;
	}
	.back-link :global(svg) {
		transform: rotate(180deg);
	}
	.review-layout {
		display: grid;
		grid-template-columns: 220px minmax(0, 1fr);
		border-top: 1px solid var(--border);
	}
	.locale-sidebar {
		background: var(--surface);
		padding: 24px 12px;
		border-right: 1px solid var(--border);
	}
	.sidebar-heading {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0 12px;
	}
	.sidebar-heading h2 {
		font-size: 15px;
		font-weight: 650;
	}
	.sidebar-heading span {
		font-size: 12px;
		color: var(--text-secondary);
	}
	.progress {
		margin: 6px 12px 22px;
		font-size: 12px;
		color: var(--text-secondary);
	}
	nav {
		display: grid;
		gap: 8px;
	}
	.locale-item {
		display: grid;
		gap: 8px;
		width: 100%;
		text-align: left;
		padding: 16px;
		border: 1px solid transparent;
		border-radius: 9px;
	}
	.locale-item:hover {
		background: var(--accent-tint);
	}
	.locale-item.selected {
		background: var(--accent-tint);
		border-color: var(--accent);
	}
	.locale-title {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		font-size: 14px;
		font-weight: 600;
	}
	.locale-title small {
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 400;
	}
	.locale-status {
		display: flex;
		align-items: center;
		gap: 5px;
		color: var(--text-secondary);
		font-size: 12px;
	}
	.approved {
		color: #18734b;
	}
	.failed {
		color: #b42318;
	}
	.preview-panel {
		min-width: 0;
		padding: 24px 32px;
		outline: none;
	}
	.preview-actions {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}
	.email-editor {
		padding: 24px 32px;
	}
	.preview-heading {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 16px;
		margin: 0 0 28px;
	}
	.preview-heading h2 {
		margin: 6px 0;
		font-size: 20px;
		font-weight: 600;
	}
	.preview-heading p,
	.preview-note {
		color: var(--text-secondary);
		font-size: 12px;
	}
	.email-card {
		min-width: 0;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 12px;
		overflow: hidden;
		box-shadow: 0 2px 8px rgb(33 27 50 / 0.04);
	}
	.email-card header {
		padding: 24px 32px;
		border-bottom: 1px solid var(--border);
	}
	.email-card header span {
		color: var(--text-secondary);
		font-size: 12px;
	}
	.email-card h3 {
		font-size: 20px;
		font-weight: 600;
		margin-top: 8px;
		overflow-wrap: anywhere;
	}
	.email-preview {
		padding: 24px 32px;
		min-height: 340px;
		overflow-wrap: anywhere;
	}
	.preview-note {
		margin: 16px 0;
	}
	.empty-preview {
		margin: auto;
		min-height: 390px;
		padding: 60px 32px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		text-align: center;
	}
	.empty-preview h3 {
		font-size: 20px;
		font-weight: 600;
	}
	.empty-preview p {
		max-width: 440px;
		font-size: 14px;
		line-height: 1.7;
		color: var(--text-secondary);
		overflow-wrap: anywhere;
	}
	.spinner {
		width: 28px;
		height: 28px;
		border: 3px solid var(--border);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}
	.skeleton {
		height: 10px;
		width: 70%;
		background: var(--border);
		border-radius: 4px;
		margin-top: 10px;
	}
	.skeleton.short {
		width: 45%;
		margin: 0;
	}
	.review-footer {
		display: flex;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 12px;
		margin: 32px 0 0;
		font-size: 12px;
		color: var(--text-secondary);
	}
	.review-error,
	.campaign-notice {
		padding: 16px 36px;
		background: #fff4ed;
		color: #9b3412;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}
	.skip-link {
		position: absolute;
		top: -100px;
		left: 16px;
		padding: 12px;
		background: var(--surface);
		z-index: 20;
	}
	.skip-link:focus {
		top: 12px;
	}
	button:focus-visible,
	a:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 3px;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation: none;
		}
	}
	@media (max-width: 1000px) {
		.review-page {
			padding: 0;
		}
		.review-header {
			padding: 20px;
		}
		.review-layout {
			grid-template-columns: 1fr;
		}
		.locale-sidebar {
			border-right: 0;
			border-bottom: 1px solid var(--border);
			padding: 20px 12px;
		}
		nav {
			grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		}
		.preview-panel {
			padding: 24px 16px;
		}
		.preview-heading {
			align-items: start;
			flex-direction: column;
		}
	}
</style>
