/// <reference path="../pb_data/types.d.ts" />
// Family membership helpers, shared by membership.pb.js (hook handlers run in
// isolated contexts, so they `require()` this file).
//
// Env:
//   HEARTH_FAMILY_EMAILS  comma-separated emails that join the family on signup
//   HEARTH_FAMILY_ID      family they join; optional when only one family exists

/** Distinct from each other and from the default shared blue. */
const PERSONAL_COLORS = ['#3b9e6b', '#d9b12e', '#c0392b', '#8e5bb5', '#e07b39', '#2a9d9a', '#c2577f'];

function allowlist() {
	return ($os.getenv('HEARTH_FAMILY_EMAILS') || '')
		.split(',')
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean);
}

function targetFamily(app) {
	const id = $os.getenv('HEARTH_FAMILY_ID');
	if (id) return app.findRecordById('families', id);
	const all = app.findRecordsByFilter('families', '', '', 2, 0);
	if (all.length === 1) return all[0];
	throw new Error(all.length ? 'several families: set HEARTH_FAMILY_ID' : 'no family yet');
}

function firstName(user) {
	const name = user.getString('name').trim();
	if (name) return name.split(/\s+/)[0].slice(0, 80);
	return user.email().split('@')[0].slice(0, 80);
}

function pickColor(app, familyId) {
	const used = {};
	const cals = app.findRecordsByFilter('calendars', 'family = {:f}', '', 0, 0, { f: familyId });
	for (let i = 0; i < cals.length; i++) used[cals[i].getString('color').toLowerCase()] = true;
	for (let i = 0; i < PERSONAL_COLORS.length; i++) {
		if (!used[PERSONAL_COLORS[i]]) return PERSONAL_COLORS[i];
	}
	return PERSONAL_COLORS[cals.length % PERSONAL_COLORS.length];
}

module.exports = {
	/** Allowlisted user not yet in the family: add them. Saving the family runs ensurePersonal. */
	autoJoin(app, user) {
		if (allowlist().indexOf(user.email().toLowerCase()) === -1) return;
		try {
			const family = targetFamily(app);
			const members = family.getStringSlice('members');
			if (members.indexOf(user.id) !== -1) return;
			family.set('members', members.concat([user.id]));
			app.save(family);
			app.logger().info('family: auto-joined', 'email', user.email(), 'family', family.id);
		} catch (err) {
			app.logger().error('family: auto-join failed', 'email', user.email(), 'error', String(err));
		}
	},

	/** Every member of `family` gets one private calendar (idempotent). */
	ensurePersonal(app, family) {
		// Boot hooks run before migrations: on a fresh install the collection
		// may not exist yet, and on the first deploy of personal calendars the
		// migration creates them instead.
		let col;
		try {
			col = app.findCollectionByNameOrId('calendars');
		} catch {
			return;
		}
		if (!col.fields.getByName('owner')) return;
		const members = family.getStringSlice('members');
		for (let i = 0; i < members.length; i++) {
			const uid = members[i];
			try {
				const have = app.findRecordsByFilter(
					'calendars',
					'family = {:f} && owner = {:u}',
					'',
					1,
					0,
					{ f: family.id, u: uid }
				);
				if (have.length) continue;
				const user = app.findRecordById('users', uid);
				const cal = new Record(col);
				cal.set('family', family.id);
				cal.set('owner', uid);
				cal.set('name', firstName(user));
				cal.set('color', pickColor(app, family.id));
				cal.set('visibility', 'private');
				app.save(cal);
				app.logger().info('family: personal calendar created', 'user', uid, 'family', family.id);
			} catch (err) {
				app.logger().error('family: personal calendar failed', 'user', uid, 'error', String(err));
			}
		}
	},

	/** Startup sweep: allowlisted existing users join; every member has a personal calendar. */
	reconcile(app) {
		try {
			app.findCollectionByNameOrId('families');
		} catch {
			return; // fresh install, migrations haven't run yet
		}
		const emails = allowlist();
		for (let i = 0; i < emails.length; i++) {
			try {
				module.exports.autoJoin(app, app.findAuthRecordByEmail('users', emails[i]));
			} catch {
				// hasn't signed up yet
			}
		}
		const families = app.findRecordsByFilter('families', '', '', 0, 0);
		for (let i = 0; i < families.length; i++) module.exports.ensurePersonal(app, families[i]);
	},

	/** Can `auth` put events in calendar `calId`? Mirrors the events API rules. */
	canUseCalendar(app, auth, calId) {
		if (!auth || auth.collection().name !== 'users') return true; // superuser
		let cal;
		try {
			cal = app.findRecordById('calendars', calId);
		} catch {
			return false;
		}
		const family = app.findRecordById('families', cal.getString('family'));
		if (family.getStringSlice('members').indexOf(auth.id) === -1) return false;
		return cal.getString('visibility') !== 'private' || cal.getString('owner') === auth.id;
	}
};
