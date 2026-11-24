<script lang="ts">
	import Icon from '#lib/Icon.svelte';
	let { form } = $props();
</script>

<div class="login-page">
	<div class="login-story">
		<div class="brand">postscript<span>✳</span></div>
		<div>
			<span class="eyebrow">A LITTLE MORE PERSONAL</span>
			<h1>Good stories.<br />Better connections.</h1>
			<p>A thoughtful home for your next newsletter.<br />From a small idea to every inbox.</p>
			<div class="story-note">
				<Icon name="mail" size={30} /><span>Made for words worth opening.</span>
			</div>
		</div>
		<span class="muted">YOUR NEWSLETTER, WITH A LITTLE HELP FROM AI.</span>
	</div>
	<div class="login-form">
		<div class="login-card">
			<span class="eyebrow">WELCOME BACK</span>
			<h2>Make yourself at home.</h2>
			<p>Sign in to your newsletter workspace.</p>
			<form method="POST">
				<label>
					Username<input
						name="username"
						autocomplete="username"
						placeholder="Your username"
						required
					/>
				</label><label>
					Password<input
						name="password"
						type="password"
						autocomplete="current-password"
						placeholder="Your password"
						required
					/>
				</label>{#if form?.error}<div class="error" role="alert">{form.error}</div>{/if}<button
					class="primary full"
				>
					Sign in <Icon name="chevron" size={16} />
				</button>
			</form>
			<div class="local-note">
				<span class="status-dot"></span> Local workspace <span>·</span> admin / admin
			</div>
		</div>
	</div>
</div>
