/// <reference path="../pb_data/types.d.ts" />
// Wiring for the push sidecar (deploy/push). Both read the same env:
//   HEARTH_PUSH_EMAIL / HEARTH_PUSH_PASSWORD  superuser the sidecar logs in as
//   VAPID_PUBLIC_KEY                          handed to browsers to subscribe

// Keep the sidecar's superuser in sync with env on every boot (idempotent,
// so rotating the password is just: change .env, restart).
onBootstrap((e) => {
	e.next();
	const email = $os.getenv('HEARTH_PUSH_EMAIL');
	const password = $os.getenv('HEARTH_PUSH_PASSWORD');
	if (!email || !password) return;

	let su;
	try {
		su = e.app.findAuthRecordByEmail('_superusers', email);
	} catch {
		su = new Record(e.app.findCollectionByNameOrId('_superusers'));
		su.setEmail(email);
	}
	if (su.isNew() || !su.validatePassword(password)) {
		su.setPassword(password);
		e.app.save(su);
		e.app.logger().info('push: superuser synced', 'email', email);
	}
});

// Public VAPID key for PushManager.subscribe(); null when push isn't set up.
routerAdd('GET', '/api/hearth/push/key', (e) => {
	return e.json(200, { key: $os.getenv('VAPID_PUBLIC_KEY') || null });
});
