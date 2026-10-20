import type { RecordModel } from 'pocketbase';
import { pb } from '$lib/pocketbase';
import { parseDate, formatTime } from '$lib/calendar';

export type FamilyNotification = RecordModel & {
	recipient: string;
	actor: string;
	actorName: string;
	family: string;
	calendar: string;
	action: 'create' | 'update' | 'delete';
	eventId: string;
	eventTitle: string;
	eventStartsAt: string;
	eventAllDay: boolean;
	readAt: string;
	created: string;
};

const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

function whenText(n: FamilyNotification): string {
	const start = parseDate(n.eventStartsAt);
	if (!start) return '';
	return n.eventAllDay ? dayFmt.format(start) : `${dayFmt.format(start)}, ${formatTime(start)}`;
}

/** Keep in sync with describe() in deploy/push/server.mjs (push text). */
export function describe(n: FamilyNotification): { title: string; body: string } {
	const who = n.actorName || 'Someone';
	const what = n.eventTitle || 'an event';
	const when = whenText(n);
	switch (n.action) {
		case 'create':
			return { title: `${who} added ${what}`, body: when };
		case 'update':
			return { title: `${who} changed ${what}`, body: when ? `Now ${when}` : '' };
		default:
			return { title: `${who} removed ${what}`, body: when ? `Was ${when}` : '' };
	}
}

/** "just now", "5 min ago", "3 h ago", "yesterday", "Mon 12 Oct". */
export function ago(value: string, now = new Date()): string {
	const d = parseDate(value);
	if (!d) return '';
	const min = Math.round((now.getTime() - d.getTime()) / 60_000);
	if (min < 1) return 'just now';
	if (min < 60) return `${min} min ago`;
	const h = Math.round(min / 60);
	if (h < 20) return `${h} h ago`;
	const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
	if (d >= y) return 'yesterday';
	return dayFmt.format(d);
}

export function loadNotifications(limit = 40): Promise<FamilyNotification[]> {
	return pb
		.collection('notifications')
		.getList<FamilyNotification>(1, limit, { sort: '-created', requestKey: 'hearth-notifs' })
		.then((r) => r.items);
}

export function markRead(id: string): Promise<unknown> {
	return pb.collection('notifications').update(id, { readAt: new Date().toISOString() });
}

export function markAllRead(): Promise<unknown> {
	return pb.send('/api/hearth/notifications/read-all', { method: 'POST' });
}

// ------------------------------------------------------------------ push --

/**
 * - unsupported: browser can't do Web Push, or the server has no VAPID key
 * - needs-install: iOS/iPadOS Safari tab; push only works from the Home Screen app
 * - blocked: the user (or browser) denied notification permission
 * - off / on: this device isn't / is subscribed
 */
export type PushState = 'unsupported' | 'needs-install' | 'blocked' | 'off' | 'on';

let serverKey: Promise<string | null> | null = null;
function vapidKey(): Promise<string | null> {
	serverKey ??= pb
		.send<{ key: string | null }>('/api/hearth/push/key', { method: 'GET' })
		.then((r) => r.key)
		.catch(() => {
			serverKey = null;
			return null;
		});
	return serverKey;
}

function isIos(): boolean {
	return (
		/iPad|iPhone|iPod/.test(navigator.userAgent) ||
		(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
	);
}

function isStandalone(): boolean {
	return (
		window.matchMedia('(display-mode: standalone)').matches ||
		(navigator as { standalone?: boolean }).standalone === true
	);
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
	if (!('serviceWorker' in navigator)) return null;
	// No SW in `pnpm dev`; don't wait forever for one.
	const reg = await navigator.serviceWorker.getRegistration();
	return reg ? navigator.serviceWorker.ready : null;
}

export async function pushState(): Promise<PushState> {
	if (isIos() && !isStandalone()) return 'needs-install';
	if (!('PushManager' in window) || !('Notification' in window)) return 'unsupported';
	const [reg, key] = await Promise.all([registration(), vapidKey()]);
	if (!reg || !key) return 'unsupported';
	if (Notification.permission === 'denied') return 'blocked';
	const sub = await reg.pushManager.getSubscription();
	return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
	const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
	const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
	const out = new Uint8Array(new ArrayBuffer(raw.length));
	for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
	return out;
}

/** Make sure the server knows this device's subscription (it may have been pruned). */
async function saveSubscription(sub: PushSubscription): Promise<void> {
	const uid = pb.authStore.record?.id;
	if (!uid) return;
	const json = sub.toJSON();
	const existing = await pb.collection('push_subscriptions').getList(1, 1, {
		filter: pb.filter('endpoint = {:ep}', { ep: sub.endpoint })
	});
	if (existing.items.length) return;
	await pb.collection('push_subscriptions').create({
		user: uid,
		endpoint: sub.endpoint,
		p256dh: json.keys?.p256dh ?? '',
		auth: json.keys?.auth ?? '',
		userAgent: navigator.userAgent.slice(0, 300)
	});
}

/** Must run from a user gesture (permission prompt). */
export async function enablePush(): Promise<PushState> {
	const [reg, key] = await Promise.all([registration(), vapidKey()]);
	if (!reg || !key) return 'unsupported';
	const permission = await Notification.requestPermission();
	if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';

	let sub = await reg.pushManager.getSubscription();
	// A subscription made with an older server key can't receive our pushes.
	if (sub && sub.options.applicationServerKey) {
		const current = new Uint8Array(sub.options.applicationServerKey);
		const wanted = keyBytes(key);
		if (current.length !== wanted.length || current.some((b, i) => b !== wanted[i])) {
			await sub.unsubscribe();
			sub = null;
		}
	}
	sub ??= await reg.pushManager.subscribe({
		userVisibleOnly: true,
		applicationServerKey: keyBytes(key)
	});
	await saveSubscription(sub);
	return 'on';
}

export async function disablePush(): Promise<PushState> {
	const reg = await registration();
	const sub = await reg?.pushManager.getSubscription();
	if (sub) {
		const found = await pb.collection('push_subscriptions').getList(1, 1, {
			filter: pb.filter('endpoint = {:ep}', { ep: sub.endpoint })
		});
		await Promise.all(found.items.map((r) => pb.collection('push_subscriptions').delete(r.id)));
		await sub.unsubscribe();
	}
	return 'off';
}

/** On app start: re-register an existing subscription with the server if needed. */
export async function syncPush(): Promise<void> {
	try {
		if ((await pushState()) !== 'on') return;
		const sub = await (await registration())?.pushManager.getSubscription();
		if (sub) await saveSubscription(sub);
	} catch {
		// Best effort; the inbox still works without push.
	}
}

/** Forget this device's subscription on sign-out so the next account gets a clean slate. */
export async function forgetPushOnSignOut(): Promise<void> {
	try {
		await disablePush();
	} catch {
		// Offline sign-out: the next account to sign in on this device takes the
		// endpoint over via syncPush (pb_hooks drops the old owner's row).
	}
}
