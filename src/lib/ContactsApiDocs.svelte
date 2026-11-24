<script lang="ts">
	import Icon from './Icon.svelte';
	import { endpoints, contactsApiMarkdown } from '#lib/contacts-api-docs.js';
	let copied = $state(false);
	let copyError = $state('');
	let fallback = $state('');
	async function copyForLlm() {
		copied = false;
		copyError = '';
		const markdown = contactsApiMarkdown(window.location.origin);
		try {
			await navigator.clipboard.writeText(markdown);
			copied = true;
			fallback = '';
		} catch {
			copyError = 'Clipboard access is unavailable. Select and copy the Markdown below.';
			fallback = markdown;
		}
	}
</script>

<section class="api-docs" aria-label="Contacts API documentation">
	<div class="docs-heading">
		<h2>API documentation</h2>
		<button type="button" class="secondary" onclick={copyForLlm}>Copy for LLM</button>
	</div>
	{#if copied}<p role="status">Full Markdown documentation copied.</p>{/if}
	{#if copyError}<p role="alert">{copyError}</p>
		<textarea
			aria-label="Full API documentation in Markdown"
			readonly
			rows="12"
			value={fallback}
			onclick={(event) => event.currentTarget.select()}></textarea>{/if}
	<p>
		Choose an endpoint to see its request and response. Use your app’s base URL and replace <code>
			YOUR_API_KEY
		</code>
		with a key from <a href="/settings/api-keys">API keys</a>.
	</p>
	<div class="endpoints">
		{#each endpoints as endpoint (`${endpoint.method}:${endpoint.path}`)}
			<details>
				<summary>
					<span class="method" data-method={endpoint.method}>{endpoint.method}</span>
					<span class="endpoint-label">
						<code>{endpoint.path}</code><span>{endpoint.title}</span>
					</span>
					<span class="chevron" aria-hidden="true"><Icon name="chevron" size={16} /></span>
				</summary>
				<div class="endpoint-content">
					<p>{endpoint.note}</p>
					{#each endpoint.examples as example (example.title)}
						<h4>{example.title}</h4>
						<div class="example-grid">
							<div class="example">
								<h5>Request</h5>
								<pre><code>{example.request}</code></pre>
							</div>
							<div class="example">
								<h5>Response <span>{endpoint.status}</span></h5>
								<pre><code>{example.response}</code></pre>
							</div>
						</div>
					{/each}
					<p class="errors">{endpoint.errors}</p>
				</div>
			</details>
		{/each}
	</div>
	<p class="footnote">
		All endpoints require authentication (401 for a missing or invalid key). Errors return a JSON
		object with a <code>message</code> field. Email matching ignores case and surrounding spaces.
	</p>
</section>

<style>
	.docs-heading {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 16px;
		flex-wrap: wrap;
		margin-bottom: 12px;
	}
	.docs-heading button {
		white-space: nowrap;
	}
	textarea {
		width: 100%;
		font: 12px/1.5 monospace;
	}
	a {
		color: var(--accent);
		text-decoration: underline;
	}
	.api-docs {
		margin-top: 0;
		min-width: 0;
	}
	h2 {
		font-size: 20px;
		margin: 0 0 10px;
	}
	p {
		font-size: 13px;
		line-height: 1.6;
		color: var(--text-secondary);
	}
	.endpoints {
		margin-top: 20px;
		border: 1px solid var(--border);
		border-radius: 10px;
		overflow: hidden;
	}
	details + details {
		border-top: 1px solid var(--border);
	}
	summary {
		list-style: none;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px;
		cursor: pointer;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary:hover {
		background: var(--surface-muted);
	}
	summary:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -3px;
	}
	.method {
		min-width: 58px;
		text-align: center;
		font: 600 11px monospace;
		padding: 5px 6px;
		border-radius: 5px;
		background: var(--accent-tint);
		color: var(--accent);
	}
	.method[data-method='GET'] {
		background: var(--success-bg);
		color: var(--success-text);
	}
	.method[data-method='DELETE'] {
		background: #fff1f2;
		color: #9f1239;
	}
	.endpoint-label {
		display: grid;
		gap: 5px;
		min-width: 0;
	}
	.endpoint-label code {
		font-size: 12px;
		overflow-wrap: anywhere;
	}
	.endpoint-label span {
		font-size: 12px;
		color: var(--text-secondary);
	}
	.chevron {
		margin-left: auto;
		font-size: 22px;
		transition: transform 0.15s;
	}
	details[open] .chevron {
		transform: rotate(90deg);
	}
	.endpoint-content {
		padding: 0 16px 16px;
	}
	h4 {
		margin: 20px 0 10px;
		font-size: 13px;
	}
	.example-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}
	.example {
		min-width: 0;
		border: 1px solid var(--border);
		border-radius: 8px;
		overflow: hidden;
	}
	h5 {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		justify-content: space-between;
		margin: 0;
		padding: 10px 12px;
		font-size: 12px;
		background: var(--surface-muted);
		border-bottom: 1px solid var(--border);
	}
	h5 span {
		font-weight: 400;
		color: var(--text-secondary);
	}
	pre {
		margin: 0;
		padding: 12px;
		border: 0;
		border-radius: 0;
		font: 11px/1.6 monospace;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		background: var(--surface);
		color: var(--text);
	}
	.errors,
	.footnote {
		margin-top: 16px;
		font-size: 12px;
	}
	@media (max-width: 900px) {
		.example-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
