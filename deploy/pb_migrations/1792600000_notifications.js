/// <reference path="../pb_data/types.d.ts" />
// Family notifications: one `notifications` row per recipient, written by
// pb_hooks/events_notify.pb.js when a member adds, edits or deletes an event.
// The push sidecar (deploy/push) delivers each row as a Web Push to the
// recipient's `push_subscriptions` and stamps `pushedAt`.
migrate(
	(app) => {
		const families = app.findCollectionByNameOrId('families');
		const calendars = app.findCollectionByNameOrId('calendars');

		const notifications = new Collection({
			name: 'notifications',
			type: 'base',
			fields: [
				{
					type: 'relation',
					name: 'recipient',
					collectionId: '_pb_users_auth_',
					required: true,
					cascadeDelete: true,
					minSelect: 1,
					maxSelect: 1
				},
				{
					type: 'relation',
					name: 'actor',
					collectionId: '_pb_users_auth_',
					cascadeDelete: false,
					minSelect: 0,
					maxSelect: 1
				},
				{ type: 'text', name: 'actorName', max: 120 },
				{
					type: 'relation',
					name: 'family',
					collectionId: families.id,
					required: true,
					cascadeDelete: true,
					minSelect: 1,
					maxSelect: 1
				},
				{
					type: 'relation',
					name: 'calendar',
					collectionId: calendars.id,
					cascadeDelete: true,
					minSelect: 0,
					maxSelect: 1
				},
				{
					type: 'select',
					name: 'action',
					required: true,
					maxSelect: 1,
					values: ['create', 'update', 'delete']
				},
				// Plain id, not a relation: the event may be gone (action=delete).
				{ type: 'text', name: 'eventId', max: 32 },
				{ type: 'text', name: 'eventTitle', max: 120 },
				{ type: 'date', name: 'eventStartsAt' },
				{ type: 'bool', name: 'eventAllDay' },
				{ type: 'date', name: 'readAt' },
				{ type: 'date', name: 'pushedAt' },
				{ type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
				{ type: 'autodate', name: 'updated', onCreate: true, onUpdate: true }
			],
			indexes: [
				'CREATE INDEX idx_notifications_recipient ON notifications (recipient, created)',
				'CREATE INDEX idx_notifications_pushed ON notifications (pushedAt)'
			],
			listRule: '@request.auth.id != "" && recipient = @request.auth.id',
			viewRule: '@request.auth.id != "" && recipient = @request.auth.id',
			createRule: null,
			// Recipients may only mark read: every other field is locked.
			updateRule:
				'@request.auth.id != "" && recipient = @request.auth.id' +
				' && @request.body.recipient:isset = false && @request.body.actor:isset = false' +
				' && @request.body.actorName:isset = false && @request.body.family:isset = false' +
				' && @request.body.calendar:isset = false && @request.body.action:isset = false' +
				' && @request.body.eventId:isset = false && @request.body.eventTitle:isset = false' +
				' && @request.body.eventStartsAt:isset = false && @request.body.eventAllDay:isset = false' +
				' && @request.body.pushedAt:isset = false',
			deleteRule: '@request.auth.id != "" && recipient = @request.auth.id'
		});
		app.save(notifications);

		const subscriptions = new Collection({
			name: 'push_subscriptions',
			type: 'base',
			fields: [
				{
					type: 'relation',
					name: 'user',
					collectionId: '_pb_users_auth_',
					required: true,
					cascadeDelete: true,
					minSelect: 1,
					maxSelect: 1
				},
				{ type: 'url', name: 'endpoint', required: true },
				{ type: 'text', name: 'p256dh', required: true, max: 200 },
				{ type: 'text', name: 'auth', required: true, max: 100 },
				{ type: 'text', name: 'userAgent', max: 300 },
				{ type: 'autodate', name: 'created', onCreate: true, onUpdate: false }
			],
			indexes: ['CREATE UNIQUE INDEX idx_push_subscriptions_endpoint ON push_subscriptions (endpoint)'],
			listRule: '@request.auth.id != "" && user = @request.auth.id',
			viewRule: '@request.auth.id != "" && user = @request.auth.id',
			createRule: '@request.auth.id != "" && @request.body.user = @request.auth.id',
			updateRule: null,
			deleteRule: '@request.auth.id != "" && user = @request.auth.id'
		});
		app.save(subscriptions);
	},
	(app) => {
		for (const name of ['push_subscriptions', 'notifications']) {
			try {
				app.delete(app.findCollectionByNameOrId(name));
			} catch {
				// already gone
			}
		}
	}
);
