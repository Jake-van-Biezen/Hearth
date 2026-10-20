<script lang="ts">
	import { X } from '@lucide/svelte';
	import type { Calendar } from '$lib/calendar';
	import {
		ago,
		describe,
		disablePush,
		enablePush,
		pushState,
		type FamilyNotification,
		type PushState
	} from '$lib/notifications';

	let {
		items,
		calendars,
		failed,
		onretry,
		onpick
	}: {
		items: FamilyNotification[];
		calendars: Calendar[];
		failed: boolean;
		onretry: () => void;
		onpick: (n: FamilyNotification) => void;
	} = $props();

	let dialog: HTMLDialogElement | undefined = $state();
	/** Unread when the sheet opened; stays highlighted while it's open. */
	let fresh = $state(new Set<string>());
	let push: PushState | 'checking' = $state('checking');
	let pushBusy = $state(false);
	let pushError = $state('');
	let now = $state(new Date());

	const colorOf = $derived(new Map(calendars.map((c) => [c.id, c.color])));

	export function open() {
		fresh = new Set(items.filter((n) => !n.readAt).map((n) => n.id));
		now = new Date();
		pushError = '';
		dialog?.showModal();
		pushState()
			.then((s) => (push = s))
			.catch(() => (push = 'unsupported'));
	}

	export function close() {
		dialog?.close();
	}

	async function turnOn() {
		pushBusy = true;
		pushError = '';
		try {
			push = await enablePush();
			if (push === 'off') pushError = 'Notifications stay off until you allow them.';
		} catch (err) {
			// PocketBase errors carry a status; anything else came from the browser's push service.
			pushError =
				typeof (err as { status?: unknown }).status === 'number'
					? "Couldn't reach the home server. Check your connection and try again."
					: "This browser couldn't set up notifications. Private windows can't get them; try the Hearth app on your Home Screen.";
		} finally {
			pushBusy = false;
		}
	}

	async function turnOff() {
		pushBusy = true;
		pushError = '';
		try {
			push = await disablePush();
		} catch {
			pushError = "Couldn't reach the home server, so notifications are still on.";
		} finally {
			pushBusy = false;
		}
	}
</script>

<dialog
	bind:this={dialog}
	class="sheet"
	aria-labelledby="updates-title"
	onclick={(e) => {
		if (e.target === dialog) close();
	}}
