// Web Push handlers, pulled into the generated Workbox service worker via
// `workbox.importScripts` (vite.config.ts). Payloads come from deploy/push:
//   { title, body, tag, url }

self.addEventListener('push', (event) => {
	let data = {};
	try {
		data = event.data ? event.data.json() : {};
	} catch {
		data = { body: event.data ? event.data.text() : '' };
	}

	event.waitUntil(
		self.registration.showNotification(data.title || 'Hearth', {
			body: data.body || '',
			tag: data.tag,
			// A changed event replaces its old notification; still buzz for it.
			renotify: Boolean(data.tag),
			icon: '/icons/pwa-192.png',
			lang: 'en',
			data: { url: data.url || '/calendar' }
		})
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = new URL(event.notification.data?.url || '/calendar', self.location.origin).href;

	event.waitUntil(
		(async () => {
			const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
			const open = windows.find((c) => new URL(c.url).origin === self.location.origin);
			if (open) {
				// Let the running app route client-side instead of a full reload.
				open.postMessage({ type: 'hearth:navigate', url });
				try {
					await open.focus();
				} catch {
					// Browser refused focus (no user activation); the app still moved.
				}
				return;
			}
			await self.clients.openWindow(url);
		})()
	);
});
