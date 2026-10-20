/// <reference path="../pb_data/types.d.ts" />
// PocketBase treats 0 as empty for `required` number fields, so "At start"
// (0 minutes before) was rejected. The app already limits the value to
// 0..10080 through the reminder options, so drop `required` here.
migrate(
	(app) => {
		const reminders = app.findCollectionByNameOrId('reminders');
		const field = reminders.fields.getByName('minutesBefore');
		field.required = false;
		app.save(reminders);
	},
	(app) => {
		const reminders = app.findCollectionByNameOrId('reminders');
		const field = reminders.fields.getByName('minutesBefore');
		field.required = true;
		app.save(reminders);
	}
);
