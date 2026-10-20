/// <reference path="../pb_data/types.d.ts" />
// Personal calendars: every family member gets one calendar only they can
// see (created by pb_hooks/membership.pb.js). `visibility = "private"` is now
// enforced: a private calendar and its events are visible to its owner only.
// Also renames the default shared "Family" calendar after its family.

const MEMBER = '@request.auth.id != "" && family.members.id ?= @request.auth.id';
const SEES = '(visibility = "family" || owner = @request.auth.id)';

const EV_MEMBER = '@request.auth.id != "" && calendar.family.members.id ?= @request.auth.id';
const EV_SEES = '(calendar.visibility = "family" || calendar.owner = @request.auth.id)';

migrate(
	(app) => {
		const calendars = app.findCollectionByNameOrId('calendars');
		calendars.fields.add(
			new RelationField({
				name: 'owner',
				collectionId: '_pb_users_auth_',
				cascadeDelete: true,
				minSelect: 0,
				maxSelect: 1
			})
		);
		calendars.listRule = `${MEMBER} && ${SEES}`;
		calendars.viewRule = `${MEMBER} && ${SEES}`;
		// Shared calendars have no owner; a private one must belong to its creator.
		calendars.createRule =
			`${MEMBER} && (owner = "" || owner = @request.auth.id)` +
			` && (visibility = "family" || owner = @request.auth.id)`;
		calendars.updateRule =
			`${MEMBER} && ${SEES}` +
			' && @request.body.family:isset = false && @request.body.owner:isset = false' +
			' && (@request.body.visibility:isset = false || @request.body.visibility = "family" || owner = @request.auth.id)';
		// Personal calendars are guaranteed; only shared ones can be removed.
		calendars.deleteRule = `${MEMBER} && owner = ""`;
		app.save(calendars);

		const events = app.findCollectionByNameOrId('events');
		const rule = `${EV_MEMBER} && ${EV_SEES}`;
		events.listRule = rule;
		events.viewRule = rule;
		events.createRule = rule;
		// Moving an event into another calendar is checked in pb_hooks/membership.pb.js.
		events.updateRule = rule;
		events.deleteRule = rule;
		app.save(events);

		const shared = app.findRecordsByFilter('calendars', 'name = "Family" && visibility = "family"');
		for (const cal of shared) {
			const family = app.findRecordById('families', cal.getString('family'));
			cal.set('name', family.getString('name'));
			app.save(cal);
		}

		// Existing members get their personal calendar now (later members get
		// one from pb_hooks/membership.pb.js). Keep in sync with membership.js.
		const colors = ['#3b9e6b', '#d9b12e', '#c0392b', '#8e5bb5', '#e07b39', '#2a9d9a', '#c2577f'];
		for (const family of app.findRecordsByFilter('families', '', '', 0, 0)) {
			const used = app
				.findRecordsByFilter('calendars', 'family = {:f}', '', 0, 0, { f: family.id })
				.map((c) => c.getString('color').toLowerCase());
			for (const uid of family.getStringSlice('members')) {
				const user = app.findRecordById('users', uid);
				const name = user.getString('name').trim().split(/\s+/)[0] || user.email().split('@')[0];
				const color = colors.find((c) => !used.includes(c)) ?? colors[used.length % colors.length];
				used.push(color);
				const cal = new Record(calendars);
				cal.set('family', family.id);
				cal.set('owner', uid);
				cal.set('name', name.slice(0, 80));
				cal.set('color', color);
				cal.set('visibility', 'private');
				app.save(cal);
			}
		}
	},
	(app) => {
		const calendars = app.findCollectionByNameOrId('calendars');
		for (const cal of app.findRecordsByFilter('calendars', 'owner != ""')) app.delete(cal);
		calendars.fields.removeByName('owner');
		calendars.listRule = MEMBER;
		calendars.viewRule = MEMBER;
		calendars.createRule = MEMBER;
		calendars.updateRule = MEMBER;
		calendars.deleteRule = MEMBER;
		app.save(calendars);

		const events = app.findCollectionByNameOrId('events');
		events.listRule = EV_MEMBER;
		events.viewRule = EV_MEMBER;
		events.createRule = EV_MEMBER;
		events.updateRule = EV_MEMBER;
		events.deleteRule = EV_MEMBER;
		app.save(events);
	}
);
