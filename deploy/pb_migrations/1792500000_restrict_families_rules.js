/// <reference path="../pb_data/types.d.ts" />
// Restrict families list/view to members. Previously any signed-in user could
// list every family on the server.
migrate(
	(app) => {
		const families = app.findCollectionByNameOrId('families');
		families.listRule = '@request.auth.id != "" && members.id ?= @request.auth.id';
		families.viewRule = '@request.auth.id != "" && members.id ?= @request.auth.id';
		families.updateRule = '@request.auth.id != "" && members.id ?= @request.auth.id';
		return app.save(families);
	},
	(app) => {
		const families = app.findCollectionByNameOrId('families');
		families.listRule = '@request.auth.id != "" && id != ""';
		families.viewRule = '@request.auth.id != "" && id != ""';
		families.updateRule = 'members.id ?= @request.auth.id';
		return app.save(families);
	}
);
