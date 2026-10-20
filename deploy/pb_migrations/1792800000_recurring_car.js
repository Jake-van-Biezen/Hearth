/// <reference path="../pb_data/types.d.ts" />
// Two event fields:
//
// 1. Recurring events: `events.recurrence` ("", "weekly" or "monthly"). The
//    base event keeps its first occurrence; clients expand future occurrences
//    (see expandRecurring in src/lib/calendar.ts).
// 2. Car bookings: `events.usesCar`. An event that needs the family car
//    blocks it for its duration; overlapping car events are rejected by
//    pb_hooks/car.pb.js.

migrate(
	(app) => {
		const events = app.findCollectionByNameOrId('events');
		events.fields.add(new TextField({ name: 'recurrence', max: 20 }));
		events.fields.add(new BoolField({ name: 'usesCar' }));
		app.save(events);
	},
	(app) => {
		const events = app.findCollectionByNameOrId('events');
		events.fields.removeByName('recurrence');
		events.fields.removeByName('usesCar');
		app.save(events);
	}
);
