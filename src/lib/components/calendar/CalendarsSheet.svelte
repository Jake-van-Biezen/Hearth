<script lang="ts">
	import { ChevronLeft, Lock, Plus, X } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { pb } from '$lib/pocketbase';
	import { isNetError, noteOffline } from '$lib/offline.svelte';
	import type { Calendar } from '$lib/calendar';

	let {
		calendars,
		familyId,
		onchanged
	}: {
		calendars: Calendar[];
		familyId: string;
		onchanged: () => void;
	} = $props();

	// Same marked set the server uses when it hands out personal calendars.
	const COLORS = ['#3b78c4', '#3b9e6b', '#d9b12e', '#c0392b', '#8e5bb5', '#e07b39', '#2a9d9a', '#c2577f'];

	let dialog: HTMLDialogElement | undefined = $state();
	let nameInput: HTMLInputElement | undefined = $state();

	/** "list": calendars overview · "form": add or edit one. */
	let mode: 'list' | 'form' = $state('list');
	/** Null in the form means adding a new shared calendar. */
	let editing: Calendar | null = $state(null);
	let name = $state('');
	let color = $state(COLORS[0]);

	let busy = $state(false);
	let confirmDelete = $state(false);
	let error = $state('');
	/** Events on the calendar being edited; null when unknown or not fetched. */
	let eventCount: number | null = $state(null);

	/** The server lets only the calendar's owner change or remove it. */
	const canManage = $derived.by(() => {
		if (!editing) return true;
		return editing.owner === (pb.authStore.record?.id ?? '');
	});
	const shared = $derived.by(() => {
		if (!editing) return false;
		return editing.visibility === 'family';
	});

	function reset() {
		busy = false;
		confirmDelete = false;
		error = '';
	}

	function show() {
		dialog?.showModal();
	}

	export function open() {
		reset();
		mode = 'list';
		editing = null;
		show();
	}

	export function close() {
		dialog?.close();
	}

	function backToList() {
		mode = 'list';
		editing = null;
		reset();
	}

	function startAdd() {
		error = '';
		editing = null;
		name = '';
		// Steer clear of colours already in use; the family's calendar set is small.
		const used = new Set(calendars.map((c) => c.color.toLowerCase()));
		color = COLORS.find((c) => !used.has(c.toLowerCase())) ?? COLORS[0];
		eventCount = 0;
		mode = 'form';
		queueMicrotask(() => nameInput?.focus());
	}

	function startEdit(cal: Calendar) {
		error = '';
		editing = cal;
		name = cal.name;
		color = cal.color;
		confirmDelete = false;
		eventCount = null;
		mode = 'form';
		queueMicrotask(() => nameInput?.focus());
		if (cal.visibility === 'family') countEvents(cal.id);
	}

	async function countEvents(id: string) {
		try {
			const r = await pb.collection('events').getList(1, 1, {
				filter: pb.filter('calendar = {:id}', { id }),
				requestKey: 'hearth-cal-count'
			});
			eventCount = r.totalItems;
		} catch (err) {
			// A count is honesty nicety only; the delete still warns about events.
			if (isNetError(err)) noteOffline();
		}
	}

	function failMessage(err: unknown): string {
		const status = (err as { status?: number }).status ?? 0;
		if (status === 0)
			return "Couldn't reach the home server, so nothing was changed. Check your connection and try again.";
		if (status === 404)
			return 'This calendar is gone. Maybe someone in the family already removed it.';
		return "The home server didn't accept this. Try again, or check you're still in the family.";
	}

	async function save(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		if (!canManage) return;
		const clean = name.trim();
		if (!clean) {
			error = 'Give it a name, like "School" or "Holidays".';
			return;
		}
		busy = true;
		try {
			if (editing) {
				await pb.collection('calendars').update(editing.id, { name: clean, color });
				toast.success(`"${clean}" saved.`);
			} else {
				await pb.collection('calendars').create({
					family: familyId,
					owner: pb.authStore.record?.id ?? '',
					name: clean,
					color,
					visibility: 'family'
				});
				toast.success(`"${clean}" added. Everyone can see it.`);
			}
			close();
			onchanged();
		} catch (err) {
			error = failMessage(err);
		} finally {
			busy = false;
		}
	}

	async function remove() {
		if (!editing || !canManage) return;
		if (!confirmDelete) {
			confirmDelete = true;
			return;
		}
		error = '';
		busy = true;
		try {
			await pb.collection('calendars').delete(editing.id);
			toast.success(`Removed "${editing.name}" and its events.`);
			close();
			onchanged();
		} catch (err) {
			error = failMessage(err);
			confirmDelete = false;
		} finally {
			busy = false;
		}
	}