>
	<div class="inner">
		<div class="head">
			<h2 id="updates-title">Updates</h2>
			<button type="button" class="icon" onclick={close} aria-label="Close">
				<X size={20} strokeWidth={2} />
			</button>
		</div>

		{#if push === 'off'}
			<div class="ask">
				<p>Get a notification on this device when someone adds, changes or removes an event.</p>
				<button type="button" class="primary" onclick={turnOn} disabled={pushBusy}>
					{pushBusy ? 'Turning on…' : 'Turn on notifications'}
				</button>
			</div>
		{:else if push === 'needs-install'}
			<p class="note">
				To get notifications on iPhone or iPad, add Hearth to your Home Screen: tap
				<strong>Share</strong>, then <strong>Add to Home Screen</strong>, and open it from there.
			</p>
		{:else if push === 'blocked'}
			<p class="note">
				Notifications are blocked for Hearth. Allow them in your browser or phone settings to get
				them on this device.
			</p>
		{/if}
		{#if pushError}
			<p class="error" role="alert">{pushError}</p>
		{/if}

		{#if failed}
			<p class="error" role="alert">
				Couldn't load updates from the home server.
				<button type="button" class="link" onclick={onretry}>Try again</button>
			</p>
		{:else if items.length === 0}
			<p class="empty">
				Nothing yet. When someone in the family adds, changes or removes an event, it shows up here.
			</p>
		{:else}
			<ul class="list">
				{#each items as n (n.id)}
					{@const text = describe(n)}
					{@const isNew = fresh.has(n.id)}
					<li>
						<button
							type="button"
							class="item"
							class:new={isNew}
							class:gone={n.action === 'delete'}
							style={`--c:${colorOf.get(n.calendar) ?? '#666b76'}`}
							onclick={() => onpick(n)}
						>
							<span class="sw" aria-hidden="true"></span>
							<span class="txt">
								<span class="t">{#if isNew}<span class="sr">New: </span>{/if}{text.title}</span>
								<span class="m">
									{#if text.body}<span>{text.body}</span>{/if}
									<span class="ago">{ago(n.created, now)}</span>
								</span>
							</span>
							{#if isNew}<span class="dot" aria-hidden="true"></span>{/if}
						</button>
					</li>
				{/each}
			</ul>
		{/if}

		{#if push === 'on'}
			<p class="foot">
				Notifications are on for this device.
				<button type="button" class="link" onclick={turnOff} disabled={pushBusy}>Turn off</button>
			</p>
		{/if}
	</div>
</dialog>

<style>
	.sheet {
		inset: auto 0 0 0;
		margin: 0 auto;
		width: 100%;
		max-width: 480px;
		max-height: 88dvh;
		overflow-y: auto;
		overscroll-behavior: contain;
		border: none;
		border-top: 2px solid #22252a;
		border-radius: 8px 8px 0 0;
		padding: 0;
		background: #fbfaf4;
		color: #22252a;
		font-family: 'Karla Variable', 'Karla', sans-serif;
		box-shadow: 0 -18px 48px -18px rgba(34, 37, 42, 0.3);
	}

	.sheet[open] {
		animation: rise 260ms cubic-bezier(0.22, 1, 0.36, 1) both;
	}

	.sheet::backdrop {
		background: rgba(34, 37, 42, 0.35);
	}

	@media (min-width: 720px) {
		.sheet {
			inset: 0;
			margin: auto;
			height: fit-content;
			border: 2px solid #22252a;
			border-radius: 8px;
		}
	}

	@keyframes rise {
		from {
			transform: translateY(24px);
			opacity: 0.6;
		}
		to {
			transform: none;
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.sheet[open] {
			animation: none;
		}
	}

	.inner {
		padding: 18px 20px calc(20px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	h2 {
		font-size: 20px;
		font-weight: 700;
	}

	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	button {
		font: inherit;
		color: inherit;
		cursor: pointer;
	}

	button:focus-visible {
		outline: 2px solid #22252a;
		outline-offset: 2px;
	}

	.icon {
		width: 44px;
		height: 44px;
		margin-right: -10px;
		display: grid;
		place-items: center;
		border: none;
		background: none;
		color: #4c5260;
		border-radius: 999px;
	}

	.icon:hover {
		background: #f0ece2;
	}

	/* ---------- push prompt ---------- */

	.ask {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
		padding: 14px;
		border: 1px solid rgba(34, 37, 42, 0.35);
		border-radius: 4px;
		background: #ffffff;
	}

	.ask p,
	.note,
	.empty {
		font-size: 15px;
		line-height: 1.45;
		color: #4c5260;
		max-width: 52ch;
	}

	.note strong {
		color: #22252a;
	}

	.primary {
		height: 44px;
		padding: 0 20px;
		border-radius: 999px;
		border: 1px solid #22252a;
		background: #22252a;
		color: #fbfaf4;
		font-size: 15px;
		font-weight: 600;
		transition:
			background-color 120ms ease-out,
			transform 90ms ease-out;
	}

	.primary:hover:not(:disabled) {
		background: #383c44;
	}

	.primary:active:not(:disabled) {
		transform: translateY(1px);
	}

	.primary:disabled {
		opacity: 0.7;
		cursor: progress;
	}

	.error {
		font-size: 14px;
		line-height: 1.45;
		color: #a03427;
	}

	.link {
		background: none;
		border: none;
		padding: 0 2px;
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 3px;
		text-decoration-thickness: 1px;
		color: inherit;
	}

	/* ---------- list ---------- */

	.list {
		list-style: none;
		margin: 0 -8px;
		padding: 0;
		display: flex;
		flex-direction: column;
	}

	.item {
		width: 100%;
		min-height: 56px;
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 10px 8px;
		border: none;
		border-radius: 4px;
		background: none;
		text-align: left;
		transition: background-color 120ms ease-out;
	}

	.list li + li .item {
		border-top: 1px solid rgba(34, 37, 42, 0.12);
		border-radius: 0;
	}

	.item:hover {
		background: #f6f2e9;
	}

	.sw {
		flex-shrink: 0;
		width: 12px;
		height: 12px;
		margin-top: 4px;
		border-radius: 3px;
		background: var(--c);
	}

	.gone .sw {
		background: none;
		border: 1.5px dashed var(--c);
	}

	.txt {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.t {
		font-size: 15px;
		font-weight: 500;
		line-height: 1.3;
		overflow-wrap: anywhere;
	}

	.new .t {
		font-weight: 700;
	}

	.m {
		display: flex;
		flex-wrap: wrap;
		gap: 0 8px;
		font-size: 13px;
		line-height: 1.45;
		color: #4c5260;
		font-variant-numeric: tabular-nums;
	}

	.ago {
		color: #666b76;
	}

	.dot {
		flex-shrink: 0;
		width: 9px;
		height: 9px;
		margin-top: 5px;
		border-radius: 50%;
		background: #c0392b;
	}

	.foot {
		font-size: 13px;
		color: #666b76;
	}

	.foot .link {
		font-weight: 400;
		min-height: 44px;
	}
</style>
