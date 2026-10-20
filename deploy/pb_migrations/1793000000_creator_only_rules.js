/// <reference path="../pb_data/types.d.ts" />
// Events are editable and deletable only by the person who created them:
// updateRule and deleteRule now additionally require `createdBy =
// @request.auth.id`. Viewing stays family-wide (privacy rules unchanged).
// Split-off occurrences carry their own `createdBy`, so whoever split a day
// off can still edit that day; the series itself answers to its creator.
// Hook-side saves (split restore, personal calendars) run with superuser
// rights, so they are unaffected.

const MEMBER = '@request.auth.id != "" && calendar.family.members.id ?= @request.auth.id';
const EV_SEES = '(calendar.visibility = "family" || calendar.owner = @request.auth.id)';

migrate(
	(app) => {
		const events = app.findCollectionByNameOrId('events');
		const rule = `${MEMBER} && ${EV_SEES} && createdBy = @request.auth.id`;
		events.updateRule = rule;
		events.deleteRule = rule;
		app.save(events);
	},
	(app) => {
		const events = app.findCollectionByNameOrId('events');
		const rule = `${MEMBER} && ${EV_SEES}`;
		events.updateRule = rule;
		events.deleteRule = rule;
		app.save(events);
	}
);
