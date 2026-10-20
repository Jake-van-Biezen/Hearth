<script lang="ts">
	import { goto } from '$app/navigation';
	import { pb } from '$lib/pocketbase';
	import ThemeToggle from '$lib/components/theme/ThemeToggle.svelte';

	let authed = $state(false);
	let busy = $state(false);
	let error = $state('');

	$effect(() => {
		authed = pb.authStore.isValid;
		if (authed) goto('/calendar', { replaceState: true });
	});

	async function signInWithGoogle() {
		error = '';
		busy = true;
		try {
			await pb.collection('users').authWithOAuth2({ provider: 'google', createData: {} });
			authed = pb.authStore.isValid;
			if (authed) await goto('/calendar', { replaceState: true });
		} catch (e) {
			const status = (e as { status?: number }).status ?? 0;
			error =
				status === 0
					? "Couldn't reach Google sign-in through the home server. Check your connection, then try again."
					: "Google sign-in isn't set up on the home server yet. Add the Google OAuth client ID and secret in the PocketBase admin, then try again.";
		} finally {
			busy = false;
		}
	}

	const week = [
		{ name: 'Mon', chip: null },
		{ name: 'Tue', chip: { label: 'Swim', color: '#3b78c4', text: '#f2f6fb' } },
		{ name: 'Wed', chip: null },
		{ name: 'Thu', chip: { label: 'Dent.', color: '#3b9e6b', text: '#f0f7f2' } },
		{ name: 'Fri', chip: null },
		{ name: 'Sat', chip: { label: 'Oma', color: '#d9b12e', text: '#3a2f10' } },
		{ name: 'Sun', chip: null }
	];
</script>

