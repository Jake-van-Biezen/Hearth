<script lang="ts">
	import { dev } from '$app/environment';
	import { goto } from '$app/navigation';
	import { pb } from '$lib/pocketbase';

	let email = $state('jakebigsmile@gmail.com');
	let password = $state('');
	let error = $state('');
	let busy = $state(false);

	if (!dev) goto('/', { replaceState: true });

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		busy = true;
		try {
			await pb.collection('users').authWithPassword(email, password);
			await goto('/calendar', { replaceState: true });
		} catch {
			error = "Couldn't sign in. Check the email and password (local dev seed: hearth123).";
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Dev login · Hearth</title></svelte:head>

<main class="page">
	<div class="sheet">
		<span class="marginline" aria-hidden="true"></span>
		<section class="notice">
			<h1 class="fam">Dev login</h1>
			<p class="lead">Local server only — not deployed.</p>
			<form onsubmit={submit}>
				<label>
					<p class="lbl">Email</p>
					<input type="email" bind:value={email} autocomplete="username" />
				</label>
				<label>
					<p class="lbl">Password</p>
					<input type="password" bind:value={password} autocomplete="current-password" />
				</label>
				<button class="pill" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
				{#if error}<p class="err" role="alert">{error}</p>{/if}
			</form>
		</section>
	</div>
</main>

<style>
	.page {
		min-height: 100dvh;
		display: flex;
		justify-content: center;
		background-color: #fbfaf4;
		background-image:
			linear-gradient(rgba(122, 150, 190, 0.16) 1px, transparent 1px),
			linear-gradient(90deg, rgba(122, 150, 190, 0.16) 1px, transparent 1px);
		background-size: 26px 26px;
		color: #22252a;
		font-family: 'Karla Variable', 'Karla', sans-serif;
	}

	.sheet {
		position: relative;
		width: min(480px, 100%);
		min-height: 100dvh;
		padding: calc(28px + env(safe-area-inset-top)) 14px 40px 34px;
	}

	.marginline {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 18px;
		width: 3px;
		background: rgba(208, 80, 64, 0.5);
	}

	.notice {
		padding: clamp(48px, 10dvh, 96px) 14px 0 22px;
	}

	.fam {
		font-family: 'Permanent Marker', cursive;
		font-weight: 400;
		font-size: clamp(2.5rem, 11vw, 3.25rem);
		line-height: 1.1;
		color: #c0392b;
		transform: rotate(-2deg);
		transform-origin: left bottom;
		width: fit-content;
	}

	.lead {
		margin-top: 18px;
		font-size: 16px;
		color: #4c5260;
	}

	.lbl {
		margin: 16px 0 4px;
		font-size: 13px;
		font-weight: 700;
	}

	input {
		width: 100%;
		max-width: 340px;
		height: 44px;
		padding: 0 12px;
		border: 1px solid #c9ccd2;
		border-radius: 4px;
		background: #ffffff;
		font: inherit;
		font-size: 15px;
		color: #22252a;
		box-sizing: border-box;
	}

	input:focus-visible {
		outline: 2px solid #22252a;
		outline-offset: 2px;
	}

	.pill {
		margin-top: 20px;
		height: 44px;
		padding: 0 20px;
		border: none;
		border-radius: 999px;
		background: #22252a;
		color: #fbfaf4;
		font-size: 15px;
		font-weight: 700;
		cursor: pointer;
	}

	.pill:disabled {
		opacity: 0.7;
		cursor: progress;
	}

	.err {
		margin-top: 12px;
		max-width: 340px;
		font-size: 14px;
		line-height: 1.45;
		color: #a03427;
	}
</style>
