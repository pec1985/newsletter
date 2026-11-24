<script lang="ts">
	let {
		service,
		label,
		config,
		disabled = false
	}: {
		service: string;
		label: string;
		config: Record<string, string>;
		disabled?: boolean;
	} = $props();
	let pending = $state(false);
	let result = $state<{ status: string; message: string } | null>(null);
	let checkedValues = $state('');
	const currentValues = $derived(JSON.stringify(config));
	async function validate() {
		if (pending || disabled) return;
		pending = true;
		result = null;
		const snapshot = currentValues;
		try {
			const response = await fetch('/api/validate-service', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ service, config: JSON.parse(snapshot) }),
				signal: AbortSignal.timeout(20000)
			});
			const data = await response.json();
			result = response.ok
				? data
				: { status: 'error', message: data.message || 'Could not validate the connection.' };
		} catch {
			result = { status: 'error', message: 'The check could not finish. Try again.' };
		} finally {
			checkedValues = snapshot;
			pending = false;
		}
	}
</script>

<div class="service-validation">
	<button type="button" class="secondary" onclick={validate} disabled={disabled || pending}>
		{pending ? 'Validating…' : `Validate ${label}`}
	</button>
	<small>Checks the current values without saving changes.</small>
	{#if result && checkedValues === currentValues}<p
			role="status"
			class:error={result.status === 'error'}
			class:warning={result.status === 'warning'}
			class:success={result.status === 'success'}
		>
			{result.message}
		</p>{/if}
</div>

<style>
	.service-validation {
		margin: 20px 0;
	}
	small {
		display: block;
		margin-top: 8px;
		font-size: 12px;
		color: var(--text-secondary);
	}
	p {
		margin: 12px 0 0;
		padding: 12px;
		border-radius: 8px;
		font-size: 13px;
		line-height: 1.5;
	}
	.success {
		background: var(--success-bg);
		color: var(--success-text);
	}
	.warning {
		background: var(--warning-bg);
		color: var(--warning-text);
	}
	.error {
		background: #fff1f2;
		color: #9f1239;
	}
</style>
