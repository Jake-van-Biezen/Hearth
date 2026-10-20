import type { RecordModel } from 'pocketbase';
import { pb } from '$lib/pocketbase';

export type Family = RecordModel & { name: string; members: string[] };

export type Calendar = RecordModel & {
	family: string;
	name: string;
	color: string;
	/** `private`: only `owner` can see it (each member's personal calendar). */
	visibility: 'family' | 'private';
	owner: string;
};

export type CalendarEvent = RecordModel & {
	calendar: string;
	title: string;
	description: string;
	location: string;
	startsAt: string;
	endsAt: string;
	allDay: boolean;
	/** "" | "weekly" | "monthly". Series-only: one event, many occurrences. */
	recurrence: string;
	/** Books the family car for the event's duration; overlaps are rejected server-side. */
	usesCar: boolean;
	createdBy: string;
};

const DAY = 86_400_000;

/** PocketBase dates come as "YYYY-MM-DD HH:mm:ss.sssZ"; Safari needs the T. */
export function parseDate(value: string): Date | null {
	if (!value) return null;
	const d = new Date(value.replace(' ', 'T'));
	return Number.isNaN(d.getTime()) ? null : d;
}

export function startOfDay(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Whole local days from `a` to `b` (both local midnights); DST-safe. */
export function daysBetween(a: Date, b: Date): number {
	return Math.round((b.getTime() - a.getTime()) / DAY);
}

/** Monday-first week start (Dutch calendar habit). */
export function startOfWeek(d: Date): Date {
	const day = startOfDay(d);
	const offset = (day.getDay() + 6) % 7;
	return addDays(day, -offset);
}

export function sameDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

export function isoWeek(d: Date): number {
	const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
	const dayNum = t.getUTCDay() || 7;
	t.setUTCDate(t.getUTCDate() + 4 - dayNum);
	const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
	return Math.ceil(((t.getTime() - yearStart.getTime()) / DAY + 1) / 7);
}

/** yyyy-mm-dd in local time, for <input type="date">. */
export function toDateInput(d: Date): string {
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fromDateInput(value: string, time = '00:00'): Date | null {
	const [y, m, d] = value.split('-').map(Number);
	const [hh, mm] = time.split(':').map(Number);
	if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) return null;
	return new Date(y, m - 1, d, hh, mm);
}

const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
export const formatTime = (d: Date) => timeFmt.format(d);

const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'long' });
const dayShortMonthFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

/** "19 – 25 October", or "28 Sept – 4 Oct" across months (kept short for phones). */
export function formatWeekRange(weekStart: Date): string {
	const end = addDays(weekStart, 6);
	if (weekStart.getMonth() === end.getMonth()) {
		return `${weekStart.getDate()} – ${end.getDate()} ${monthFmt.format(end)}`;
	}
	return `${dayShortMonthFmt.format(weekStart)} – ${dayShortMonthFmt.format(end)}`;
}

/** Pick ink or paper text for a chip, whichever contrasts more with its fill. */
export function chipText(hex: string): string {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
	if (!m) return '#ffffff';
	const n = parseInt(m[1], 16);
	const lin = (c: number) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
	const onWhite = 1.05 / (L + 0.05);
	const onInk = (L + 0.05) / 0.0687;
	return onInk > onWhite ? '#22252a' : '#ffffff';
}

/** Does the event touch the local day starting at `day`? */
export function onDay(ev: CalendarEvent, day: Date): boolean {
	const start = parseDate(ev.startsAt);
	if (!start) return false;
	const end = parseDate(ev.endsAt) ?? start;
	const dayStart = day.getTime();
	const dayEnd = addDays(day, 1).getTime();
	if (start.getTime() >= dayStart && start.getTime() < dayEnd) return true;
	return start.getTime() < dayStart && end.getTime() > dayStart;
}

export function sortForDay(a: CalendarEvent, b: CalendarEvent): number {
	if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
	return (parseDate(a.startsAt)?.getTime() ?? 0) - (parseDate(b.startsAt)?.getTime() ?? 0);
}

// ------------------------------------------------------------- repetition --

/**
 * The nextinstant of a recurring series at/after `from`, or null once past
 * the cap (recurring series have no end date; stop looking after two years).
 * Weekly keeps the weekday, monthly the day of the month (months without
 * that date, like Feb 31, are skipped).
 */
