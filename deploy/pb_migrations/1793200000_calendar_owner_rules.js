/// <reference path="../pb_data/types.d.ts" />
// Calendars get a single owner: whoever created them. Before this migration
// shared ("family") calendars had owner = "" and every member could rename,
// recolour or delete them; now only the owner can. Personal calendars were
// already owner-only (created by pb_hooks/membership.pb.js) and stay
// undeletable through the API.
//
// Backfill: existing shared calendars are handed to the family's first
// member, so nothing becomes uneditable.

const MEMBER = '@request.auth.id != "" && family.members.id ?= @request.auth.id';

migrate(
	(app) => {
		const calendars = app.findCollectionByNameOrId('calendars');

		// Shared calendars with no owner yet go to the family's first member.
		const unowned = app.findRecordsByFilter(
			'calendars',
			'owner = "" && visibility = "family"',
			'',
			0,
			0
		);
		for (const cal of unowned) {
			const family = app.findRecordById('families', cal.getString('family'));
			const members = family.getStringSlice('members');
			if (members.length) {
				cal.set('owner', members[0]);
				app.save(cal);
			}
		}

		// Only the owner renames or recolours (personal or shared alike).
		// Family and owner stay fixed; a shared calendar can never turn private
		// (that would strand its events where nobody sees them).
		calendars.updateRule =
			`${MEMBER} && owner = @request.auth.id` +
			' && @request.body.family:isset = false && @request.body.owner:isset = false' +
			' && (@request.body.visibility:isset = false || @request.body.visibility = "family")';
		// Shared calendars: owner-only removal. Private ones: never via the API.
		calendars.deleteRule = `${MEMBER} && owner = @request.auth.id && visibility = "family"`;
		app.save(calendars);
	},
	(app) => {
		const calendars = app.findCollectionByNameOrId('calendars');
		const SEES = '(visibility = "family" || owner = @request.auth.id)';
		calendars.updateRule =
			`${MEMBER} && ${SEES}` +
			' && @request.body.family:isset = false && @request.body.owner:isset = false' +
			' && (@request.body.visibility:isset = false || @request.body.visibility = "family" || owner = @request.auth.id)';
		calendars.deleteRule = `${MEMBER} && owner = ""`;
		app.save(calendars);
	}
);
