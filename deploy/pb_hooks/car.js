/// <reference path="../pb_data/types.d.ts" />
// Car booking helpers, shared by car.pb.js (hook handlers run in isolated
// contexts, so they `require()` this file).
//
// An event with `usesCar` books the family car for its whole duration. Two
// car events may not overlap, including any future occurrence of a weekly or
// monthly series. Recurrence rules mirror seriesNext() in
// src/lib/calendar.ts: weekly keeps the weekday and wall-clock time, monthly
// the day of the month (months without that date are skipped).
//
// Wall-clock math is done in Europe/Amsterdam explicitly (EU DST rule) rather
// than the server's local time: the NAS image has no zoneinfo, so TZ is
// ignored there and a weekly 10:00 would drift an hour across DST.

const HOUR = 3600000;
const DAY = 24 * HOUR;
/** Recurring series never end; look this far ahead (same cap as the client). */
const HORIZON_YEARS = 2;
const MAX_STEPS = 1000;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** PocketBase stores "YYYY-MM-DD HH:mm:ss.sssZ". */
function parse(value) {
	if (!value) return null;
	const d = new Date(String(value).replace(' ', 'T'));
	return isNaN(d.getTime()) ? null : d;
}

function toDb(d) {
	return d.toISOString().replace('T', ' ');
}

/** Plain snapshot of the fields the overlap check needs. */
function shapeOf(record) {
	const start = parse(record.getString('startsAt'));
	if (!start) return null;
	const allDay = record.getBool('allDay');
	const end = parse(record.getString('endsAt'));
	// Car bookings require an end; older timed events without one count an hour.
	const fallback = allDay ? DAY : HOUR;
	const stop = end && end.getTime() > start.getTime() ? end : new Date(start.getTime() + fallback);
	return {
		id: record.id,
		title: record.getString('title'),
		calendar: record.getString('calendar'),
		createdBy: record.getString('createdBy'),
		allDay: allDay,
		recurrence: record.getString('recurrence'),
		// Amsterdam date keys of occurrences the series no longer covers.
		excepts: exceptsOf(record),
		start: start,
		duration: stop.getTime() - start.getTime()
	};
}

/** Set of "YYYY-MM-DD" Amsterdam keys in the record's `exceptions` JSON. */
function exceptsOf(record) {
	const list = require(`${__hooks}/exceptions.js`).jsonList(record.get('exceptions'));
	const set = {};
	for (let i = 0; i < list.length; i++) {
		const x = list[i];
		if (x && typeof x.d === 'string') set[x.d] = true;
	}
	return set;
}

// ------------------------------------------------- Europe/Amsterdam time --

/** EU summer time: last Sunday of March 01:00 UTC to last Sunday of October 01:00 UTC. */
function lastSunday(year, month) {
	const last = new Date(Date.UTC(year, month + 1, 0));
	return Date.UTC(year, month, last.getUTCDate() - last.getUTCDay(), 1);
}

function offset(ms) {
	const y = new Date(ms).getUTCFullYear();
	return ms >= lastSunday(y, 2) && ms < lastSunday(y, 9) ? 2 * HOUR : HOUR;
}

/** Amsterdam wall clock of an instant; read it with the getUTC* methods. */
function wall(d) {
	return new Date(d.getTime() + offset(d.getTime()));
}

/** Instant for an Amsterdam wall clock given as a Date.UTC(...) value. */
function fromWall(ms) {
	const guess = ms - offset(ms - HOUR);
	return new Date(ms - offset(guess));
}

function shift(base, days, months) {
	const w = wall(base);
	return fromWall(
		Date.UTC(
			w.getUTCFullYear(),
			w.getUTCMonth() + months,
			w.getUTCDate() + days,
			w.getUTCHours(),
			w.getUTCMinutes(),
			w.getUTCSeconds(),
			w.getUTCMilliseconds()
		)
	);
}

/** YYYY-MM-DD of `d`'s Amsterdam calendar day. */
function amsKey(d) {
	const w = wall(d);
	return w.getUTCFullYear() + '-' + pad(w.getUTCMonth() + 1) + '-' + pad(w.getUTCDate());
}