<main class="gate">
	<div class="sheet">
		<span class="marginline" aria-hidden="true"></span>

		<div class="theme">
			<ThemeToggle />
		</div>

		<header class="brand">
			<h1>Hearth</h1>
			<p class="tagline">The family's day, on one wall.</p>
		</header>

		<section class="week" aria-label="This is what a week on the family planner looks like">
			{#each week as day, i (day.name)}
				<div class="day" class:weekend={day.name === 'Sun'}>
					<span class="lbl">{day.name}</span>
					{#if day.chip}
						<span class="chip enter" style={'background:' + day.chip.color + ';color:' + day.chip.text + ';--i:' + i}>
							{day.chip.label}
						</span>
					{/if}
				</div>
			{/each}
		</section>

		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}

		{#if authed}
			<p class="signedin">You're in. Opening the family's week…</p>
		{:else}
			<button class="gbtn" onclick={signInWithGoogle} disabled={busy}>
				<svg viewBox="0 0 48 48" aria-hidden="true">
					<path fill="#EA4335" d="M24 9.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 3.18 29.93 1 24 1 14.4 1 6.04 6.93 2.42 15.12l9.27 5.7C13.42 15.62 18.15 9.75 24 9.75z" />
					<path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
					<path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H2.42C.88 17.09 0 20.45 0 24s.88 6.91 2.42 9.88l9.27-5.7z" />
					<path fill="#34A853" d="M24 47c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H2.42v5.7C6.04 41.07 14.4 47 24 47z" />
				</svg>
				<span>{busy ? 'Opening Google…' : 'Continue with Google'}</span>
			</button>
		{/if}

		<p class="note">Runs on our own home server &mdash; shared with nobody.</p>

		<p class="homefoot">Hang it on the wall, carry it in your pocket.</p>
	</div>
</main>

<style>
	.gate {
		min-height: 100dvh;
		background-color: var(--planner-paper, var(--paper));
		background-image:
			linear-gradient(var(--lattice) 1px, transparent 1px),
			linear-gradient(90deg, var(--lattice) 1px, transparent 1px);
		background-size: 26px 26px;
		color: var(--ink);
		font-family: 'Karla Variable', 'Karla', sans-serif;
		display: flex;
		justify-content: center;
	}

	.sheet {
		position: relative;
		width: min(480px, 100%);
		min-height: 100dvh;
		padding: clamp(96px, 17dvh, 150px) 28px clamp(28px, 6dvh, 48px) 56px;
		animation: hang 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
	}

	@media (min-width: 900px) {
		.sheet {
			width: 480px;
			min-height: calc(100dvh - 96px);
			margin: 48px auto;
			box-shadow:
				0 1px 2px rgba(34, 37, 42, 0.06),
				0 18px 48px -18px var(--rule-dim);
		}
	}

	@keyframes hang {
		from {
			opacity: 0.94;
			transform: translateY(10px) rotate(0.6deg);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	.marginline {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 34px;
		width: 3px;
		background: var(--margin);
	}

	.theme {
		position: absolute;
		top: 20px;
		right: 20px;
		z-index: 1;
	}

	.brand h1 {
		font-family: 'Permanent Marker', cursive;
		font-size: clamp(3.5rem, 16dvw, 4.25rem);
		line-height: 1;
		color: var(--red-display);
		transform: rotate(-2deg);
		transform-origin: left bottom;
		width: fit-content;
	}

	.tagline {
		margin-top: 14px;
		font-size: 17px;
		color: var(--ink-soft);
	}

	.week {
		margin-top: clamp(40px, 9dvh, 78px);
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		border: 2px solid var(--ink);
		border-radius: 4px;
		height: 150px;
	}

	.day {
		position: relative;
		border-right: 1px solid var(--rule);
	}

	.day:last-child {
		border-right: none;
		background: var(--weekend);
	}

	.lbl {
		position: absolute;
		top: 10px;
		width: 100%;
		text-align: center;
		font-family: 'Permanent Marker', cursive;
		font-size: 13px;
		color: var(--ink);
	}

	.chip {
		position: absolute;
		top: 38px;
		left: 16%;
		right: 12%;
		height: 30px;
		border-radius: 3px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.01em;
		white-space: nowrap;
		overflow: hidden;
		animation: press 160ms cubic-bezier(0.22, 1, 0.36, 1) both;
		animation-delay: calc(0.32s + var(--i) * 0.09s);
	}

	@keyframes press {
		from {
			opacity: 0.65;
			transform: scale(0.7);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.sheet {
			animation: none;
		}
		.chip {
			animation: none;
		}
	}

	.gbtn {
		margin-top: clamp(44px, 10dvh, 72px);
		width: min(300px, 100%);
		padding: 15px 24px;
		border-radius: 999px;
		background: var(--sheet);
		border: 1px solid var(--ctrl-border);
		box-shadow: 0 1px 2px rgba(34, 37, 42, 0.08);
		font-family: inherit;
		font-size: 15px;
		font-weight: 600;
		color: var(--ink);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		cursor: pointer;
		transition: background-color 120ms ease-out, transform 90ms ease-out;
	}

	.gbtn svg {
		width: 20px;
		height: 20px;
		display: block;
		border-radius: 50%;
	}

	.gbtn:hover:not(:disabled) {
		background: var(--paper-raise);
	}

	.gbtn:active:not(:disabled) {
		transform: translateY(1px);
	}

	.gbtn:disabled {
		cursor: progress;
		opacity: 0.7;
	}

	.gbtn:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	.error {
		margin-top: 18px;
		font-size: 14px;
		line-height: 1.45;
		color: var(--err);
		max-width: 340px;
	}

	.signedin {
		margin-top: clamp(44px, 10dvh, 72px);
		font-size: 15px;
		color: var(--ink-soft);
	}

	.note {
		margin-top: clamp(24px, 6dvh, 42px);
		font-size: 13px;
		color: var(--ink-faint);
	}

	.homefoot {
		margin-top: 12px;
		text-align: left;
		font-size: 13.5px;
		color: var(--ink-faint);
	}

	.sheet ::selection {
		background: rgba(208, 80, 64, 0.25);
	}
</style>
