<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { Bell, ChevronLeft, ChevronRight, Lock, Plus } from '@lucide/svelte';
	import { pb } from '$lib/pocketbase';
	import EventSheet from '$lib/components/calendar/EventSheet.svelte';
	import UpdatesSheet from '$lib/components/calendar/UpdatesSheet.svelte';
	import {
		forgetPushOnSignOut,
		loadNotifications,
		markAllRead,
		markRead,
		syncPush,
		type FamilyNotification
	} from '$lib/notifications';
	import {
		addDays,
		chipText,
		formatTime,
		formatWeekRange,
		fromDateInput,
		isoWeek,
		loadCalendars,
		loadFamily,
		loadNextUp,
		loadWeekEvents,
		onDay,
		parseDate,
		sameDay,
		sortForDay,
		startOfDay,
		startOfWeek,
		type Calendar,
		type CalendarEvent,
		type Family
	} from '$lib/calendar';

	type Status = 'loading' | 'ready' | 'no-family' | 'offline' | 'error';

	let status: Status = $state('loading');
	let family: Family | null = $state(null);
	let calendars: Calendar[] = $state([]);
	let events: CalendarEvent[] = $state([]);
	let nextUp: CalendarEvent | null = $state(null);
	let weekLoading = $state(false);
	let weekError = $state(false);
	let today = $state(startOfDay(new Date()));
	let weekStart = $state(startOfWeek(new Date()));
	let firstPaint = $state(true);
	let sheet: ReturnType<typeof EventSheet> | undefined = $state();
	let updatesSheet: ReturnType<typeof UpdatesSheet> | undefined = $state();
	let updates: FamilyNotification[] = $state([]);
	let updatesFailed = $state(false);
	/** Event to briefly highlight after jumping to it from an update. */
	let flashId: string | null = $state(null);
	let flashTimer: ReturnType<typeof setTimeout> | undefined;

	const calById = $derived(new Map(calendars.map((c) => [c.id, c])));
	const unread = $derived(updates.filter((n) => !n.readAt).length);
	const isThisWeek = $derived(sameDay(weekStart, startOfWeek(today)));

	const days = $derived(
		Array.from({ length: 7 }, (_, i) => {
			const date = addDays(weekStart, i);
			return {
				date,
				name: date.toLocaleDateString('en-GB', { weekday: 'short' }),
				long: date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }),
				isToday: sameDay(date, today),
				weekend: i >= 5,
				events: events.filter((e) => onDay(e, date)).sort(sortForDay)
			};
		})
	);

	function chipTime(ev: CalendarEvent, day: Date): string {
		if (ev.allDay) return '';
		const start = parseDate(ev.startsAt);
		const end = parseDate(ev.endsAt);
		if (start && sameDay(start, day)) return formatTime(start);
		if (end && sameDay(end, day)) return `until ${formatTime(end)}`;
		return '';
	}

	function nextUpWhen(ev: CalendarEvent): string {
		const start = parseDate(ev.startsAt);
		if (!start) return '';
		if (sameDay(start, today)) return 'Today';
		if (sameDay(start, addDays(today, 1))) return 'Tomorrow';
		return start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
	}

	async function loadWeek() {
		if (!family) return;
		const fid = family.id;
		const ws = weekStart;
		weekLoading = true;
		weekError = false;
		try {
			const [evs, next] = await Promise.all([
				loadWeekEvents(fid, ws),
				loadNextUp(fid, new Date())
			]);
			if (ws !== weekStart) return;
			events = evs;
			nextUp = next;
		} catch (e) {
			// A newer load superseded this one; its own result will land.
			if ((e as { isAbort?: boolean }).isAbort) return;
			if (ws === weekStart) weekError = true;
		} finally {
			if (ws === weekStart) weekLoading = false;
		}
	}

	async function loadUpdates() {
		try {
			updates = await loadNotifications();
			updatesFailed = false;
		} catch (e) {
			if ((e as { isAbort?: boolean }).isAbort) return;
			updatesFailed = true;
		}
	}

	function setLocalRead(ids: Set<string> | null) {
		const now = new Date().toISOString();
		updates = updates.map((n) => (!n.readAt && (!ids || ids.has(n.id)) ? { ...n, readAt: now } : n));
	}

	/**
	 * Follow a link from a push notification: /calendar?day=yyyy-mm-dd&event=id&n=notificationId.
	 * Returns true when it moved the week (caller reloads).
	 */
	function applyLink(params: URLSearchParams): boolean {
		const nid = params.get('n');
		if (nid) {
			markRead(nid).catch(() => {});
			setLocalRead(new Set([nid]));
		}
		const day = fromDateInput(params.get('day') ?? '');
		if (!day) return false;
		jumpTo(day, params.get('event'));
		return true;
	}

	function jumpTo(day: Date, eventId: string | null) {
		firstPaint = false;
		weekStart = startOfWeek(day);
		clearTimeout(flashTimer);
		flashId = eventId;
		if (eventId) flashTimer = setTimeout(() => (flashId = null), 2600);
	}

	async function revealFlash() {
		if (!flashId) return;
		await tick();
		document
			.querySelector(`[data-ev="${CSS.escape(flashId)}"]`)
			?.scrollIntoView({ block: 'center', behavior: 'smooth' });
	}

	async function boot() {
		status = 'loading';
		const uid = pb.authStore.record?.id;
		if (!uid) return goto('/', { replaceState: true });
		try {
			family = await loadFamily(uid);
			if (!family) {
				status = 'no-family';
				return;
			}
			calendars = await loadCalendars(family.id);
			status = 'ready';
			if (page.url.search) {
				applyLink(page.url.searchParams);
				replaceState('/calendar', {});
			}
			await Promise.all([loadWeek(), loadUpdates()]);
			revealFlash();
			subscribe();
			syncPush();
		} catch (e) {
			const code = (e as { status?: number }).status ?? 0;
			if (code === 401) return signOut();
			status = code === 0 ? 'offline' : 'error';
		}
	}

	let unsubscribe: (() => void) | null = null;
	async function subscribe() {
		if (unsubscribe) return;
		try {
			const offEvents = await pb.collection('events').subscribe('*', () => loadWeek());
			const offCals = await pb.collection('calendars').subscribe('*', async () => {
				if (family) calendars = await loadCalendars(family.id);
				loadWeek();
			});
			// The list rule limits this to our own notifications.
			const offUpdates = await pb.collection('notifications').subscribe('*', () => loadUpdates());
			unsubscribe = () => {
				offEvents();
				offCals();
				offUpdates();
			};
		} catch {
			// Live updates are a bonus; the week still loads on navigation.
		}
	}

	function openUpdates() {
		updatesSheet?.open();
		if (!unread) return;
		markAllRead()
			.then(() => setLocalRead(null))
			.catch(() => {});
	}

	async function pickUpdate(n: FamilyNotification) {
		updatesSheet?.close();
		const start = parseDate(n.eventStartsAt);
		if (!start) return;
		jumpTo(start, n.action === 'delete' ? null : n.eventId);
		await loadWeek();
		revealFlash();
	}

	// Tapping a push while Hearth is already open: the service worker hands
	// us the link instead of reloading the page.
	onMount(() => {
		const sw = navigator.serviceWorker;
		if (!sw) return;
		const onMessage = async (e: MessageEvent) => {
			if (e.data?.type !== 'hearth:navigate' || status !== 'ready') return;
			const moved = applyLink(new URL(e.data.url, location.origin).searchParams);
			if (!moved) return;
			await loadWeek();
			revealFlash();
		};
		sw.addEventListener('message', onMessage);
		return () => sw.removeEventListener('message', onMessage);
	});

	function shiftWeek(n: number) {
		firstPaint = false;
		weekStart = addDays(weekStart, n * 7);
		loadWeek();
	}

	function goToday() {
		firstPaint = false;
		today = startOfDay(new Date());
		weekStart = startOfWeek(today);
		loadWeek();
	}

	function openAdd(day?: Date) {
		const target = day ?? (isThisWeek ? today : weekStart);
		sheet?.open(target);
	}

	async function signOut() {
		unsubscribe?.();
		unsubscribe = null;
		if (pb.authStore.isValid) await forgetPushOnSignOut();
		pb.authStore.clear();
		goto('/', { replaceState: true });
	}

	function onVisible() {
		if (document.visibilityState !== 'visible' || status !== 'ready') return;
		const now = startOfDay(new Date());
		if (!sameDay(now, today)) {
			const wasThisWeek = isThisWeek;
			today = now;
			if (wasThisWeek) weekStart = startOfWeek(now);
		}
		loadWeek();
		loadUpdates();
	}

	$effect(() => {
		if (!pb.authStore.isValid) {
			goto('/', { replaceState: true });
			return;
		}
		boot();
	});

	onDestroy(() => {
		unsubscribe?.();
		clearTimeout(flashTimer);
	});
