/// <reference path="../pb_data/types.d.ts" />
// Per-person event reminders. Each row says "ping me `minutesBefore` before
// this event starts". The push sidecar (deploy/push/server.mjs) reads these,
// works out the fire time from the event's current start, and sends a Web
// Push to the owner's devices. `firedFor` records the start/offset combination
// already delivered, so moving the event or changing the offset re-arms it.
migrate(
	(app) => {
		const users = '_pb_users_auth_';

		const reminders = new Collection({
			name: 'reminders',
			type: 'base',
			fields: [
				{
					type: 'relation',
					name: 'user',
					collectionId: users,
					required: true,
					cascadeDelete: true,
					minSelect: 1,
					maxSelect: 1
				},
				// Plain id, not a relation: the sidecar drops rows whose event is gone.
				{ type: 'text', name: 'event', required: true, max: 32 },
				{ type: 'number', name: 'minutesBefore', required: true, min: 0, max: 10080, onlyInt: true },
				{ type: 'text', name: 'firedFor', max: 80 },
				{ type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
				{ type: 'autodate', name: 'updated', onCreate: true, onUpdate: true }
			],
			indexes: ['CREATE UNIQUE INDEX idx_reminders_user_event ON reminders (user, event)'],
			listRule: '@request.auth.id != "" && user = @request.auth.id',
			viewRule: '@request.auth.id != "" && user = @request.auth.id',
			createRule: '@request.auth.id != "" && @request.body.user = @request.auth.id',
			updateRule:
				'@request.auth.id != "" && user = @request.auth.id && @request.body.user:isset = false' +
				' && @request.body.event:isset = false',
			deleteRule: '@request.auth.id != "" && user = @request.auth.id'
		});
		app.save(reminders);
	},
	(app) => {
		try {
			app.delete(app.findCollectionByNameOrId('reminders'));
		} catch {
			// already gone
		}
	}
);