/** Occurrence start times of `ev` whose interval overlaps [from, to). */
function occurrences(ev, from, to) {
	const out = [];
	const lo = from.getTime() - ev.duration;
	const hi = to.getTime();
	const keep = (s) => {
		if (s.getTime() > lo && s.getTime() < hi) out.push(s);
	};
	if (ev.recurrence === 'weekly') {
		const k0 = Math.max(0, Math.floor((lo - ev.start.getTime()) / (7 * DAY)) - 1);
		for (let k = k0; k < k0 + MAX_STEPS; k++) {
			const s = shift(ev.start, 7 * k, 0);
			if (s.getTime() >= hi) break;
			// Split-off (or deleted) days no longer belong to the series.
			if (ev.excepts && ev.excepts[amsKey(s)]) continue;
			keep(s);
		}
	} else if (ev.recurrence === 'monthly') {
		const lod = wall(new Date(lo));
		const base = wall(ev.start);
		const behind =
			(lod.getUTCFullYear() - base.getUTCFullYear()) * 12 + (lod.getUTCMonth() - base.getUTCMonth());
		const m0 = Math.max(0, behind - 1);
		for (let m = m0; m < m0 + MAX_STEPS; m++) {
			const s = shift(ev.start, 0, m);
			if (s.getTime() >= hi) break;
			// Rolled over (Feb 31 -> Mar 3): no such date that month.
			if (wall(s).getUTCDate() !== base.getUTCDate()) continue;
			if (ev.excepts && ev.excepts[amsKey(s)]) continue;
			keep(s);
		}
	} else {
		keep(ev.start);
	}
	return out;
}

/** Start of the first `b` occurrence that overlaps any `a` occurrence, or null. */
function firstClash(a, b, from, to) {
	const mine = occurrences(a, from, to);
	for (let i = 0; i < mine.length; i++) {
		const s = mine[i];
		const theirs = occurrences(b, s, new Date(s.getTime() + a.duration));
		if (theirs.length) return theirs[0];
	}
	return null;
}

function pad(n) {
	return (n < 10 ? '0' : '') + n;
}

function when(d, allDay) {
	const w = wall(d);
	const now = wall(new Date());
	const year = w.getUTCFullYear() !== now.getUTCFullYear() ? ' ' + w.getUTCFullYear() : '';
	const day = WEEKDAYS[w.getUTCDay()] + ' ' + w.getUTCDate() + ' ' + MONTHS[w.getUTCMonth()] + year;
	return allDay ? day : day + ', ' + pad(w.getUTCHours()) + ':' + pad(w.getUTCMinutes());
}

function nameOf(app, userId) {
	if (!userId) return 'Someone';
	try {
		const u = app.findRecordById('users', userId);
		const name = u.getString('name').trim();
		return name ? name.split(/\s+/)[0] : u.email().split('@')[0];
	} catch {
		return 'Someone';
	}
}

module.exports = {
	/** Fields whose change can create a new clash. */
	TIMING: ['startsAt', 'endsAt', 'allDay', 'recurrence', 'usesCar', 'calendar'],

	/**
	 * Throw a 400 when `record` needs the car while another car event in the
	 * same family already has it. Private events are checked too (the car is
	 * shared either way) but only reveal who and when, not the title.
	 */
	assertCarFree(app, record) {
		if (!record.getBool('usesCar')) return;
		if (!record.getBool('allDay') && !record.getString('endsAt')) {
			const msg = 'Add an end time so everyone knows when the car is back.';
			throw new BadRequestError(msg, { endsAt: new ValidationError('car_needs_end', msg) });
		}
		const me = shapeOf(record);
		if (!me) return;

		const calendar = app.findRecordById('calendars', me.calendar);
		const familyId = calendar.getString('family');

		// Past occurrences of a series don't matter; a single event is checked as is.
		const n = wall(new Date());
		const today = fromWall(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
		const from = me.recurrence
			? new Date(Math.max(me.start.getTime(), today.getTime()))
			: me.start;
		const to = me.recurrence
			? shift(from, 0, 12 * HORIZON_YEARS)
			: new Date(me.start.getTime() + me.duration);

		const others = app.findRecordsByFilter(
			'events',
			'usesCar = true && calendar.family = {:fid} && id != {:id} && startsAt < {:to} && ' +
				'(recurrence != "" || endsAt > {:from} || startsAt >= {:from})',
			'startsAt',
			0,
			0,
			{ fid: familyId, id: record.id || '', from: toDb(new Date(from.getTime() - DAY)), to: toDb(to) }
		);

		for (let i = 0; i < others.length; i++) {
			const other = shapeOf(others[i]);
			if (!other) continue;
			const at = firstClash(me, other, from, to);
			if (!at) continue;
			const cal = app.findRecordById('calendars', other.calendar);
			const isPrivate = cal.getString('visibility') === 'private';
			const who = nameOf(app, isPrivate ? cal.getString('owner') : other.createdBy);
			const what = isPrivate ? '' : ' for ' + other.title;
			const msg = who + ' has the car' + what + ' on ' + when(at, other.allDay) + '.';
			throw new BadRequestError(msg, { usesCar: new ValidationError('car_taken', msg) });
		}
	}
};