</script>

<svelte:head>
	<title>{family ? `${family.name} · Hearth` : 'Hearth'}</title>
</svelte:head>

<svelte:document onvisibilitychange={onVisible} />

<main class="page">
	<div class="sheet" class:hang={firstPaint}>
		<span class="marginline" aria-hidden="true"></span>

		{#if status === 'no-family'}
			<section class="notice">
				<h1 class="fam">Hearth</h1>
				<p class="lead">You're signed in, but not part of a family yet.</p>
				<p class="body">
					Ask whoever runs the home server to add
					<strong>{pb.authStore.record?.email ?? 'your account'}</strong> to your family in the
					PocketBase admin. Then open Hearth again.
				</p>
				<div class="row">
					<button class="pill" onclick={boot}>Check again</button>
					<button class="link" onclick={signOut}>Sign out</button>
				</div>
			</section>
		{:else if status === 'offline'}
			<section class="notice">
				<h1 class="fam">Hearth</h1>
				<p class="lead">Can't reach the home server.</p>
				<p class="body">
					Hearth lives on the NAS at home. Check you're on the home network or connected over
					Tailscale, then try again.
				</p>
				<div class="row">
					<button class="pill" onclick={boot}>Try again</button>
					<button class="link" onclick={signOut}>Sign out</button>
				</div>
			</section>
		{:else if status === 'error'}
			<section class="notice">
				<h1 class="fam">Hearth</h1>
				<p class="lead">The home server answered, but couldn't load your family.</p>
				<p class="body">
					This usually means the server was updated and needs a restart, or your account changed.
					Try again; if it keeps happening, check the PocketBase logs on the NAS.
				</p>
				<div class="row">
					<button class="pill" onclick={boot}>Try again</button>
					<button class="link" onclick={signOut}>Sign out</button>
				</div>
			</section>
		{:else}
			<header class="top">
				<div class="titlerow">
					<h1 class="fam">{family?.name ?? 'Hearth'}</h1>
					<button
						class="round bell"
						onclick={openUpdates}
						aria-label={unread ? `Updates, ${unread} new` : 'Updates'}
					>
						<Bell size={20} strokeWidth={2.25} />
						{#if unread}
							<span class="badge" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>
						{/if}
					</button>
				</div>
				<div class="bar">
					<p class="range">
						<span class="dates">{formatWeekRange(weekStart)}</span>
						<span class="wk">week {isoWeek(weekStart)}</span>
					</p>
					<nav class="weeknav" aria-label="Change week">
						<button class="round" onclick={() => shiftWeek(-1)} aria-label="Previous week">
							<ChevronLeft size={20} strokeWidth={2.25} />
						</button>
						<button class="pill small" onclick={goToday} disabled={isThisWeek}>Today</button>
						<button class="round" onclick={() => shiftWeek(1)} aria-label="Next week">
							<ChevronRight size={20} strokeWidth={2.25} />
						</button>
					</nav>
				</div>
			</header>

			{#if weekError}
				<p class="banner" role="alert">
					Couldn't load this week from the home server.
					<button class="link" onclick={loadWeek}>Try again</button>
				</p>
			{/if}

			<div class="spread" aria-busy={status === 'loading' || weekLoading}>
				{#each days as day, d (day.date.getTime())}
					<section
						class="box"
						class:today={day.isToday}
						class:weekend={day.weekend}
						aria-labelledby={`day-${d}`}
					>
						<div class="dhead">
							<h2 id={`day-${d}`}>
								<span class="dname">{day.name}</span>
								<span class="dnum">{day.date.getDate()}</span>
								<span class="sr">{day.long}</span>
							</h2>
							<button
								class="addday"
								onclick={() => openAdd(day.date)}
								aria-label={`Add event on ${day.long}`}
								disabled={calendars.length === 0}
							>
								<Plus size={16} strokeWidth={2.5} />
							</button>
						</div>
						{#if day.events.length}
							<ul class="chips">
								{#each day.events as ev, j (ev.id)}
									{@const cal = calById.get(ev.calendar)}
									{@const color = cal?.color ?? '#666b76'}
									{@const time = chipTime(ev, day.date)}
									<li
										class="chip"
										class:allday={ev.allDay}
										class:press={firstPaint}
										class:flash={ev.id === flashId}
										data-ev={ev.id}
										style={ev.allDay
											? `--c:${color}`
											: `--c:${color};background:${color};color:${chipText(color)}`}
										style:--i={d + j}
										title={`${ev.title}${cal ? ` · ${cal.name}` : ''}`}
									>
										<button class="hit" onclick={() => sheet?.edit(ev)}>
											{#if time}<span class="t">{time}</span>{/if}
											<span class="n">{ev.title}</span>
											<span class="sr">, {cal ? `${cal.name}, ` : ''}edit</span>
										</button>
									</li>
								{/each}
							</ul>
						{:else if status === 'ready' && !weekLoading}
							<p class="free">Free</p>
						{/if}
					</section>
				{/each}

				<section class="box next" aria-labelledby="next-h">
					<div class="dhead">
						<h2 id="next-h"><span class="dname">Next up</span></h2>
					</div>
					{#if nextUp}
						{@const cal = calById.get(nextUp.calendar)}
						{@const start = parseDate(nextUp.startsAt)}
						<p class="when">{nextUpWhen(nextUp)}</p>
						<p class="big">{start ? formatTime(start) : ''}</p>
						<p class="what">{nextUp.title}</p>
						{#if cal}
							<p class="which" style={`--c:${cal.color}`}>{cal.name}</p>
						{/if}
					{:else if status === 'ready' && !weekLoading}
						<p class="none">Nothing coming up. Enjoy the quiet.</p>
					{/if}
				</section>
			</div>

			{#if status === 'ready' && calendars.length === 0}
				<p class="banner">
					Your family has no calendars yet. Add one in the PocketBase admin (name and colour), then
					events can go on it.
				</p>
			{/if}

			<footer class="foot">
				{#if calendars.length}
					<ul class="legend" aria-label="Calendars">
						{#each calendars as cal (cal.id)}
							<li style={`--c:${cal.color}`}>
								{cal.name}
								{#if cal.visibility === 'private'}
									<Lock size={12} strokeWidth={2.25} aria-hidden="true" />
									<span class="sr">(only you)</span>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
				<button class="link quiet" onclick={signOut}>Sign out</button>
			</footer>

		{/if}
	</div>

	{#if status === 'ready'}
		<button class="add" onclick={() => openAdd()} disabled={calendars.length === 0}>
			<Plus size={20} strokeWidth={2.5} />
			<span>Add</span>
		</button>
	{/if}
</main>

<EventSheet bind:this={sheet} {calendars} onsaved={loadWeek} />
<UpdatesSheet
	bind:this={updatesSheet}
	items={updates}
	{calendars}
	failed={updatesFailed}
	onretry={loadUpdates}
	onpick={pickUpdate}
/>

<style>
	.page {
		min-height: 100dvh;
		background-color: #fbfaf4;
		background-image:
			linear-gradient(rgba(122, 150, 190, 0.16) 1px, transparent 1px),
			linear-gradient(90deg, rgba(122, 150, 190, 0.16) 1px, transparent 1px);
		background-size: 26px 26px;
		color: #22252a;
		font-family: 'Karla Variable', 'Karla', sans-serif;
		display: flex;
		justify-content: center;
		/* Safety net: nothing inside may widen the page. A wider page drags
		   the fixed Add button and the event sheet off-screen on phones. */
		overflow-x: clip;
	}

	.sheet {
		position: relative;
		width: min(480px, 100%);
		min-height: 100dvh;
		padding: calc(28px + env(safe-area-inset-top)) 14px calc(112px + env(safe-area-inset-bottom))
			34px;
	}

	.sheet.hang {
		animation: hang 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
	}

	@keyframes hang {
		from {
			opacity: 0.94;
			transform: translateY(10px) rotate(0.4deg);
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
		left: 18px;
		width: 3px;
		background: rgba(208, 80, 64, 0.5);
	}

	.sr {
		position: absolute;
		top: 0;
		left: 0;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	/* ---------- header ---------- */

	.top {
		margin-bottom: 14px;
	}

	.titlerow {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}

	.titlerow .fam {
		min-width: 0;
	}

	.bell {
		position: relative;
		flex-shrink: 0;
		margin-top: 2px;
	}

	.badge {
		position: absolute;
		top: -3px;
		right: -7px;
		min-width: 18px;
		height: 18px;
		padding: 0 4px;
		display: grid;
		place-items: center;
		border-radius: 999px;
		border: 2px solid #fbfaf4;
		background: #c0392b;
		color: #ffffff;
		font-size: 11px;
		font-weight: 700;
		line-height: 1;
		font-variant-numeric: tabular-nums;
		box-sizing: content-box;
	}

	/* Wraps the week buttons under the dates on very narrow screens instead
	   of pushing them (and the page) past the right edge. */
	.bar {
		margin-top: 6px;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px 12px;
	}

	.fam {
		font-family: 'Permanent Marker', cursive;
		font-weight: 400;
		font-size: clamp(1.75rem, 8.4vw, 2.25rem);
		line-height: 1.15;
		padding-top: 4px;
		color: #c0392b;
		transform: rotate(-2deg);
		transform-origin: left bottom;
		width: fit-content;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.range {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
		font-size: 14px;
		line-height: 1.3;
		color: #4c5260;
		font-variant-numeric: tabular-nums;
	}

	.range > span {
		white-space: nowrap;
	}

	.wk {
		font-size: 13px;
		color: #666b76;
	}

	.weeknav {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
		margin-left: auto;
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

	.round,
	.pill {
		height: 44px;
		border: 1px solid #c9ccd2;
		background: #ffffff;
		border-radius: 999px;
		box-shadow: 0 1px 2px rgba(34, 37, 42, 0.08);
		font-size: 15px;
		font-weight: 600;
		transition:
			background-color 120ms ease-out,
			transform 90ms ease-out;
	}

	.round {
		width: 44px;
		display: grid;
		place-items: center;
	}

	.pill {
		padding: 0 20px;
	}

	.pill.small {
		padding: 0 14px;
	}

	.round:hover,
	.pill:hover:not(:disabled) {
		background: #f6f2e9;
	}

	.round:active,
	.pill:active:not(:disabled) {
		transform: translateY(1px);
	}

	.pill:disabled {
		color: #666b76;
		box-shadow: none;
		background: transparent;
		cursor: default;
	}

	.link {
		background: none;
		border: none;
		padding: 0 2px;
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 3px;
		text-decoration-thickness: 1px;
		min-height: 44px;
	}

	.link.quiet {
		font-size: 13px;
		font-weight: 400;
		color: #666b76;
	}

	.banner {
		margin: 0 0 12px;
		font-size: 14px;
		line-height: 1.45;
		color: #a03427;
	}

	.banner .link {
		color: #a03427;
		min-height: 0;
	}

	/* ---------- spread ---------- */

	.spread {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}

	@media (min-width: 720px) {
		.sheet {
			width: min(980px, 100%);
			padding-left: 56px;
			padding-right: 28px;
		}

		.marginline {
			left: 34px;
		}

		.spread {
			grid-template-columns: repeat(4, minmax(0, 1fr));
			gap: 10px;
		}
	}

	@media (min-width: 900px) {
		.sheet {
			width: 940px;
			min-height: calc(100dvh - 96px);
			margin: 48px auto;
			padding-top: 36px;
			padding-bottom: 120px;
			background: transparent;
			box-shadow:
				0 1px 2px rgba(34, 37, 42, 0.06),
				0 18px 48px -18px rgba(34, 37, 42, 0.22);
		}
	}

	.box {
		position: relative;
		min-height: 132px;
		padding: 6px 8px 10px;
		border: 1px solid rgba(34, 37, 42, 0.35);
		border-radius: 4px;
		background: rgba(251, 250, 244, 0.88);
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}

	.box.weekend {
		background:
			linear-gradient(rgba(208, 80, 64, 0.07), rgba(208, 80, 64, 0.07)),
			rgba(251, 250, 244, 0.88);
	}

	.box.today {
		border: 2px solid #22252a;
		padding: 5px 7px 9px;
	}

	.dhead {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: 32px;
	}

	.dhead h2 {
		position: relative;
		display: flex;
		align-items: baseline;
		gap: 6px;
		font-weight: 400;
	}

	.dname {
		font-family: 'Permanent Marker', cursive;
		font-size: 15px;
		line-height: 1;
	}

	.dnum {
		font-size: 13px;
		color: #666b76;
		font-variant-numeric: tabular-nums;
	}

	.today .dnum {
		color: #ffffff;
		background: #c0392b;
		font-weight: 700;
		border-radius: 999px;
		padding: 1px 7px;
	}

	.addday {
		position: relative;
		width: 36px;
		height: 36px;
		margin-right: -6px;
		display: grid;
		place-items: center;
		background: none;
		border: none;
		border-radius: 999px;
		color: #666b76;
		transition:
			background-color 120ms ease-out,
			color 120ms ease-out;
	}

	.addday::before {
		content: '';
		position: absolute;
		inset: -4px;
	}

	.addday:hover:not(:disabled) {
		background: #f0ece2;
		color: #22252a;
	}

	.addday:disabled {
		visibility: hidden;
	}

	.chips {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.chip {
		position: relative;
		border-radius: 3px;
		padding: 5px 7px;
		font-size: 13px;
		font-weight: 700;
		line-height: 1.25;
		overflow-wrap: anywhere;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		font-variant-numeric: tabular-nums;
	}

	/* Inline so the chip's line clamp still applies; ::after makes the whole
	   chip the tap target. */
	.chip .hit {
		all: unset;
		display: inline;
		cursor: pointer;
	}

	.chip .hit::after {
		content: '';
		position: absolute;
		inset: 0;
	}

	.chip .hit:hover::after {
		background: rgba(255, 255, 255, 0.12);
	}

	.chip.allday .hit:hover::after {
		background: rgba(34, 37, 42, 0.05);
	}

	.chip:has(.hit:focus-visible) {
		outline: 2px solid #22252a;
		outline-offset: 2px;
	}

	.chip .t {
		font-weight: 500;
		margin-right: 5px;
		opacity: 0.92;
	}

	/* Vertical inset as transparent border: overflow clips at the padding
	   edge, so a clamped third line can't bleed into the chip's inset. */
	.chip:not(.allday) {
		padding-block: 0;
		border-block: 5px solid transparent;
	}

	.chip.allday {
		background: #ffffff;
		color: #22252a;
		border: 1.5px dashed var(--c);
		padding: 3.5px 6px;
	}

	.chip.press {
		animation: press 180ms cubic-bezier(0.22, 1, 0.36, 1) both;
		animation-delay: calc(0.28s + var(--i) * 0.05s);
	}

	@keyframes press {
		from {
			opacity: 0.6;
			transform: scale(0.82);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	/* Jumped here from an update: circle it like a marker would. */
	.chip.flash {
		animation: circled 2400ms cubic-bezier(0.22, 1, 0.36, 1) both;
	}

	@keyframes circled {
		0% {
			outline: 2.5px solid rgba(192, 57, 43, 0);
			outline-offset: 7px;
		}
		18%,
		70% {
			outline: 2.5px solid rgba(192, 57, 43, 1);
			outline-offset: 2px;
		}
		100% {
			outline: 2.5px solid rgba(192, 57, 43, 0);
			outline-offset: 2px;
		}
	}

	.free {
		font-size: 13px;
		color: #666b76;
	}

	/* ---------- next up ---------- */

	.box.next {
		border: 2px solid #22252a;
		background: #ffffff;
		padding: 5px 9px 10px;
		gap: 0;
	}

	.next .dname {
		color: #c0392b;
	}

	.when {
		font-size: 13px;
		font-weight: 700;
		color: #4c5260;
		margin-top: 2px;
	}

	.big {
		font-size: 34px;
		font-weight: 700;
		line-height: 1.05;
		letter-spacing: -0.01em;
		font-variant-numeric: tabular-nums;
		margin-top: 2px;
	}

	.what {
		margin-top: 6px;
		font-size: 15px;
		font-weight: 600;
		line-height: 1.25;
		overflow-wrap: anywhere;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.which,
	.legend li {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		color: #4c5260;
	}

	.which {
		margin-top: auto;
		padding-top: 8px;
	}

	.which::before,
	.legend li::before {
		content: '';
		width: 10px;
		height: 10px;
		border-radius: 3px;
		background: var(--c);
		flex-shrink: 0;
	}

	.none {
		margin-top: 6px;
		font-size: 14px;
		line-height: 1.4;
		color: #4c5260;
	}

	/* ---------- footer + add ---------- */

	.foot {
		margin-top: 16px;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 4px 16px;
	}

	.legend {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
	}

	.add {
		position: fixed;
		right: max(18px, calc((100vw - 940px) / 2 + 28px));
		bottom: calc(24px + env(safe-area-inset-bottom));
		height: 56px;
		padding: 0 24px 0 20px;
		display: flex;
		align-items: center;
		gap: 8px;
		border: none;
		border-radius: 999px;
		background: #22252a;
		color: #fbfaf4;
		font-size: 16px;
		font-weight: 700;
		box-shadow:
			0 1px 2px rgba(34, 37, 42, 0.2),
			0 8px 20px -8px rgba(34, 37, 42, 0.55);
		transition:
			background-color 120ms ease-out,
			transform 90ms ease-out;
		z-index: 5;
	}

	.add:hover:not(:disabled) {
		background: #383c44;
	}

	.add:active:not(:disabled) {
		transform: translateY(1px);
	}

	.add:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* ---------- notices ---------- */

	.notice {
		padding: clamp(72px, 14dvh, 130px) 14px 0 22px;
	}

	.notice .fam {
		font-size: clamp(3rem, 14vw, 3.75rem);
		white-space: normal;
		overflow: visible;
	}

	.lead {
		margin-top: 28px;
		font-size: 20px;
		font-weight: 700;
		line-height: 1.3;
	}

	.body {
		margin-top: 10px;
		font-size: 16px;
		line-height: 1.5;
		color: #4c5260;
		max-width: 38ch;
		overflow-wrap: anywhere;
	}

	.body strong {
		color: #22252a;
	}

	.row {
		margin-top: 28px;
		display: flex;
		align-items: center;
		gap: 18px;
	}

	.sheet :global(::selection) {
		background: rgba(208, 80, 64, 0.25);
	}

	@media (prefers-reduced-motion: reduce) {
		.sheet.hang,
		.chip.press {
			animation: none;
		}

		.chip.flash {
			animation: none;
			outline: 2.5px solid #c0392b;
			outline-offset: 2px;
		}
	}
</style>
