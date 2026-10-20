<script lang="ts">
	import { Car, Lock, X } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { pb } from '$lib/pocketbase';
	import { REMINDER_OPTIONS, canRemind, loadReminder, setReminder, type Reminder } from '$lib/reminders';
	import {
		deleteEvent,
		exceptOccurrence,
		saveNewEvent,
		serverOrCachedEvent,
		splitOccurrence,
		updateEvent,
		type SaveResult
	} from '$lib/offline.svelte';
	import {
		amsDateKey,
		addDays,
		daysBetween,
		formatTime,
		fromDateInput,
		parseDate,
		rebaseSeriesAnchor,
		startOfDay,
		toDateInput,
		type Calendar,
		type CalendarEvent
	} from '$lib/calendar';

	let {
		calendars,
		familyId,
		onsaved
	}: {
		calendars: Calendar[];
		familyId: string;
		onsaved: () => void;
	} = $props();

	const LAST_CAL_KEY = 'hearth:last-calendar';

	const REPEATS = [
		{ value: '', label: 'Never' },
		{ value: 'weekly', label: 'Every week' },
		{ value: 'monthly', label: 'Every month' }
	] as const;

	let dialog: HTMLDialogElement | undefined = $state();
	let titleInput: HTMLInputElement | undefined = $state();

	/** Event being edited; null when adding a new one. */
	let editing: CalendarEvent | null = $state(null);
	/** Extra days a multi-day event runs past its start day; kept when editing. */
	let spanDays = $state(0);

	let title = $state('');
	let date = $state('');
	let allDay = $state(false);
	let startTime = $state('09:00');
	let endTime = $state('');
	let calendarId = $state('');
	let repeat = $state('');
	/** Editing one occurrence of a series: "all" touches every repeat, "one" splits the day off. */
	let scope = $state<'one' | 'all'>('all');
	let usesCar = $state(false);
	/** Lead time in minutes (null = no reminder) and the saved row, for this person only. */
	let reminder = $state<number | null>(null);
	let savedReminder = $state<Reminder | null>(null);
	let busy = $state(false);
	let confirmDelete = $state(false);
	let error = $state('');

	const isPrivate = $derived(calendars.find((c) => c.id === calendarId)?.visibility === 'private');
	/** The server only lets an event's creator edit or delete it. */
	const canManage = $derived.by(() => {
		if (!editing) return true;
		return editing.createdBy === pb.authStore.record?.id;
	});

	const endDayLabel = $derived.by(() => {
		if (!spanDays) return '';
		const day = fromDateInput(date);
		if (!day) return '';
		return addDays(day, spanDays).toLocaleDateString('en-GB', {
			weekday: 'long',
			day: 'numeric',
			month: 'long'
		});
	});

	function nextHour(): string {
		const h = Math.min(new Date().getHours() + 1, 23);
		return `${String(h).padStart(2, '0')}:00`;
	}

	function reset() {
		error = '';
		busy = false;
		confirmDelete = false;
	}

	function show() {
		dialog?.showModal();
		queueMicrotask(() => titleInput?.focus());
	}

	export function open(day: Date) {
		reset();
		editing = null;
		spanDays = 0;
		title = '';
		date = toDateInput(day);
		allDay = false;
		repeat = '';
		usesCar = false;
		reminder = null;
		savedReminder = null;
		startTime = nextHour();
		endTime = '';
		const last = localStorage.getItem(LAST_CAL_KEY);
		calendarId = calendars.some((c) => c.id === last) ? (last as string) : (calendars[0]?.id ?? '');
		show();
	}

	export function edit(ev: CalendarEvent) {
		const start = parseDate(ev.startsAt);
		if (!start) return;
		const end = parseDate(ev.endsAt);
		reset();
		editing = ev;
		title = ev.title;
		date = toDateInput(start);
		allDay = ev.allDay;
		repeat = ev.recurrence ?? '';
		scope = 'all';
		usesCar = ev.usesCar ?? false;
		reminder = null;
		savedReminder = null;
		const uid = pb.authStore.record?.id;
		if (uid) {
			loadReminder(uid, ev.id)
				.then((r) => {
					if (editing?.id !== ev.id) return;
					savedReminder = r;
					reminder = r?.minutesBefore ?? null;
				})
				.catch(() => {});
		}
		startTime = ev.allDay ? nextHour() : formatTime(start);
		endTime = end && !ev.allDay ? formatTime(end) : '';
		spanDays = end ? Math.max(0, daysBetween(startOfDay(start), startOfDay(end))) : 0;
		calendarId = ev.calendar;
		show();
	}

	function close() {
		dialog?.close();
	}

	function failMessage(err: unknown, what: string): string {
		const status = (err as { status?: number }).status ?? 0;
		if (status === 0)
			return `Couldn't reach the home server, so nothing was ${what}. Check your connection and try again.`;
		if (status === 404) return 'This event is gone. Someone may have deleted it already.';
		// Car clash or missing end: the server explains who has it and when.
		const data = (err as { response?: { data?: Record<string, { message?: string }> } }).response
			?.data;
		const carMsg = data?.usesCar?.message ?? data?.endsAt?.message;
		if (status === 400 && carMsg) return carMsg;
		return "The home server didn't accept this. Try again, or check you're still in the family.";
	}

	/** Tell the user the change landed (now, or on this phone till the NAS answers). */
	function announce(result: SaveResult, message: string) {
		if (result === 'queued') {
			toast.success(`${message} Saved on this phone; it sends when connection returns.`);
		} else {
			toast.success(message);
		}
	}

	async function remove() {
		if (!editing) return;
		if (!confirmDelete) {
			confirmDelete = true;
			return;
		}
		error = '';
		busy = true;
		try {
			let result: SaveResult = 'sent';
			if (editing.recurrence && scope === 'one') {
				const key = amsDateKey(parseDate(editing.startsAt) ?? new Date());
				// The series skips this day from now on.
				result = await exceptOccurrence(familyId, editing.id, key);
				announce(result, `Removed that day's "${editing.title}".`);
			} else {
				result = await deleteEvent(familyId, editing.id);
				announce(result, `"${editing.title}" deleted.`);
			}
			close();
			onsaved();
		} catch (err) {
			error = failMessage(err, 'deleted');
			confirmDelete = false;
		} finally {
			busy = false;
		}
	}

	/**
	 * Store this person's reminder once the event itself is on the server. New
	 * events have no id client-side, so look up the one we just created.
	 */
	async function syncReminder(result: SaveResult, data: { title: string; startsAt: string; calendar: string; allDay: boolean; recurrence: string }) {
		const uid = pb.authStore.record?.id;
		if (!uid || result !== 'sent' || !canRemind(data)) return;
		if (reminder === (savedReminder?.minutesBefore ?? null)) return;
		try {
			let eventId: string | null = editing && !(editing.recurrence && scope === 'one') ? editing.id : null;
			if (!editing) {
				const found = await pb.collection('events').getList<CalendarEvent>(1, 1, {
					filter: pb.filter('createdBy = {:uid} && title = {:t} && startsAt = {:s} && calendar = {:c}', {
						uid,
						t: data.title,
						s: data.startsAt,
						c: data.calendar
					}),
					sort: '-created'
				});
				eventId = found.items[0]?.id ?? null;
			}
			if (!eventId) {
				if (reminder !== null) toast.error("Couldn't set the reminder; set it again from the event.");
				return;
			}
			await setReminder(uid, eventId, reminder, savedReminder);
		} catch {
			toast.error("Saved the event, but the reminder didn't stick. Try again when you're online.");
		}
	}

	async function save(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		const name = title.trim();
		if (!name) {
			error = 'Give it a name, like "Swim" or "Dentist".';
			return;
		}
		const day = fromDateInput(date);
		if (!day) {
			error = 'Pick a day for it.';
			return;
		}
		let startsAt: Date;
		let endsAt: Date | null = null;
		if (allDay) {
			startsAt = day;
			endsAt = new Date(addDays(day, spanDays + 1).getTime() - 1);
		} else {
			const s = fromDateInput(date, startTime);
			if (!s) {
				error = 'Add a start time, or switch on "All day".';
				return;
			}
			startsAt = s;
			if (!endTime && usesCar) {
				error = 'Add an end time so everyone knows when the car is back.';
				return;
			}
			if (endTime) {
				const en = fromDateInput(toDateInput(addDays(day, spanDays)), endTime);
				if (!en || en <= s) {
					error = 'The end time is before the start. Fix it, or leave the end empty.';
					return;
				}
				endsAt = en;
			}
		}
		if (!calendarId) {
			error = 'Pick which calendar it goes on.';
			return;
		}

		busy = true;
		confirmDelete = false;
		const data = {
			calendar: calendarId,
			title: name,
			startsAt: startsAt.toISOString(),
			endsAt: endsAt ? endsAt.toISOString() : '',
			allDay,
			recurrence: repeat,
			usesCar
		};
		try {
			let result: SaveResult = 'sent';
			if (editing) {
				if (editing.recurrence && scope === 'one') {
					// Split: the series skips this day and a standalone event
					// takes its slot. The op itself merges the exception and
					// creates the split server-side (batched so the family
					// never sees both, or neither, for long).
					const key = amsDateKey(parseDate(editing.startsAt) ?? new Date());
					result = await splitOccurrence(familyId, editing.id, key, {
						...data,
						recurrence: '',
						createdBy: pb.authStore.record?.id ?? ''
					});
				} else if (editing.recurrence) {
					// All repeats: move the series anchor onto the edited day
					// (nearest match to its current rhythm) and apply the
					// edited fields to every occurrence.
					const base = await serverOrCachedEvent(editing.id, familyId);
					if (!base) {
						error = 'This event is gone. Someone may have deleted it already.';
						return;
					}
					const baseStart = parseDate(base.startsAt) ?? new Date();
					const anchor = rebaseSeriesAnchor(baseStart, startsAt, repeat);
					const held = endsAt ? endsAt.getTime() - startsAt.getTime() : 0;
					result = await updateEvent(familyId, editing.id, {
						...data,
						startsAt: anchor.toISOString(),
						endsAt: endsAt ? new Date(anchor.getTime() + held).toISOString() : ''
					});
				} else {
					result = await updateEvent(familyId, editing.id, data);
				}
			} else {
				result = await saveNewEvent(familyId, {
					...data,
					createdBy: pb.authStore.record?.id ?? ''
				});
				localStorage.setItem(LAST_CAL_KEY, calendarId);
			}
			announce(result, `"${name}" saved.`);
			await syncReminder(result, data);
			close();
			onsaved();
		} catch (err) {
			error = failMessage(err, 'saved');
		} finally {
			busy = false;
		}
	}
