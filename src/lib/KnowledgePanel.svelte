<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Icon from './Icon.svelte';
	import type { LayoutData } from '../routes/(workspace)/$types';
	import type { KnowledgeSource } from './knowledge';
	let { data }: { data: LayoutData } = $props();
	let busy = $state(''),
		problem = $state(''),
		notice = $state(''),
		query = $state(''),
		documentTitle = $state('');
	let results = $state<KnowledgeSource[]>([]);
	let searched = $state(false);
	const indexUsage = $derived(data.aiUsage.filter((row) => row.task === 'embedding_index'));
	const unknown = $derived(indexUsage.filter((row) => row.cost_usd === null).length);
	const knownCost = $derived(
		indexUsage.reduce((total, row) => total + Number(row.cost_usd ?? 0), 0)
	);
	const money = (n: number) =>
		new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			maximumFractionDigits: 6
		}).format(n);
	async function action(name: string, body: unknown) {
		const response = await fetch('/api/knowledge/' + name, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		const result = await response.json();
		if (!response.ok) throw new Error(result.message || 'Knowledge operation failed.');
		return result;
	}
	async function run(name: string, fn: () => Promise<void>) {
		busy = name;
		problem = '';
		notice = '';
		try {
			await fn();
		} catch (e) {
			problem = e instanceof Error ? e.message : 'Something went wrong.';
		} finally {
			busy = '';
		}
	}
	async function upload(event: Event, id?: string) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		await run('upload', async () => {
			const form = new FormData();
			form.set('file', file);
			if (id) form.set('id', id);
			form.set(
				'title',
				id
					? data.documents.find((d) => d.id === id)?.title || file.name
					: documentTitle || file.name
			);
			const response = await fetch('/api/knowledge/upload', { method: 'POST', body: form });
			const result = await response.json();
			if (!response.ok) throw new Error(result.message);
			notice = result.unchanged ? 'This document is unchanged.' : 'Document queued for indexing.';
			documentTitle = '';
			results = [];
			searched = false;
			await invalidateAll();
		});
		input.value = '';
	}
	async function remove(id: string, title: string) {
		if (
			!window.confirm(
				`Delete “${title}” and remove it from future searches? Past source references and usage records will remain.`
			)
		)
			return;
		await run('delete', async () => {
			await action('delete', { id });
			results = [];
			searched = false;
			await invalidateAll();
			notice = 'Document deleted.';
		});
	}
</script>

{#if problem}<div class="error" role="alert">{problem}</div>{/if}
{#if notice}<div class="knowledge-notice" role="status">{notice}</div>{/if}
<div class="knowledge-upload">
	<label>
		Document title <span class="muted">Optional</span><input
			bind:value={documentTitle}
			placeholder="Use the filename"
			maxlength="200"
		/>
	</label>
	<label class="secondary file-control">
		<Icon name="plus" size={16} />{busy === 'upload' ? 'Uploading…' : 'Upload & index'}<input
			type="file"
			accept=".md,.markdown,.txt"
			onchange={(e) => upload(e)}
			disabled={!!busy}
		/>
	</label>
	<span class="field-hint">
		Markdown or text · Up to 10 MB. Indexing uses your embedding API and may incur charges.
	</span>
</div>
<div class="knowledge-spend">
	Indexing: {indexUsage.length ? money(knownCost) : 'No recorded usage'}{#if unknown}
		+ {unknown} request(s) with unknown cost{/if}
</div>
<div class="knowledge-documents">
	{#each data.documents as document (document.id)}
		<article class="knowledge-document">
			<div class="knowledge-document-heading">
				<div>
					<strong>{document.title}</strong><small>
						{document.filename} · Revision {document.revision}
					</small>
				</div>
				<span
					class="badge"
					class:green={document.status === 'ready' &&
						document.embedding_profile === data.embeddingProfile}
				>
					{document.status === 'ready' && document.embedding_profile !== data.embeddingProfile
						? 'Reindex needed'
						: document.status}
				</span>
			</div>
			<p>
				{document.status === 'indexing'
					? `${document.indexed_chunks} / ${document.chunk_count} sections indexed`
					: document.status === 'ready'
						? `${document.chunk_count} searchable sections · ${document.embedding_model}`
						: document.status === 'pending'
							? 'Waiting for the knowledge worker…'
							: document.error}
			</p>
			<div class="knowledge-document-actions">
				<button
					class="secondary"
					disabled={!!busy || document.status === 'indexing' || document.status === 'pending'}
					onclick={() =>
						run('reindex', async () => {
							await action('reindex', { id: document.id });
							await invalidateAll();
							notice = 'Reindexing queued.';
						})}
				>
					{document.status === 'error' ? 'Retry indexing' : 'Reindex'}
				</button>
				<label class="secondary file-control">
					Replace<input
						type="file"
						accept=".md,.markdown,.txt"
						onchange={(e) => upload(e, document.id)}
						disabled={!!busy || document.status === 'indexing'}
					/>
				</label>
				<button
					class="text-button"
					disabled={!!busy || document.status === 'indexing'}
					onclick={() => remove(document.id, document.title)}
				>
					Delete
				</button>
			</div>
		</article>
	{:else}<div class="knowledge-empty">
			No documents yet. Upload your Markdown file to get started.
		</div>{/each}
</div>
<hr />
<h3>Search preview</h3>
<p>Try a question to check which sections the assistant can find. This uses your embedding API.</p>
<form
	class="knowledge-search"
	onsubmit={(e) => {
		e.preventDefault();
		void run('search', async () => {
			const result = await action('search', { query });
			results = result.sources;
			searched = true;
			notice = result.notice || '';
			await invalidateAll();
		});
	}}
>
	<input
		aria-label="Search knowledge base"
		bind:value={query}
		placeholder="How does onboarding work?"
		maxlength="2000"
		required
	/>
	<button class="primary" disabled={!!busy || !query.trim()}>
		{busy === 'search' ? 'Searching…' : 'Search'}
	</button>
</form>
{#each results as source (source.id)}<details class="knowledge-result">
		<summary>{source.title} · {source.heading}</summary><small>
			{source.filename} · Revision {source.revision}
		</small>
		<pre>{source.content}</pre>
	</details>{:else}{#if searched}<p class="knowledge-empty">
			No relevant sections found. Try a more specific question or check the indexing status.
		</p>{/if}{/each}
