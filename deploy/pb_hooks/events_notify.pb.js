/// <reference path="../pb_data/types.d.ts" />
// Family notifications. See notify.js and pb_migrations/1792600000_notifications.js.
//
// Request hooks (not model hooks) so we know who acted: the actor is skipped,
// everyone else in the family gets a `notifications` row. Events on a private
// calendar notify only its owner. Admin-UI edits run as a superuser, so every
// member (or the private calendar's owner) is notified.

onRecordCreateRequest((e) => {
	e.next();
	// A split-off occurrence reads as an edit to the family ("moved this
	// day"), not as a brand-new event.
	const split = e.record.getString('occurrenceOf');
	require(`${__hooks}/notify.js`).eventChanged(
		e.app,
		e.record,
		split ? 'update' : 'create',
		e.auth
	);
}, 'events');

onRecordUpdateRequest((e) => {
	const notify = require(`${__hooks}/notify.js`);
	const before = e.record.original();
	e.next();
	if (notify.changed(before, e.record)) notify.eventChanged(e.app, e.record, 'update', e.auth, before);
}, 'events');

onRecordDeleteRequest((e) => {
	e.next();
	require(`${__hooks}/notify.js`).eventChanged(e.app, e.record, 'delete', e.auth);
}, 'events');

// A browser endpoint belongs to whoever subscribed last on that device
// (e.g. after switching accounts). Drop the old owner's row first so the
// unique endpoint index doesn't reject the new one.
onRecordCreateRequest((e) => {
	const endpoint = e.record.getString('endpoint');
	try {
		const old = e.app.findFirstRecordByData('push_subscriptions', 'endpoint', endpoint);
		e.app.delete(old);
	} catch {
		// none yet
	}
	e.next();
}, 'push_subscriptions');

// Mark every unread notification of the signed-in user as read in one call.
routerAdd(
	'POST',
	'/api/hearth/notifications/read-all',
	(e) => {
		e.app
			.db()
			.newQuery(
				"UPDATE notifications SET readAt = {:now} WHERE recipient = {:uid} AND (readAt = '' OR readAt IS NULL)"
			)
			.bind({ now: new DateTime().string(), uid: e.auth.id })
			.execute();
		return e.noContent(204);
	},
	$apis.requireAuth('users')
);
