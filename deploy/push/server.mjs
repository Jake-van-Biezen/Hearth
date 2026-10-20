// Hearth push sidecar.
//
// PocketBase hooks write a `notifications` row per recipient whenever a family
// member adds, edits or deletes an event. This service watches that collection
// (realtime + a periodic sweep for anything missed while it was down) and
// delivers each row as a Web Push to every device the recipient subscribed,
// then stamps `pushedAt`. Dead subscriptions (404/410) are removed.
//
// PocketBase's JSVM can't do VAPID signing or payload encryption, hence this
// separate process.

import { EventSource } from 'eventsource';
import PocketBase from 'pocketbase';
import webpush from 'web-push';

globalThis.EventSource ??= EventSource;

function env(name, fallback) {
	const value = process.env[name] || fallback;
	if (!value) {
		console.error(`push: missing env ${name}`);
		process.exit(1);
	}
	return value;
}

const PB_URL = env('PB_URL', 'http://hearth:8090');
const EMAIL = env('HEARTH_PUSH_EMAIL');
const PASSWORD = env('HEARTH_PUSH_PASSWORD');
const TZ = env('TZ', 'Europe/Amsterdam');
/** Don't push a backlog older than this after downtime; it'd just be noise. */
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const SWEEP_MS = 60 * 1000;

webpush.setVapidDetails(
	env('VAPID_SUBJECT', 'mailto:hearth@localhost'),
	env('VAPID_PUBLIC_KEY'),
	env('VAPID_PRIVATE_KEY')
);

const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);

const log = (...args) => console.log(new Date().toISOString(), ...args);

// ---------------------------------------------------------------- text --

const dayFmt = new Intl.DateTimeFormat('en-GB', {
	timeZone: TZ,
	weekday: 'short',
	day: 'numeric',
	month: 'short'
});
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const isoDayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }); // yyyy-mm-dd

const parse = (v) => (v ? new Date(String(v).replace(' ', 'T')) : null);

/** Keep in sync with describe() in src/lib/notifications.ts. */
function describe(n) {
	const who = n.actorName || 'Someone';
	const what = n.eventTitle || 'an event';
	const start = parse(n.eventStartsAt);
	const when = start ? (n.eventAllDay ? dayFmt.format(start) : `${dayFmt.format(start)}, ${timeFmt.format(start)}`) : '';
	switch (n.action) {
		case 'create':
			return { title: `${who} added ${what}`, body: when };
		case 'update':
			return { title: `${who} changed ${what}`, body: when ? `Now ${when}` : '' };
		default:
			return { title: `${who} removed ${what}`, body: when ? `Was ${when}` : '' };
	}
}

function payloadFor(n) {
	const start = parse(n.eventStartsAt);
	const params = new URLSearchParams({ n: n.id });
	if (start) params.set('day', isoDayFmt.format(start));
	if (n.action !== 'delete' && n.eventId) params.set('event', n.eventId);
	return JSON.stringify({
		...describe(n),
		// Same event replaces its earlier notification instead of stacking.
		tag: `event-${n.eventId || n.id}`,
		url: `/calendar?${params}`
	});
}

// ---------------------------------------------------------------- send --

const inFlight = new Set();

async function deliver(n) {
	if (n.pushedAt || inFlight.has(n.id)) return;
	if (Date.now() - parse(n.created).getTime() > MAX_AGE_MS) return;
	inFlight.add(n.id);
	try {
		const subs = await pb.collection('push_subscriptions').getFullList({
			filter: pb.filter('user = {:uid}', { uid: n.recipient })
		});
		const payload = payloadFor(n);
		let sent = 0;
		await Promise.all(
			subs.map(async (s) => {
				try {
					await webpush.sendNotification(
						{ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
						payload,
						{ TTL: 24 * 60 * 60, urgency: 'normal' }
					);
					sent++;
				} catch (err) {
					if (err.statusCode === 404 || err.statusCode === 410) {
						log(`push: subscription ${s.id} gone, removing`);
						await pb.collection('push_subscriptions').delete(s.id).catch(() => {});
					} else {
						log(`push: send to ${s.id} failed`, err.statusCode ?? '', err.body ?? err.message);
					}
				}
			})
		);
		await pb.collection('notifications').update(n.id, { pushedAt: new Date().toISOString() });
		log(`push: ${n.id} (${n.action}) -> ${sent}/${subs.length} device(s)`);
	} catch (err) {
		log(`push: ${n.id} failed, will retry on next sweep`, err.message);
	} finally {
		inFlight.delete(n.id);
	}
}

async function sweep() {
	try {
		const since = new Date(Date.now() - MAX_AGE_MS).toISOString().replace('T', ' ');
		const pending = await pb.collection('notifications').getFullList({
			filter: pb.filter('pushedAt = "" && created >= {:since}', { since }),
			sort: 'created'
		});
		for (const n of pending) await deliver(n);
	} catch (err) {
		log('push: sweep failed', err.message);
	}
}

// ---------------------------------------------------------------- boot --

async function login() {
	for (let delay = 2000; ; delay = Math.min(delay * 2, 60000)) {
		try {
			// Re-auths transparently before the token expires.
			await pb.collection('_superusers').authWithPassword(EMAIL, PASSWORD, {
				autoRefreshThreshold: 30 * 60
			});
			return;
		} catch (err) {
			log(`push: login to ${PB_URL} failed (${err.status ?? err.message}), retrying in ${delay / 1000}s`);
			await new Promise((r) => setTimeout(r, delay));
		}
	}
}

await login();
log(`push: connected to ${PB_URL}`);

await pb.collection('notifications').subscribe('*', (e) => {
	if (e.action === 'create') deliver(e.record);
});
// PB_CONNECT fires on reconnects (the first connect already happened above):
// catch up on anything created while the stream was down.
await pb.realtime.subscribe('PB_CONNECT', () => sweep());
await sweep();
setInterval(sweep, SWEEP_MS);

for (const sig of ['SIGINT', 'SIGTERM']) {
	process.on(sig, () => {
		log(`push: ${sig}, bye`);
		process.exit(0);
	});
}
