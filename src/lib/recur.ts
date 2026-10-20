// Pure recurrence helpers, shared by month/week rendering and the event
// sheet. Everything here is free of I/O so it can be test-frozen with plain
// node (esbuild + node). Recurrence rules mirror car.js on the server:
// weekly keeps the weekday, monthly the day of the month, and wall-clock
// grouping is Europe/Amsterdam (the family's timezone — done in code since
// the NAS image has no zoneinfo).

const DAY = 86_400_000;

/** PocketBase dates come as "YYYY-MM-DD HH:mm:ss.sssZ"; Safari needs the T. */
export function parseDate(value: string): Date | null {
	if (!value) return null;
	const d = new Date(value.replace(' ', 'T'));
	return Number.isNaN(d.getTime()) ? null : d;
}

// --------------------------------------------------- Europe/Amsterdam key --

/** EU summer time: last Sunday of March 01:00 UTC to last Sunday of October 01:00 UTC. */
function lastSunday(year: number, month: number): number {
	const last = new Date(Date.UTC(year, month + 1, 0));
	return Date.UTC(year, month, last.getUTCDate() - last.getUTCDay(), 1);
}

function utcOffset(ms: number): number {
	const y = new Date(ms).getUTCFullYear();
	return ms >= lastSunday(y, 2) && ms < lastSunday(y, 9) ? 2 * 3_600_000 : 3_600_000;
}

/**
 * Europe/Amsterdam calendar date of an instant as "yyyy-mm-dd". Used as the
 * key for series exceptions: the family lives in Amsterdam, so that is the
 * day that means "this one" to them, wherever in the world their phone is.
 */
export function amsDateKey(d: Date): string {
	const shifted = d.getTime() + utcOffset(d.getTime());
	const w = new Date(shifted);
	const p = (n: number) => String(n).padStart(2, '0');
	return `${w.getUTCFullYear()}-${p(w.getUTCMonth() + 1)}-${p(w.getUTCDate())}`;
}

/**
 * Does a recurring series skip the occurrence on `key`? `exceptions` holds
 * the Amsterdam date keys of occurrences that were split off as their own
 * events (or deleted) instead of following the series.
 */
export function isException(ev: { exceptions?: EventException[] | null }, key: string): boolean {
	return ev.exceptions?.some((x) => x.d === key) ?? false;
}

// ------------------------------------------------------------ repetition --

/**
 * The next instant of a recurring series at/after `from`, or null once past
 * the cap (recurring series have no end date; stop looking after two years).
 * Weekly keeps the weekday, monthly the day of the month (months without
 * that date, like Feb 31, are skipped).
 */
export function seriesNext(ev: RecurringEvent, from: Date): Date | null {
	const start = parseDate(ev.startsAt);
	if (!start || !ev.recurrence) return null;
	const cap = new Date(from.getFullYear() + 2, from.getMonth(), from.getDate(), 23, 59, 59, 999);
	if (ev.recurrence === 'weekly') {
		const steps = Math.max(0, Math.ceil((startOfDayMs(from) - startOfDayMs(start)) / DAY / 7));
		let occ = shiftDays(start, steps * 7);
		if (startOfDayMs(occ) === startOfDayMs(from) && occ.getTime() < from.getTime())
			occ = shiftDays(occ, 7);
		return occ.getTime() <= cap.getTime() ? occ : null;
	}
	if (ev.recurrence === 'monthly') {
		for (let k = 0; k < 36; k++) {
			// Skim past months already behind `from` without walking all of them.
			const months =
				(from.getFullYear() - start.getFullYear()) * 12 + (from.getMonth() - start.getMonth());
			const n = k === 0 ? Math.max(0, months) : Math.max(0, months) + k;
			const occ = new Date(
				start.getFullYear(),
				start.getMonth() + n,
				start.getDate(),
				start.getHours(),
				start.getMinutes(),
				start.getSeconds()
			);
			// Rolled over (Feb 31 → Mar 2): that month has no such date; skip it.
			if (occ.getDate() !== start.getDate()) continue;
			if (occ.getTime() < from.getTime()) continue;
			return occ.getTime() <= cap.getTime() ? occ : null;
		}
	}
	return null;
}

const OCCURRENCE_LIMIT = 260; // well past 2 years of either rule

/**
 * Expand recurring series into concrete occurrences inside
 * [rangeStart, rangeEnd). Non-recurring events pass through untouched;
 * an occurrence is a shallow copy of the base with shifted timestamps.
 * Occurrences whose Amsterdam day was split off (or deleted) as an exception
 * are skipped; the standalone event shows instead.
 */