</script>

<dialog
	bind:this={dialog}
	class="sheet"
	aria-labelledby="add-title"
	onclick={(e) => {
		if (e.target === dialog) close();
	}}
>
	<form onsubmit={save} novalidate>
		<div class="head">
			<h2 id="add-title">
				{#if !editing}New event{:else if canManage}Edit event{:else}Event{/if}
			</h2>
			<button type="button" class="icon" onclick={close} aria-label="Close">
				<X size={20} strokeWidth={2} />
			</button>
		</div>

		{#if editing && !canManage}
			<p class="readonly">Only the person who added this event can change it.</p>
		{/if}

		<fieldset class="fields" disabled={!canManage}>
		<label class="field">
			<span>What</span>
			<input
				bind:this={titleInput}
				bind:value={title}
				type="text"
				maxlength="120"
				placeholder="Swim, dentist, Oma visiting…"
				autocomplete="off"
				enterkeyhint="done"
			/>
		</label>

		<label class="field">
			<span>Day</span>
			<input bind:value={date} type="date" required />
		</label>

		<label class="toggle">
			<input bind:checked={allDay} type="checkbox" role="switch" />
			<span>All day</span>
		</label>

		{#if !allDay}
			<div class="times">
				<label class="field">
					<span>Starts</span>
					<input bind:value={startTime} type="time" required />
				</label>
				<label class="field">
					<span>Ends <em>optional</em></span>
					<input bind:value={endTime} type="time" />
				</label>
			</div>
		{/if}

		{#if endDayLabel}
			<p class="hint">Runs until {endDayLabel}.</p>
		{/if}

		<label class="toggle">
			<input bind:checked={usesCar} type="checkbox" role="switch" />
			<span class="car"><Car size={18} strokeWidth={2} aria-hidden="true" />Needs the car</span>
		</label>

		{#if canRemind({ recurrence: repeat, allDay })}
			<label class="field">
				<span>Remind me</span>
				<select bind:value={reminder}>
					{#each REMINDER_OPTIONS as opt (opt.label)}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			</label>
		{/if}

		{#if editing?.recurrence}
			<fieldset class="cals">
				<legend>Applies to</legend>
				<div class="calrow">
					<label class="rep">
						<input type="radio" name="scope" value="all" bind:group={scope} />
						<span>All events</span>
					</label>
					<label class="rep">
						<input type="radio" name="scope" value="one" bind:group={scope} />
						<span>This event</span>
					</label>
				</div>
				{#if scope === 'one'}
					<p class="hint cals-hint">
						Just this one; the series keeps repeating as before.
					</p>
				{/if}
			</fieldset>
		{/if}

		{#if !(editing && editing.recurrence && scope === 'one')}
			<fieldset class="cals">
				<legend>Repeats</legend>
				<div class="calrow">
					{#each REPEATS as r (r.value)}
						<label class="rep">
							<input type="radio" name="repeat" value={r.value} bind:group={repeat} />
							<span>{r.label}</span>
						</label>
					{/each}
				</div>
			</fieldset>
		{/if}

		<fieldset class="cals">
			<legend>Calendar</legend>
			<div class="calrow">
				{#each calendars as cal (cal.id)}
					<label class="cal" style={`--c:${cal.color}`}>
						<input type="radio" name="calendar" value={cal.id} bind:group={calendarId} />
						<span class="sw" aria-hidden="true"></span>
						<span>{cal.name}</span>
						{#if cal.visibility === 'private'}
							<Lock size={13} strokeWidth={2.25} aria-hidden="true" class="lock" />
						{/if}
					</label>
				{/each}
			</div>
			{#if isPrivate}
				<p class="hint private">Only you can see events on this calendar.</p>
			{/if}
		</fieldset>
		</fieldset>

		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}

		<div class="actions">
			{#if editing && !canManage}
				<button type="button" class="primary" onclick={close}>Close</button>
			{:else}
				{#if editing}
					<button
						type="button"
						class="danger"
						class:armed={confirmDelete}
						onclick={remove}
						disabled={busy}
					>
						{confirmDelete
							? 'Tap again to delete'
							: editing?.recurrence && scope === 'one'
								? 'Delete this one'
								: 'Delete'}
					</button>
				{:else}
					<button type="button" class="ghost" onclick={close}>Cancel</button>
				{/if}
				<button type="submit" class="primary" disabled={busy}>
					{busy ? 'Saving…' : editing ? 'Save changes' : 'Save event'}
				</button>
			{/if}
		</div>
	</form>
</dialog>

<style>
	.sheet {
		inset: auto 0 0 0;
		margin: 0 auto;
		width: 100%;
		max-width: 480px;
		max-height: 92dvh;
		overflow-y: auto;
		overscroll-behavior: contain;
		border: none;
		border-top: 2px solid var(--ink);
		border-radius: 8px 8px 0 0;
		padding: 0;
		background: var(--paper);
		color: var(--ink);
		font-family: 'Karla Variable', 'Karla', sans-serif;
		box-shadow: 0 -18px 48px -18px rgba(34, 37, 42, 0.3);
	}

	.sheet[open] {
		animation: rise 260ms cubic-bezier(0.22, 1, 0.36, 1) both;
	}

	.sheet::backdrop {
		background: var(--rule);
	}

	@media (min-width: 720px) {
		.sheet {
			inset: 0;
			margin: auto;
			height: fit-content;
			border: 2px solid var(--ink);
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

	form {
		padding: 18px 20px calc(20px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 16px;
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

	.icon {
		width: 44px;
		height: 44px;
		margin-right: -10px;
		display: grid;
		place-items: center;
		border: none;
		background: none;
		color: var(--ink-soft);
		border-radius: 999px;
		cursor: pointer;
	}

	.icon:hover {
		background: var(--paper-press);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.field > span,
	legend {
		font-size: 14px;
		font-weight: 600;
		color: var(--ink);
	}

	.field em {
		font-style: normal;
		font-weight: 400;
		color: var(--ink-faint);
		margin-left: 4px;
	}

	input[type='text'],
	input[type='date'],
	input[type='time'] {
		height: 48px;
		padding: 0 14px;
		border: 1px solid var(--ctrl-mute);
		border-radius: 4px;
		background: var(--sheet);
		font: inherit;
		font-size: 17px;
		color: var(--ink);
		font-variant-numeric: tabular-nums;
		width: 100%;
		min-width: 0;
		caret-color: var(--red-display);
	}

	select {
		height: 48px;
		padding: 0 14px;
		border: 1px solid var(--ctrl-mute);
		border-radius: 4px;
		background: var(--sheet);
		font: inherit;
		font-size: 17px;
		color: var(--ink);
		width: 100%;
	}

	input::placeholder {
		color: var(--ink-mute);
	}

	input:focus-visible,
	button:focus-visible,
	.cal:has(input:focus-visible),
	.rep:has(input:focus-visible) {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	.times {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 12px;
	}

	.toggle {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 44px;
		font-size: 16px;
		font-weight: 600;
		cursor: pointer;
		width: fit-content;
	}

	.toggle input {
		appearance: none;
		width: 44px;
		height: 26px;
		border-radius: 999px;
		background: var(--ctrl-border);
		position: relative;
		cursor: pointer;
		transition: background-color 140ms ease-out;
		margin: 0;
	}

	.toggle input::after {
		content: '';
		position: absolute;
		top: 3px;
		left: 3px;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: var(--sheet);
		box-shadow: 0 1px 2px rgba(34, 37, 42, 0.2);
		transition: transform 160ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	.toggle input:checked {
		background: var(--ink);
	}

	.toggle input:checked::after {
		transform: translateX(18px);
	}

	.toggle .car {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.cals {
		border: none;
		padding: 0;
		margin: 0;
	}

	/* Fieldset wrapper keeps every control disabled for view-only access. */
	.fields {
		border: none;
		padding: 0;
		margin: 0;
		min-width: 0;
	}

	.readonly {
		font-size: 14px;
		color: var(--ink-soft);
	}

	legend {
		margin-bottom: 8px;
		padding: 0;
	}

	.calrow {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.cal {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		height: 44px;
		padding: 0 14px 0 12px;
		border: 1px solid var(--ctrl-border);
		border-radius: 999px;
		background: var(--sheet);
		font-size: 15px;
		font-weight: 600;
		cursor: pointer;
		transition: background-color 120ms ease-out;
	}

	/* Repeat options use the same pills minus the colour square. */
	.rep {
		display: inline-flex;
		align-items: center;
		height: 44px;
		padding: 0 14px;
		border: 1px solid var(--ctrl-border);
		border-radius: 999px;
		background: var(--sheet);
		font-size: 15px;
		font-weight: 600;
		cursor: pointer;
		transition: background-color 120ms ease-out;
	}

	.cal input,
	.rep input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.rep:has(input:checked) {
		border: 2px solid var(--ink);
		padding: 0 13px;
		background: var(--paper-raise);
	}

	.cal .sw {
		width: 14px;
		height: 14px;
		border-radius: 3px;
		background: var(--c);
	}

	.cal:has(input:checked) {
		border: 2px solid var(--ink);
		padding: 0 13px 0 11px;
		background: var(--paper-raise);
	}

	.cal :global(.lock) {
		color: var(--ink-soft);
		margin-left: -2px;
	}

	/* In a fieldset there's no form gap to pull into; sit below the pills. */
	.cals .hint {
		margin-top: 8px;
	}

	.error {
		font-size: 14px;
		line-height: 1.45;
		color: var(--err);
	}

	.hint {
		margin-top: -6px;
		font-size: 14px;
		color: var(--ink-soft);
	}

	.danger {
		background: var(--sheet);
		border: 1px solid var(--ctrl-border);
		color: var(--err);
		margin-right: auto;
	}

	.danger:hover:not(:disabled) {
		background: var(--err-tint);
	}

	.danger.armed,
	.danger.armed:hover:not(:disabled) {
		background: var(--err);
		border-color: var(--err);
		color: var(--paper);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
		margin-top: 4px;
	}

	.actions button {
		height: 50px;
		padding: 0 22px;
		border-radius: 999px;
		font: inherit;
		font-size: 15px;
		font-weight: 600;
		cursor: pointer;
		transition:
			background-color 120ms ease-out,
			transform 90ms ease-out;
	}

	.ghost {
		background: var(--sheet);
		border: 1px solid var(--ctrl-border);
		color: var(--ink);
		box-shadow: 0 1px 2px rgba(34, 37, 42, 0.08);
	}

	.ghost:hover {
		background: var(--paper-raise);
	}

	.primary {
		background: var(--ink);
		border: 1px solid var(--ink);
		color: var(--paper);
		flex: 1;
		max-width: 220px;
	}

	.primary:hover:not(:disabled) {
		background: var(--ink-raise);
	}

	.actions button:active:not(:disabled) {
		transform: translateY(1px);
	}

	.primary:disabled {
		opacity: 0.7;
		cursor: progress;
	}
</style>
