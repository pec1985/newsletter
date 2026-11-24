<script lang="ts">
	import { onMount } from 'svelte';
	import type { ApiKeySummary } from '#lib/api-key.js';
	let keys = $state<ApiKeySummary[]>([]);
	let name = $state('');
	let loading = $state(true);
	let busy = $state('');
	let problem = $state('');
	let newKey = $state('');
	let newKeyId = $state('');
	let copied = $state(false);
	let confirming = $state('');
	async function load() {
		loading = true;
		try {
			const response = await fetch('/api/api-keys');
			const data = await response.json();
			if (!response.ok) throw new Error(data.message || 'Could not load API keys.');
			keys = data.keys;
		} catch (cause) {
			problem = cause instanceof Error ? cause.message : 'Could not load API keys.';
		} finally {
			loading = false;
		}
	}
	onMount(() => {
		void load();
	});
	async function create() {
		if (busy || loading || !name.trim() || newKey) return;
		busy = 'create';
		problem = '';
		try {
			const response = await fetch('/api/api-keys', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name })
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.message || 'Could not create API key.');
			keys = [data.apiKey, ...keys];
			newKey = data.key;
			newKeyId = data.apiKey.id;
			name = '';
			copied = false;
		} catch (cause) {
			problem = cause instanceof Error ? cause.message : 'Could not create API key.';
		} finally {
			busy = '';
		}
	}
	async function copy() {
		try {
			await navigator.clipboard.writeText(newKey);
			copied = true;
		} catch {
			problem = 'Could not copy automatically. Select and copy the key below.';
		}
	}
	async function revoke(id: string) {
		if (busy) return;
		busy = id;
		problem = '';
		try {
			const response = await fetch(`/api/api-keys/${id}`, { method: 'DELETE' });
			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || 'Could not revoke API key.');
			}
			keys = keys.map((key) =>
				key.id === id ? { ...key, revoked_at: new Date().toISOString() } : key
			);
			if (id === newKeyId) {
				newKey = '';
				newKeyId = '';
			}
			confirming = '';
		} catch (cause) {
			problem = cause instanceof Error ? cause.message : 'Could not revoke API key.';
		} finally {
			busy = '';
		}
	}
	const date = (value: string | null) =>
		value
			? new Date(value).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })
			: 'Never';
</script>

<section aria-label="API keys" class="api-keys">
	<h2>API keys</h2>
	<p>Create a named key for each integration. Each key grants access to the contacts API.</p>
	{#if problem}<p class="error" role="alert">{problem}</p>{/if}
	<form
		onsubmit={(event) => {
			event.preventDefault();
			void create();
		}}
	>
		<label>
			Key name<input
				bind:value={name}
				maxlength="100"
				required
				placeholder="e.g. Platform contact sync"
				disabled={loading || !!busy || !!newKey}
			/>
		</label>
		<button class="primary" disabled={loading || !!busy || !!newKey || !name.trim()}>
			{busy === 'create' ? 'Creating…' : 'Create API key'}
		</button>
	</form>
	{#if newKey}
		<div class="new-key" role="status">
			<strong>Copy your new key</strong>
			<p>This is the only time the full key is shown. Store it somewhere secure.</p>
			<input
				aria-label="New API key"
				readonly
				value={newKey}
				onclick={(event) => event.currentTarget.select()}
			/>
			<div class="actions">
				<button type="button" class="secondary" onclick={copy}>
					{copied ? 'Copied' : 'Copy key'}
				</button><button
					type="button"
					class="secondary"
					onclick={() => {
						newKey = '';
						newKeyId = '';
					}}
				>
					Done
				</button>
			</div>
		</div>
	{/if}
	{#if loading}<p role="status">Loading keys…</p>
	{:else if !keys.length}<p class="empty">No API keys yet.</p>
	{:else}<ul>
			{#each keys as key (key.id)}
				<li>
					<div class="key-info">
						<div class="key-title">
							<strong>{key.name}</strong><span class:revoked={!!key.revoked_at} class="badge">
								{key.revoked_at ? 'Revoked' : 'Active'}
							</span>
						</div>
						<code>{key.prefix}…</code>
						<small>Created {date(key.created_at)} · Last used {date(key.last_used_at)}</small>
						{#if key.revoked_at}<small>Revoked {date(key.revoked_at)}</small>{/if}
					</div>
					{#if !key.revoked_at}<div class="revoke-actions">
							{#if confirming === key.id}<p>Revoke this key? Its integration will lose access.</p>
								<div class="actions">
									<button
										type="button"
										class="secondary"
										disabled={!!busy}
										onclick={() => revoke(key.id)}
									>
										{busy === key.id ? 'Revoking…' : 'Revoke key'}
									</button><button
										type="button"
										class="secondary"
										disabled={!!busy}
										onclick={() => (confirming = '')}
									>
										Cancel
									</button>
								</div>
							{:else}<button
									type="button"
									class="secondary"
									disabled={!!busy}
									aria-label={`Revoke ${key.name}`}
									onclick={() => (confirming = key.id)}
								>
									Revoke
								</button>{/if}
						</div>{/if}
				</li>
			{/each}
		</ul>{/if}
</section>

<style>
	h2 {
		font-size: 20px;
		margin: 0 0 10px;
	}
	p {
		font-size: 13px;
		line-height: 1.6;
		color: var(--text-secondary);
	}
	form {
		display: flex;
		gap: 12px;
		align-items: flex-end;
		margin: 24px 0;
		flex-wrap: wrap;
	}
	form label {
		flex: 1;
		min-width: 200px;
		margin: 0;
	}
	form button {
		white-space: nowrap;
	}
	.new-key {
		padding: 18px;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--surface-muted);
		margin: 20px 0;
	}
	.new-key input {
		font-family: monospace;
		width: 100%;
		margin: 12px 0;
	}
	.actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	ul {
		list-style: none;
		padding: 0;
		margin: 24px 0 0;
	}
	li {
		display: flex;
		gap: 16px;
		justify-content: space-between;
		align-items: center;
		padding: 20px 0;
		border-top: 1px solid var(--border);
		flex-wrap: wrap;
	}
	.key-info {
		display: grid;
		gap: 8px;
		min-width: 0;
	}
	.key-title {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}
	strong {
		overflow-wrap: anywhere;
	}
	code {
		font-size: 12px;
		color: var(--text-secondary);
	}
	small {
		font-size: 11px;
		color: var(--text-secondary);
	}
	.badge {
		font-size: 11px;
		background: var(--success-bg);
		color: var(--success-text);
		padding: 3px 7px;
		border-radius: 5px;
	}
	.badge.revoked {
		background: var(--surface-muted);
		color: var(--text-secondary);
	}
	.error {
		padding: 12px;
		background: #fff1f2;
		color: #9f1239;
		border-radius: 8px;
	}
	.revoke-actions p {
		max-width: 220px;
		margin: 0 0 8px;
	}
	.empty {
		padding: 20px 0;
	}
</style>