export function expandRecurring<T extends RecurringEvent>(
	events: T[],
	rangeStart: Date,
	rangeEnd: Date
): T[] {
	return events.flatMap((ev) => {
		if (!ev.recurrence) return [ev];
		const base = parseDate(ev.startsAt);
		if (!base) return [];
		const end = parseDate(ev.endsAt ?? '');
		const delta = end ? end.getTime() - base.getTime() : 0;
		const out: T[] = [];
		let from = rangeStart;
		for (let n = 0; n < OCCURRENCE_LIMIT; n++) {
			const occ = seriesNext(ev, from);
			if (!occ) break;
			if (occ.getTime() >= rangeEnd.getTime()) break;
			const key = amsDateKey(occ);
			from = new Date(occ.getFullYear(), occ.getMonth(), occ.getDate() + 1);
			if (isException(ev, key)) continue;
			out.push({
				...ev,
				startsAt: occ.toISOString(),
				endsAt: delta ? new Date(occ.getTime() + delta).toISOString() : ''
			});
		}
		return out;
	});
}

// ------------------------------------------------------------- rebasing --

function shiftDays(d: Date, days: number): Date {
	const n = new Date(d);
	n.setDate(n.getDate() + days);
	return n;
}

function startOfDay(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfDayMs(d: Date): number {
	return startOfDay(d).getTime();
}

/**
 * Where a series anchor must sit so its pattern matches the edited
 * occurrence. Editing one instance's title needs no rebasing, but editing
 * the series ("All events") must move the anchor so future occurrences land
 * on the day the user just chose, while staying as close as possible to the
 * existing rhythm (nearest matching week/month to the current anchor).
 *
 * `base`  — the series' current start (local wall clock).
 * `occ`   — the occurrence as edited (its date and time of day stand).
 * Returns the new startsAt instant: `occ`'s time of day on the rebased day.
 */
export function rebaseSeriesAnchor(base: Date, occ: Date, recurrence: string): Date {
	if (recurrence === 'weekly') {
		// Weeks between anchor and the edited instance, rounded: the anchor
		// slides by whole weeks so it stays on its own weekday rhythm, then
		// clips to the edited weekday, nearest step wins.
		const weeks = Math.round((startOfDayMs(occ) - startOfDayMs(base)) / DAY / 7);
		const near = shiftDays(startOfDay(base), weeks * 7);
		const delta = (occ.getDay() - near.getDay() + 14) % 7; // 0..6
		const fwd = shiftDays(near, delta);
		const back = shiftDays(near, delta - 7);
		const closer =
			Math.abs(back.getTime() - near.getTime()) < Math.abs(fwd.getTime() - near.getTime())
				? back
				: fwd;
		return new Date(
			closer.getFullYear(),
			closer.getMonth(),
			closer.getDate(),
			occ.getHours(),
			occ.getMinutes(),
			occ.getSeconds()
		);
	}
	if (recurrence === 'monthly') {
		// Anchor the series on the edited day-of-month, in the month nearest
		// the current anchor. Months without that day (Feb 31) are skipped.
		const m0 = Math.round(
			(occ.getFullYear() - base.getFullYear()) * 12 + (occ.getMonth() - base.getMonth())
		);
		const pick = (k: number): Date | null => {
			const cand = new Date(
				base.getFullYear(),
				base.getMonth() + k,
				occ.getDate(),
				occ.getHours(),
				occ.getMinutes(),
				occ.getSeconds()
			);
			// Rolled over (Feb 31 → Mar 2): no such day that month.
			return cand.getDate() === occ.getDate() ? cand : null;
		};
		for (let r = 0; r < 120; r++) {
			const found = r === 0 ? pick(m0) : (pick(m0 + r) ?? pick(m0 - r));
			if (found) return found;
		}
		return occ;
	}
	return occ;
}

// ------------------------------------------------------------- shared types

export interface EventException {
	/** Europe/Amsterdam date key "yyyy-mm-dd" of an excepted occurrence. */
	d: string;
}

/** Structural subset of an event used by the pure helpers. */
export interface RecurringEvent {
	startsAt: string;
	endsAt?: string;
	/** "" for one-off events; otherwise "weekly" or "monthly". */
	recurrence?: string;
	/** Occurrences split off (or deleted) from a series, keyed by amsDateKey. */
	exceptions?: EventException[] | null;
}