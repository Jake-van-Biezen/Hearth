/// <reference path="../pb_data/types.d.ts" />
// Car bookings: an event with `usesCar` may not overlap another one in the
// same family. See car.js and pb_migrations/1792800000_recurring_car.js.

onRecordCreateRequest((e) => {
	require(`${__hooks}/car.js`).assertCarFree(e.app, e.record);
	e.next();
}, 'events');

onRecordUpdateRequest((e) => {
	const car = require(`${__hooks}/car.js`);
	const before = e.record.original();
	// Only re-check when the booking itself moved; a title edit can't clash.
	for (let i = 0; i < car.TIMING.length; i++) {
		if (before.getString(car.TIMING[i]) !== e.record.getString(car.TIMING[i])) {
			car.assertCarFree(e.app, e.record);
			break;
		}
	}
	e.next();
}, 'events');