</script>

<dialog
	bind:this={dialog}
	class="sheet"
	aria-labelledby="cals-title"
	onclick={(e) => {
		if (e.target === dialog) close();
	}}
>
	<div class="inner">
		<div class="head">
			{#if mode === 'form'}
				<button
					type="button"
					class="icon back"
					onclick={backToList}
					aria-label="Back to calendars"
					disabled={busy}
				>
					<ChevronLeft size={20} strokeWidth={2.25} />
				</button>
			{/if}
			<h2 id="cals-title">
				{#if mode === 'list'}Calendars{:else if !canManage}Calendar{:else if !editing}New
				calendar{:else}Edit calendar{/if}
			</h2>
			<button type="button" class="icon" onclick={close} aria-label="Close">
				<X size={20} strokeWidth={2} />
			</button>
		</div>

		{#if mode === 'list'}
			<ul class="list">
				{#each calendars as cal (cal.id)}
					<li>
						<button type="button" class="item" onclick={() => startEdit(cal)}>
							<span class="sw" style={`--c:${cal.color}`} aria-hidden="true"></span>
							<span class="txt">
								<span class="t">{cal.name}</span>
								<span class="m">
									{cal.visibility === 'private' ? 'Only you — your own calendar' : 'Shared with the family'}
								</span>
							</span>
							{#if cal.visibility === 'private'}
								<Lock size={16} strokeWidth={2.25} aria-hidden="true" class="lock" />
							{/if}
						</button>
					</li>
				{/each}
				<li>
					<button type="button" class="item add" onclick={startAdd}>
						<span class="plussw" aria-hidden="true"><Plus size={16} strokeWidth={2.5} /></span>
						<span class="t">New calendar</span>
					</button>
				</li>
			</ul>
		{:else}
			<form onsubmit={save} novalidate>
				{#if editing && !canManage}
					<p class="readonly">Only the person who added this calendar can change it.</p>
				{/if}

				<fieldset class="fields" disabled={!canManage}>
				<label class="field">
					<span>Name</span>
					<input
						bind:this={nameInput}
						bind:value={name}
						type="text"
						maxlength="80"
						placeholder="School, sports, holidays…"
						autocomplete="off"
						enterkeyhint="done"
					/>
				</label>

				<fieldset class="swatches" disabled={busy}>
					<legend>Colour</legend>
					<div class="row">
						{#each COLORS as c (c)}
							<label class="swatch" style={`--c:${c}`}>
								<input type="radio" name="cal-color" value={c} bind:group={color} />
								<span class="sq" aria-hidden="true"></span>
							</label>
						{/each}
					</div>
				</fieldset>

				{#if editing && canManage && !shared}
					<p class="hint">
						Only you can see events on this calendar. You can rename or recolour it, but it can't be
						removed.
					</p>
				{:else if shared}
					{#if canManage}
						<p class="hint warn">
							Removing this calendar removes every event on it
							{#if eventCount !== null}
								{eventCount === 1 ? '— that’s 1 event.' : `— that’s ${eventCount} events.`}
							{/if}
						</p>
					{:else}
						<p class="hint">Shared with the family — everyone can add events to it.</p>
					{/if}
				{:else}
					<p class="hint">Everyone in the family will see this calendar and its events.</p>
				{/if}
				</fieldset>

				{#if error}
					<p class="error" role="alert">{error}</p>
				{/if}

				<div class="actions">
					{#if editing && !canManage}
						<button type="button" class="primary" onclick={backToList}>Close</button>
					{:else}
						{#if editing && shared}
							<button
								type="button"
								class="danger"
								class:armed={confirmDelete}
								onclick={remove}
								disabled={busy}
							>
								{confirmDelete ? 'Tap again to remove' : 'Remove'}
							</button>
						{/if}
						<button type="button" class="ghost" onclick={backToList} disabled={busy}>Cancel</button>
						<button type="submit" class="primary" disabled={busy}>
							{busy ? 'Saving…' : !editing ? 'Add calendar' : 'Save changes'}
						</button>
					{/if}
				</div>
			</form>
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
		gap: 6px;
	}

	h2 {
		flex: 1;
		min-width: 0;
		font-size: 20px;
		font-weight: 700;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.icon {
		width: 44px;
		height: 44px;
		display: grid;
		place-items: center;
		border: none;
		background: none;
		color: #4c5260;
		border-radius: 999px;
		cursor: pointer;
		flex-shrink: 0;
	}

	.icon:hover {
		background: #f0ece2;
	}

	.icon:disabled {
		cursor: default;
		opacity: 0.5;
	}

	.head .back {
		margin-left: -10px;
		color: #22252a;
	}

	button:focus-visible,
	input:focus-visible,
	.swatch:has(input:focus-visible) {
		outline: 2px solid #22252a;
		outline-offset: 2px;
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
		align-items: center;
		gap: 12px;
		padding: 10px 8px;
		border: none;
		border-radius: 4px;
		background: none;
		text-align: left;
		font: inherit;
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
		width: 14px;
		height: 14px;
		border-radius: 3px;
		background: var(--c);
	}

	.plussw {
		flex-shrink: 0;
		width: 14px;
		color: #4c5260;
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

	.add .t {
		font-weight: 600;
	}

	.m {
		font-size: 13px;
		line-height: 1.45;
		color: #4c5260;
	}

	.item :global(.lock) {
		flex-shrink: 0;
		color: #666b76;
	}

	/* ---------- form ---------- */

	form {
		display: flex;
		flex-direction: column;
		gap: 14px;
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
		color: #22252a;
	}

	legend {
		margin-bottom: 8px;
		padding: 0;
	}

	input[type='text'] {
		height: 48px;
		padding: 0 14px;
		border: 1px solid #a9adb5;
		border-radius: 4px;
		background: #ffffff;
		font: inherit;
		font-size: 17px;
		color: #22252a;
		width: 100%;
		min-width: 0;
		caret-color: #c0392b;
	}

	input::placeholder {
		color: #6b707a;
	}

	.swatches {
		border: none;
		padding: 0;
		margin: 0;
		min-width: 0;
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
		color: #4c5260;
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.swatch {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border: 2px solid transparent;
		border-radius: 5px;
		cursor: pointer;
		transition: background-color 120ms ease-out;
	}

	.swatch:hover {
		background: #f0ece2;
	}

	.swatch input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.sq {
		width: 18px;
		height: 18px;
		border-radius: 3px;
		background: var(--c);
	}

	.swatch:has(input:checked) {
		border-color: #22252a;
	}

	.hint {
		font-size: 14px;
		line-height: 1.45;
		color: #4c5260;
	}

	.hint.warn {
		color: #666b76;
	}

	.error {
		font-size: 14px;
		line-height: 1.45;
		color: #a03427;
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

	.danger {
		background: #ffffff;
		border: 1px solid #c9ccd2;
		color: #a03427;
		margin-right: auto;
	}

	.danger:hover:not(:disabled) {
		background: #fbeeec;
	}

	.danger.armed,
	.danger.armed:hover:not(:disabled) {
		background: #a03427;
		border-color: #a03427;
		color: #ffffff;
	}

	.ghost {
		background: #ffffff;
		border: 1px solid #c9ccd2;
		color: #22252a;
		box-shadow: 0 1px 2px rgba(34, 37, 42, 0.08);
	}

	.ghost:hover:not(:disabled) {
		background: #f6f2e9;
	}

	.primary {
		background: #22252a;
		border: 1px solid #22252a;
		color: #fbfaf4;
		flex: 1;
		max-width: 220px;
	}

	.primary:hover:not(:disabled) {
		background: #383c44;
	}

	.actions button:active:not(:disabled) {
		transform: translateY(1px);
	}

	.primary:disabled,
	.ghost:disabled,
	.danger:disabled {
		opacity: 0.7;
		cursor: progress;
	}
</style>
