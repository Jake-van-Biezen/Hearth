/// <reference path="../pb_data/types.d.ts" />
// Occurrence editing for recurring series (exceptions model):
//
// - `events.exceptions` — JSON list of `{ d: "yyyy-mm-dd" }`, Amsterdam
//   calendar dates of occurrences that were deleted or split off instead of
//   following the series. Clients skip them when expanding (see amsDateKey /
//   expandRecurring in src/lib/recur.ts), and the car hook won't book them.
// - `events.occurrenceOf` — for a split-off occurrence, the series it came
//   from. Cascade-deleted with the series.
// - `events.originDate` — the Amsterdam date key the split replaced, so
//   deleting the split can restore the regular occurrence.

migrate(
	(app) => {
		const events = app.findCollectionByNameOrId('events');
		events.fields.add(new JSONField({ name: 'exceptions', maxSize: 25000 }));
		events.fields.add(
			new RelationField({
				name: 'occurrenceOf',
				collectionId: events.id,
				minSelect: 0,
				maxSelect: 1,
				cascadeDelete: true
			})
		);
		events.fields.add(new TextField({ name: 'originDate', max: 10 }));
		app.save(events);
	},
	(app) => {
		const events = app.findCollectionByNameOrId('events');
		events.fields.removeByName('originDate');
		events.fields.removeByName('occurrenceOf');
		events.fields.removeByName('exceptions');
		app.save(events);
	}
);
