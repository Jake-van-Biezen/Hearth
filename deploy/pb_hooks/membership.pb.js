/// <reference path="../pb_data/types.d.ts" />
// Family membership automation. See membership.js and
// pb_migrations/1792700000_personal_calendars.js.

// New account (Google sign-in or admin UI): allowlisted emails join the family.
onRecordAfterCreateSuccess((e) => {
	e.next();
	require(`${__hooks}/membership.js`).autoJoin(e.app, e.record);
}, 'users');

// Members added (auto-join or by hand in the admin UI) get a personal calendar.
onRecordAfterCreateSuccess((e) => {
	e.next();
	require(`${__hooks}/membership.js`).ensurePersonal(e.app, e.record);
}, 'families');

onRecordAfterUpdateSuccess((e) => {
	e.next();
	require(`${__hooks}/membership.js`).ensurePersonal(e.app, e.record);
}, 'families');

// Catch up on boot: existing users, allowlist changes, members added while
// the hooks weren't deployed yet.
onBootstrap((e) => {
	e.next();
	try {
		require(`${__hooks}/membership.js`).reconcile(e.app);
	} catch (err) {
		e.app.logger().error('family: reconcile failed', 'error', String(err));
	}
});

// The update rule only sees the event's current calendar; make sure an edit
// can't move it into a calendar the user can't see (someone's private one,
// or another family's).
onRecordUpdateRequest((e) => {
	const target = e.record.getString('calendar');
	if (target !== e.record.original().getString('calendar')) {
		if (!require(`${__hooks}/membership.js`).canUseCalendar(e.app, e.auth, target)) {
			throw new BadRequestError("You can't move this event to that calendar.");
		}
	}
	e.next();
}, 'events');
