/// <reference path="../pb_data/types.d.ts" />
// Split-off occurrences. An "edit just this one" on a recurring series
// creates a standalone event with `occurrenceOf` (+ `originDate`) and adds
// the day to the series' `exceptions` — see pb_migrations/1792900000 and
// src/lib/recur.ts.
//
// Deleting such a split puts the regular occurrence back: remove the
// matching exception from the base series. Deleting the whole series takes
// the splits with it via the relation's cascadeDelete.
//
// Hook handlers run in isolated contexts, so their logic lives along their
// handler (this file is small on purpose).

onRecordDeleteRequest((e) => {
	e.next();
	const baseId = e.record.getString('occurrenceOf');
	const origin = e.record.getString('originDate');
	if (!baseId || !origin) return;
	try {
		const base = e.app.findRecordById('events', baseId);
		const raw = require(`${__hooks}/exceptions.js`).jsonList(base.get('exceptions'));
		const kept = raw.filter((x) => !(x && x.d === origin));
		if (kept.length === raw.length) return;
		base.set('exceptions', kept);
		e.app.save(base);
	} catch (err) {
		e.app.logger().error('split: restore failed', 'base', baseId, 'error', String(err));
	}
}, 'events');
