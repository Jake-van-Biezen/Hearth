/// <reference path="../pb_data/types.d.ts" />
migrate(
	(app) => {
		const families = new Collection({
			name: 'families',
			type: 'base',
			fields: [
				{ type: 'text', name: 'name', required: true, max: 80 },
				{
					type: 'relation',
					name: 'members',
					collectionId: '_pb_users_auth_',
					minSelect: 0,
					maxSelect: 99,
					cascadeDelete: false
				}
			],
			listRule: '@request.auth.id != "" && id != ""',
			viewRule: '@request.auth.id != "" && id != ""',
			createRule: null,
			updateRule: 'members.id ?= @request.auth.id',
			deleteRule: null
		});
		app.save(families);

		const calendars = new Collection({
			name: 'calendars',
			type: 'base',
			fields: [
				{
					type: 'relation',
					name: 'family',
					collectionId: families.id,
					required: true,
					cascadeDelete: true,
					minSelect: 1,
					maxSelect: 1
				},
				{ type: 'text', name: 'name', required: true, max: 80 },
				{ type: 'text', name: 'color', required: true, max: 9 },
				{
					type: 'select',
					name: 'visibility',
					maxSelect: 1,
					values: ['family', 'private'],
					required: true
				}
			],
			listRule: '@request.auth.id != "" && family.members.id ?= @request.auth.id',
			viewRule: '@request.auth.id != "" && family.members.id ?= @request.auth.id',
			createRule: '@request.auth.id != "" && family.members.id ?= @request.auth.id',
			updateRule: '@request.auth.id != "" && family.members.id ?= @request.auth.id',
			deleteRule: '@request.auth.id != "" && family.members.id ?= @request.auth.id'
		});
		app.save(calendars);

		const events = new Collection({
			name: 'events',
			type: 'base',
			fields: [
				{
					type: 'relation',
					name: 'calendar',
					collectionId: calendars.id,
					required: true,
					cascadeDelete: true,
					minSelect: 1,
					maxSelect: 1
				},
				{ type: 'text', name: 'title', required: true, max: 120 },
				{ type: 'text', name: 'description', max: 2000 },
				{ type: 'text', name: 'location', max: 200 },
				{ type: 'date', name: 'startsAt', required: true },
				{ type: 'date', name: 'endsAt' },
				{ type: 'bool', name: 'allDay' },
				{
					type: 'relation',
					name: 'createdBy',
					collectionId: '_pb_users_auth_',
					minSelect: 0,
					maxSelect: 1,
					cascadeDelete: false
				}
			],
			listRule: '@request.auth.id != "" && calendar.family.members.id ?= @request.auth.id',
			viewRule: '@request.auth.id != "" && calendar.family.members.id ?= @request.auth.id',
			createRule: '@request.auth.id != "" && calendar.family.members.id ?= @request.auth.id',
			updateRule: '@request.auth.id != "" && calendar.family.members.id ?= @request.auth.id',
			deleteRule: '@request.auth.id != "" && calendar.family.members.id ?= @request.auth.id'
		});
		app.save(events);
	},
	(app) => {
		const content = app.findCollectionByNameOrId('events');
		if (content) app.delete(content);

		const calendars = app.findCollectionByNameOrId('calendars');
		if (calendars) app.delete(calendars);

		const families = app.findCollectionByNameOrId('families');
		if (families) app.delete(families);
	}
);