export function seriesNext(ev: CalendarEvent, from: Date): Date | null {
	const start = parseDate(ev.startsAt);
	if (!start || !ev.recurrence) return null;
	const cap = new Date(from.getFullYear() + 2, from.getMonth(), from.getDate(), 23, 59, 59, 999);
	if (ev.recurrence === 'weekly') {
		const steps = Math.max(0, Math.ceil(daysBetween(startOfDay(start), from) / 7));
		let occ = addDays(start, steps * 7);
		if (daysBetween(startOfDay(from), startOfDay(occ)) === 0 && occ.getTime() < from.getTime())
			occ = addDays(occ, 7);
		return occ.getTime() <= cap.getTime() ? occ : null;
	}
	if (ev.recurrence === 'monthly') {
		for (let k = 0; k < 36; k++) {
			// Skim past months already behind `from` without walking all of them.
			const baseMonths =
				k === 0
					? (from.getFullYear() - start.getFullYear()) * 12 + (from.getMonth() - start.getMonth())
					: 1;
			const occ = new Date(
				start.getFullYear(),
				start.getMonth() + Math.max(0, baseMonths) + k,
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
 */
export function expandRecurring(
	events: CalendarEvent[],
	rangeStart: Date,
	rangeEnd: Date
): CalendarEvent[] {
	return events.flatMap((ev) => {
		if (!ev.recurrence) return [ev];
		const base = parseDate(ev.startsAt);
		if (!base) return [];
		const end = parseDate(ev.endsAt);
		const delta = end ? end.getTime() - base.getTime() : 0;
		const out: CalendarEvent[] = [];
		let from = rangeStart;
		for (let n = 0; n < OCCURRENCE_LIMIT; n++) {
			const occ = seriesNext({ ...ev, startsAt: ev.startsAt }, from);
			if (!occ || occ.getTime() >= rangeEnd.getTime()) break;
			out.push({
				...ev,
				startsAt: occ.toISOString(),
				endsAt: delta ? new Date(occ.getTime() + delta).toISOString() : ''
			});
			from = addDays(startOfDay(occ), 1);
		}
		return out;
	});
}

export async function loadFamily(userId: string): Promise<Family | null> {
	const list = await pb.collection('families').getList<Family>(1, 1, {
		filter: pb.filter('members.id ?= {:uid}', { uid: userId }),
		sort: 'name'
	});
	return list.items[0] ?? null;
}

export function loadCalendars(familyId: string): Promise<Calendar[]> {
	return pb.collection('calendars').getFullList<Calendar>({
		filter: pb.filter('family = {:fid}', { fid: familyId }),
		// Shared calendars first ("family" < "private"), then your own.
		sort: 'visibility,name'
	});
}

/** Whole days of the local month containing `d`. */
export function monthBounds(d: Date): { first: Date; last: Date } {
	const first = new Date(d.getFullYear(), d.getMonth(), 1);
	return { first, last: new Date(d.getFullYear(), d.getMonth() + 1, 0) };
}

/** "October 2026". */
export function formatMonthRange(first: Date): string {
	return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(first);
}

/**
 * All events touching [weekStart, +7d), with recurring series expanded to
 * their occurrences in that window (the base of an ongoing series may sit
 * below the window; expansion is client-side).
 */
export async function loadWeekEvents(
	familyId: string,
	weekStart: Date
): Promise<CalendarEvent[]> {
	const end = addDays(weekStart, 7);
	const evs = await pb.collection('events').getFullList<CalendarEvent>({
		filter: pb.filter(
			'calendar.family = {:fid} && startsAt < {:end} && (startsAt >= {:start} || endsAt > {:start} || (recurrence != "" && startsAt < {:start}))',
			{ fid: familyId, start: weekStart, end }
		),
		sort: 'startsAt',
		requestKey: 'hearth-week'
	});
	return expandRecurring(evs, weekStart, end);
}

/** See loadWeekEvents; `end` is exclusive. */
export function loadRangeEvents(
	familyId: string,
	start: Date,
	end: Date,
	requestKey: string
): Promise<CalendarEvent[]> {
	return pb.collection('events').getFullList<CalendarEvent>({
		filter: pb.filter(
			'calendar.family = {:fid} && startsAt < {:end} && (startsAt >= {:start} || endsAt > {:start} || (recurrence != "" && startsAt < {:start}))',
			{ fid: familyId, start, end }
		),
		sort: 'startsAt',
		requestKey
	}).then((evs) => expandRecurring(evs, start, end));
}

/**
 * The next timed appointment or recurring occurrence from `now` on. The
 * server can't expand recurrence, so recurring bases are fetched and their
 * next occurrence computed here; the earliest wins.
 */
export async function loadNextUp(familyId: string, now: Date): Promise<CalendarEvent | null> {
	const base = 'calendar.family = {:fid} && allDay = false';
	const [plain, series] = await Promise.all([
		pb.collection('events').getList<CalendarEvent>(1, 1, {
			filter: pb.filter(`${base} && startsAt >= {:now}`, { fid: familyId, now }),
			sort: 'startsAt',
			requestKey: 'hearth-next-plain'
		}),
		pb.collection('events').getFullList<CalendarEvent>({
			filter: pb.filter(`${base} && recurrence != "" && startsAt < {:now}`, {
				fid: familyId,
				now
			}),
			sort: '-startsAt',
			requestKey: 'hearth-next-series'
		})
	]);
	let best: CalendarEvent | null = plain.items[0] ?? null;
	let bestAt = best ? parseDate(best.startsAt)?.getTime() ?? Infinity : Infinity;
	for (const ev of series) {
		const occ = seriesNext(ev, now);
		if (!occ) continue;
		const at = occ.getTime();
		if (at < bestAt) {
			best = { ...ev, startsAt: occ.toISOString() };
			bestAt = at;
		}
	}
	return best;
}
