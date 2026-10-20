/// <reference path="../pb_data/types.d.ts" />
// Shared helpers for pb_hooks. Hook handlers run in isolated contexts, so
// they `require()` this file instead of closing over top-level functions.

/** Fields whose change is worth telling the family about. */
const TRACKED = ['title', 'startsAt', 'endsAt', 'allDay', 'calendar', 'description', 'location', 'recurrence', 'usesCar'];

function actorOf(auth) {
	// Superusers (admin UI) aren't family members and can't be a users relation.
	if (!auth || auth.collection().name !== 'users') return { id: '', name: '' };
	const name = auth.getString('name').trim() || auth.email().split('@')[0];
	return { id: auth.id, name: name };
}

/** Who can see events on this calendar: the family, or just a private calendar's owner. */
function audience(app, calendarId) {
	const calendar = app.findRecordById('calendars', calendarId);
	const family = app.findRecordById('families', calendar.getString('family'));
	const members =
		calendar.getString('visibility') === 'private'
			? [calendar.getString('owner')].filter(Boolean)
			: family.getStringSlice('members');
	return { calendar: calendar, family: family, members: members };
}

function write(app, col, uid, actor, aud, action, event) {
	const n = new Record(col);
	n.set('recipient', uid);
	n.set('actor', actor.id);
	n.set('actorName', actor.name);
	n.set('family', aud.family.id);
	n.set('calendar', aud.calendar.id);
	n.set('action', action);
	n.set('eventId', event.id);
	n.set('eventTitle', event.getString('title'));
	n.set('eventStartsAt', event.get('startsAt'));
	n.set('eventAllDay', event.getBool('allDay'));
	app.save(n);
}

module.exports = {
	/** True when an update touched something people would care about. */
	changed(before, after) {
		for (let i = 0; i < TRACKED.length; i++) {
			if (before.getString(TRACKED[i]) !== after.getString(TRACKED[i])) return true;
		}
		return false;
	},

	/**
	 * Write one notification per person who can see the event, except the actor.
	 * For updates pass `before`: when the event moves between a shared and a
	 * private calendar, people who lose sight of it get "removed" and people
	 * who gain it get "added".
	 * Never throws: a failed notification must not fail the event write.
	 */
	eventChanged(app, event, action, auth, before) {
		try {
			const actor = actorOf(auth);
			const col = app.findCollectionByNameOrId('notifications');
			const now = audience(app, event.getString('calendar'));
			const was =
				before && before.getString('calendar') !== event.getString('calendar')
					? audience(app, before.getString('calendar'))
					: now;

			for (let i = 0; i < now.members.length; i++) {
				const uid = now.members[i];
				if (uid === actor.id) continue;
				const kind = action === 'update' && was.members.indexOf(uid) === -1 ? 'create' : action;
				write(app, col, uid, actor, now, kind, event);
			}
			if (was !== now) {
				for (let i = 0; i < was.members.length; i++) {
					const uid = was.members[i];
					if (uid === actor.id || now.members.indexOf(uid) !== -1) continue;
					write(app, col, uid, actor, was, 'delete', before);
				}
			}
		} catch (err) {
			app.logger().error('notify: event ' + action + ' failed', 'event', event.id, 'error', String(err));
		}
	}
};
