import { pb } from "$lib/pocketbase";
import { parseDate, seriesNext } from "$lib/recur";
import type { Calendar, CalendarEvent, Family } from "$lib/calendar";
import type { FamilyNotification } from "$lib/notifications";

// Offline mode: reads fall back to a localStorage cache, writes queue up
// and flush to the server once the home server answers again. The calendar
// page watches the `offline` state object; loaders live in calendar.ts.

export type EventPayload = {
  calendar: string;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  recurrence: string;
  usesCar: boolean;
  createdBy?: string;
};

export type SaveResult = "sent" | "queued";

/** Everything a queued event op may carry, beyond the plain event fields. */
export type EventPatch = Partial<Omit<EventPayload, "createdBy">> & {
  exceptions?: { d: string }[];
  occurrenceOf?: string;
  originDate?: string;
};

export const offline = $state({
  /** A health check (not just wifi) says the home server answers. */
  online: true,
  /** Saved changes waiting to be sent. */
  queued: 0,
  /** A sync run is sending queued changes. */
  syncing: false,
  /** Why the last queued change was dropped, or "" while all is well. */
  failed: "",
});

const DAY = 86_400_000;
const KEEP_DAYS = 56;
const LOCAL_PREFIX = "local-";

type QueuedOp = {
  kind:
    "create" | "update" | "delete" | "split" | "except" | "read" | "readAll";
  fid?: string;
  localId?: string;
  /** Record id the op acts on; a temp id when the record was made offline. */
  id?: string;
  seriesId?: string;
  key?: string;
  data?: Record<string, unknown>;
  readAt?: string;
  /** localId of the offline record this op needs; dropped if that op fails. */
  after?: string;
};

let userId = "";
let queue: QueuedOp[] = [];
/** localId -> server id, for ops whose record was created offline. */
let ids = new Map<string, string>();
let flushing = false;
let probing = false;
let listenersStarted = false;
const restoreHooks = new Set<() => void>();

// ------------------------------------------------------------ storage ----

const evKey = (fid: string) => `hearth:cache:v1:events:${fid}`;
const calKey = (fid: string) => `hearth:cache:v1:calendars:${fid}`;
const famKey = (uid: string) => `hearth:cache:v1:family:${uid}`;
const updKey = (uid: string) => `hearth:cache:v1:updates:${uid}`;
const queueKey = (uid: string) => `hearth:queue:v1:${uid}`;
const idsKey = (uid: string) => `hearth:queue-ids:v1:${uid}`;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or private mode: offline support quietly degrades.
  }
}

type EventStore = { events: Record<string, CalendarEvent> };

function eventStore(fid: string): EventStore {
  return read<EventStore>(evKey(fid)) ?? { events: {} };
}

/** Server ids a queued op still has to touch; the cache is ahead of the server for them. */
function pendingIds(): Set<string> {
  const out = new Set<string>();
  for (const op of queue) {
    if (op.id) out.add(ids.get(op.id) ?? op.id);
    if (op.seriesId) out.add(ids.get(op.seriesId) ?? op.seriesId);
  }
  return out;
}

/**
 * Stash fetched records. With `covers`, `records` is the server's complete
 * answer for that slice: cached records the slice should hold but the
 * server didn't return were deleted (here or on another device), so they go
 * too. Without this a deleted event lives on in the cache and flashes up
 * every time a week paints from it before the network answers.
 */
export function saveEvents(
  fid: string,
  records: CalendarEvent[],
  covers?: (ev: CalendarEvent) => boolean,
): void {
  if (!fid) return;
  const store = eventStore(fid);
  let dirty = false;
  if (covers) {
    const fresh = new Set(records.map((r) => r?.id));
    const pending = pendingIds();
    for (const [id, ev] of Object.entries(store.events)) {
      if (fresh.has(id) || id.startsWith(LOCAL_PREFIX) || pending.has(id))
        continue;
      if (covers(ev)) {
        delete store.events[id];
        dirty = true;
      }
    }
  }
  for (const rec of records) {
    if (!rec?.id) continue;
    if (JSON.stringify(store.events[rec.id]) !== JSON.stringify(rec)) {
      store.events[rec.id] = rec;
      dirty = true;
    }
  }
  const horizon = Date.now() - KEEP_DAYS * DAY;
  for (const [id, ev] of Object.entries(store.events)) {
    if (ev.recurrence || id.startsWith(LOCAL_PREFIX)) continue;
    const end = parseDate(ev.endsAt ?? "") ?? parseDate(ev.startsAt ?? "");
    if (!end || end.getTime() < horizon) {
      delete store.events[id];
      dirty = true;
    }
  }
  if (dirty) write(evKey(fid), store);
}

function stashEvent(fid: string, rec: CalendarEvent): void {
  const store = eventStore(fid);
  store.events[rec.id] = rec;
  write(evKey(fid), store);
}

function purgeEvent(fid: string, id: string): void {
  const store = eventStore(fid);
  if (!store.events[id]) return;
  delete store.events[id];
  // A deleted series takes its split-offs with it, like the server hook.
  for (const [other, ev] of Object.entries(store.events)) {
    if (ev.occurrenceOf === id) delete store.events[other];
  }
  write(evKey(fid), store);
}

function patchEvent(fid: string, id: string, patch: Partial<EventPatch>): void {
  const store = eventStore(fid);
  const ev = store.events[id];
  if (!ev) return;
  store.events[id] = { ...ev, ...patch };
  write(evKey(fid), store);
}

function addException(fid: string, id: string, key: string): void {
  const store = eventStore(fid);
  const ev = store.events[id];
  if (!ev) return;
  const others = (ev.exceptions ?? []).filter((x) => x.d !== key);
  store.events[id] = { ...ev, exceptions: [...others, { d: key }] };
  write(evKey(fid), store);
}

export function cachedEvents(fid: string): CalendarEvent[] {
  return Object.values(eventStore(fid).events);
}

/**
 * The cache holds every event this device has fetched for the family (the
 * window loaders stash their hits), so weeks never browsed may come up
 * empty; that still beats showing nothing.
 */
export function cachedWindowEvents(
  fid: string,
  start: Date,
  end: Date,
): CalendarEvent[] {
  return cachedEvents(fid).filter(inWindow(start, end));
}

/** Client mirror of calendar.ts WINDOW_FILTER: does the window query return `ev`? */
export function inWindow(
  start: Date,
  end: Date,
): (ev: CalendarEvent) => boolean {
  const s = start.getTime();
  const e = end.getTime();
  return (ev) => {
    const st = parseDate(ev.startsAt);
    if (!st) return false;
    const en = parseDate(ev.endsAt ?? "") ?? st;
    if (st.getTime() >= e) return false;
    return (
      st.getTime() >= s ||
      en.getTime() > s ||
      (!!ev.recurrence && st.getTime() < s)
    );
  };
}

/** Drop an event (and its split-offs) the server says is gone. */
export function forgetEvent(fid: string, id: string): void {
  if (fid && id) purgeEvent(fid, id);
}

/** Mirror of loadNextUp's server queries, over the cache. */
export function cachedNextUp(fid: string, now: Date): CalendarEvent | null {
  let best: CalendarEvent | null = null;
  let bestAt = Infinity;
  for (const ev of cachedEvents(fid)) {
    if (ev.allDay) continue;
    const st = parseDate(ev.startsAt);
    if (!st) continue;
    let iso = ev.startsAt;
    let at = st.getTime();
    if (at < now.getTime()) {
      if (!ev.recurrence) continue;
      const occ = seriesNext(ev, now);
      if (!occ) continue;
      iso = occ.toISOString();
      at = occ.getTime();
    }
    if (at < bestAt) {
      best = { ...ev, startsAt: iso };
      bestAt = at;
    }
  }
  return best;
}

export function saveCachedFamily(uid: string, family: Family): void {
  localStorage.setItem(famKey(uid), JSON.stringify(family));
}

export function cachedFamily(uid: string): Family | null {
  return read<Family>(famKey(uid));
}

export function saveCachedCalendars(fid: string, calendars: Calendar[]): void {
  write(calKey(fid), { calendars });
}

export function cachedCalendars(fid: string): Calendar[] {
  return read<{ calendars: Calendar[] }>(calKey(fid))?.calendars ?? [];
}

export function saveCachedUpdates(
  uid: string,
  items: FamilyNotification[],
): void {
  write(updKey(uid), { items: items.slice(0, 60) });
}

export function cachedUpdates(uid: string): FamilyNotification[] {
  return read<{ items: FamilyNotification[] }>(updKey(uid))?.items ?? [];
}

export function clearCachedData(uid: string, fid?: string): void {
  localStorage.removeItem(famKey(uid));
  localStorage.removeItem(updKey(uid));
  if (fid) {
    localStorage.removeItem(evKey(fid));
    localStorage.removeItem(calKey(fid));
  }
  // The queue survives: saved changes still belong to this account.
}

// ------------------------------------------------------- connectivity ----

export function isNetError(err: unknown): boolean {
  const e = err as { status?: number; isAbort?: boolean };
  return typeof e?.status === "number" && e.status === 0 && !e.isAbort;
}

export function noteOnline(): void {
  offline.online = true;
}

export function noteOffline(): void {
  offline.online = false;
}

function persistQueue(): void {
  if (userId) write(queueKey(userId), queue);
}

function persistIds(): void {
  if (userId) write(idsKey(userId), Object.fromEntries(ids));
}

/** Bind the queue to the signed-in account (and try to drain what's there). */
export function setUser(uid: string): void {
  userId = uid;
  queue = read<QueuedOp[]>(queueKey(uid)) ?? [];
  offline.queued = queue.length;
  ids = new Map(
    Object.entries(read<Record<string, string>>(idsKey(uid)) ?? {}),
  );
  offline.failed = "";
  if (queue.length) void nudge();
}

/** Run once at app boot: watch for the connection coming back and drain. */
export function startSync(): void {
  if (listenersStarted) return;
  listenersStarted = true;
  offline.online = navigator.onLine;
  window.addEventListener("online", () => void nudge());
  window.addEventListener("offline", () => noteOffline());
  document.addEventListener("visibilitychange", () => {
    if (
      document.visibilityState === "visible" &&
      (!offline.online || queue.length)
    )
      void nudge();
  });
  window.setInterval(() => {
    if (!offline.online || (queue.length && !flushing)) void nudge();
  }, 20_000);
}

/** Reconnect hook for pages: fires once queued changes are all sent. */
export function onRestore(fn: () => void): () => void {
  restoreHooks.add(fn);
  return () => restoreHooks.delete(fn);
}

function notifyRestore(): void {
  for (const fn of restoreHooks) fn();
}

/**
 * Probe the NAS itself (health endpoint): navigator.onLine stays true on
 * hotel wifi without Tailscale, so a request-based answer is the truth.
 */
async function probe(): Promise<boolean> {
  try {
    const res = await fetch(pb.buildURL("/api/health"), {
      signal: AbortSignal.timeout(6000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Connect the dots: probe, flip the flag, drain the queue, notify. */
export async function nudge(): Promise<void> {
  if (probing || flushing || !userId) return;
  probing = true;
  try {
    const ok = await probe();
    offline.online = ok;
    if (!ok) return;
    if (queue.length) await flushQueue();
    if (!queue.length) notifyRestore();
  } finally {
    probing = false;
  }
}

// ---------------------------------------------------------------- queue ----

/**
 * How each queued op reaches the server. Returns the server id of any
 * record it created, so later ops that named the local record can follow.
 */
async function sendOp(op: QueuedOp): Promise<{ id?: string }> {
  switch (op.kind) {
    case "create": {
      const rec = await pb.collection("events").create<CalendarEvent>(op.data);
      if (op.fid) {
        stashEvent(op.fid, rec);
        purgeEvent(op.fid, op.localId!);
      }
      return { id: rec.id };
    }
    case "update": {
      const id = ids.get(op.id!) ?? op.id!;
      const rec = await pb
        .collection("events")
        .update<CalendarEvent>(id, op.data);
      if (op.fid) {
        stashEvent(op.fid, rec);
        if (rec.id !== op.id) purgeEvent(op.fid, op.id!);
      }
      return {};
    }
    case "delete": {
      const id = ids.get(op.id!) ?? op.id!;
      try {
        await pb.collection("events").delete(id);
      } catch (err) {
        // Already gone (another device, or the series took it along):
        // that's the outcome we wanted, so just forget it here too.
        if ((err as { status?: number }).status !== 404) throw err;
      }
      if (op.fid) purgeEvent(op.fid, id);
      return {};
    }
    case "split": {
      const sid = ids.get(op.seriesId!) ?? op.seriesId!;
      const base = await pb.collection("events").getOne<CalendarEvent>(sid);
      const others = (base.exceptions ?? []).filter((x) => x.d !== op.key);
      const batch = pb.createBatch();
      batch
        .collection("events")
        .update(base.id, { exceptions: [...others, { d: op.key }] });
      batch
        .collection("events")
        .create({ ...op.data, occurrenceOf: sid, originDate: op.key });
      await batch.send();
      // The batch response doesn't echo the new id; look the split up so
      // later queued edits of this occurrence land on the right record.
      const standalone = await pb
        .collection("events")
        .getFirstListItem<CalendarEvent>(
          pb.filter("occurrenceOf = {:sid} && originDate = {:key}", {
            sid,
            key: op.key,
          }),
          { requestKey: `hearth-split-${sid}-${op.key}` },
        )
        .catch(() => undefined);
      if (op.fid) {
        stashEvent(op.fid, base);
        if (standalone) {
          stashEvent(op.fid, standalone);
          purgeEvent(op.fid, op.localId!);
        }
      }
      return { id: standalone?.id };
    }
    case "except": {
      const id = ids.get(op.seriesId!) ?? op.seriesId!;
      const base = await pb.collection("events").getOne<CalendarEvent>(id);
      // Add the day (deduped): the series skips it from now on.
      const others = (base.exceptions ?? []).filter((x) => x.d !== op.key);
      const exceptions = [...others, { d: op.key! }];
      const rec = await pb
        .collection("events")
        .update<CalendarEvent>(base.id, { exceptions });
      if (op.fid) stashEvent(op.fid, rec);
      return {};
    }
    case "read": {
      await pb
        .collection("notifications")
        .update(op.id!, { readAt: op.readAt });
      return {};
    }
    case "readAll": {
      await pb.send("/api/hearth/notifications/read-all", { method: "POST" });
      return {};
    }
  }
}

/** What the user sees on their device while the op waits for the server. */
function applyLocal(op: QueuedOp): void {
  const fid = op.fid;
  switch (op.kind) {
    case "create":
      if (fid)
        stashEvent(fid, {
          ...op.data,
          id: op.localId,
        } as unknown as CalendarEvent);
      break;
    case "update":
      if (fid) patchEvent(fid, op.id!, op.data as EventPatch);
      break;
    case "delete":
      if (fid) purgeEvent(fid, op.id!);
      break;
    case "split":
      if (fid) {
        addException(fid, op.seriesId!, op.key!);
        stashEvent(fid, {
          ...op.data,
          id: op.localId,
        } as unknown as CalendarEvent);
      }
      break;
    case "except":
      if (fid) addException(fid, op.seriesId!, op.key!);
      break;
    case "read":
      applyRead(op.id!, op.readAt!);
      break;
    case "readAll":
      for (const n of cachedUpdates(userId)) applyRead(n.id, op.readAt!);
      break;
  }
}

function applyRead(id: string | null, readAt: string): void {
  const list = cachedUpdates(userId) ?? [];
  const next = list.map((n) => (!id || n.id === id ? { ...n, readAt } : n));
  saveCachedUpdates(userId, next);
}

/** The server refused the op outright: drop it and anything built on it. */
function dropChain(op: QueuedOp): void {
  if (op.localId && op.fid) purgeEvent(op.fid, op.localId);
  const idx = queue.indexOf(op);
  if (idx >= 0) queue.splice(idx, 1);
  const doomed = new Set<string>(op.localId ? [op.localId] : []);
  for (let i = queue.length - 1; i >= 0; i--) {
    const later = queue[i];
    if (later.after && doomed.has(later.after)) {
      if (later.localId) doomed.add(later.localId);
      queue.splice(i, 1);
    }
  }
  persistQueue();
  offline.queued = queue.length;
  if (!queue.length) offline.failed = "";
}

function failedText(op: QueuedOp, err: unknown): string {
  const title =
    typeof op.data?.title === "string" && op.data.title
      ? ` (“${op.data.title}”)`
      : "";
  const what =
    op.kind === "create"
      ? `a new event${title}`
      : op.kind === "delete"
        ? "a deletion"
        : op.kind === "split"
          ? "a change to one occurrence"
          : op.kind === "except"
            ? "deleting one occurrence"
            : op.kind === "read" || op.kind === "readAll"
              ? "marking updates as read"
              : `an edit${title}`;
  const status = (err as { status?: number }).status ?? 0;
  const reason = (err as { response?: { message?: string } }).response?.message;
  return `A change made while offline (${what}) couldn't be sent: ${
    reason ?? `the server refused it (status ${status})`
  }.`;
}

async function flushQueue(): Promise<void> {
  if (flushing || !userId || !queue.length) return;
  flushing = true;
  offline.syncing = true;
  try {
    while (queue.length) {
      const op = queue[0];
      try {
        const res = await sendOp(op);
        if (op.localId && res.id) {
          ids.set(op.localId, res.id);
          persistIds();
        }
        queue.shift();
        persistQueue();
        offline.queued = queue.length;
        noteOnline();
        if (!queue.length) {
          ids.clear();
          persistIds();
          offline.failed = "";
        }
      } catch (err) {
        if (isNetError(err)) {
          // Network dropped mid-run: leave the op queued for next time.
          noteOffline();
          return;
        }
        if ((err as { status?: number }).status === 401) {
          offline.failed = "Sign in again to send your saved changes.";
          return;
        }
        dropChain(op);
        offline.failed = failedText(op, err);
        noteOnline();
      }
    }
  } finally {
    flushing = false;
    offline.syncing = false;
  }
}

async function saveOrQueue(
  op: QueuedOp,
  onId?: (id: string) => void,
): Promise<SaveResult> {
  try {
    const res = await sendOp(op);
    if (op.localId && res.id) {
      ids.set(op.localId, res.id);
      persistIds();
    }
    if (res.id) onId?.(res.id);
    noteOnline();
    return "sent";
  } catch (err) {
    if (!isNetError(err)) throw err;
    noteOffline();
    queue.push(op);
    persistQueue();
    offline.queued = queue.length;
    applyLocal(op);
    void nudge();
    return "queued";
  }
}

function afterOf(id?: string): string | undefined {
  return id?.startsWith(LOCAL_PREFIX) ? id : undefined;
}

const freshLocalId = () =>
  `${LOCAL_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// ------------------------------------------------- public mutation API ----

/** Try the server directly; a dead connection queues the change instead. */
export function saveNewEvent(
  fid: string,
  data: EventPayload,
): Promise<SaveResult> {
  return saveOrQueue({
    kind: "create",
    fid,
    localId: freshLocalId(),
    data: { ...data },
  });
}

/** Like saveNewEvent, but also returns the server id when it was sent now. */
export async function saveNewEventWithId(
  fid: string,
  data: EventPayload,
): Promise<{ result: SaveResult; id: string | null }> {
  let id: string | null = null;
  const result = await saveOrQueue(
    { kind: "create", fid, localId: freshLocalId(), data: { ...data } },
    (sid) => (id = sid),
  );
  return { result, id };
}

export function updateEvent(
  fid: string,
  id: string,
  patch: EventPatch,
): Promise<SaveResult> {
  return saveOrQueue({
    kind: "update",
    fid,
    id,
    data: { ...patch },
    after: afterOf(id),
  });
}

export function deleteEvent(fid: string, id: string): Promise<SaveResult> {
  return saveOrQueue({ kind: "delete", fid, id, after: afterOf(id) });
}

/** Split one occurrence of a series off as a standalone event. */
export function splitOccurrence(
  fid: string,
  seriesId: string,
  key: string,
  standalone: EventPayload,
): Promise<SaveResult> {
  return saveOrQueue({
    kind: "split",
    fid,
    seriesId,
    key,
    localId: freshLocalId(),
    data: { ...standalone, occurrenceOf: seriesId, originDate: key },
    after: afterOf(seriesId),
  });
}

/** Mark one occurrence of a series deleted (the base carries the exception). */
export function exceptOccurrence(
  fid: string,
  seriesId: string,
  key: string,
): Promise<SaveResult> {
  return saveOrQueue({
    kind: "except",
    fid,
    seriesId,
    key,
    after: afterOf(seriesId),
  });
}

export function readNotification(
  id: string,
  readAt: string,
): Promise<SaveResult> {
  return saveOrQueue({ kind: "read", id, readAt });
}

export function readAllNotifications(readAt: string): Promise<SaveResult> {
  return saveOrQueue({ kind: "readAll", readAt });
}

/** Base record of an event: server first, cache when the NAS is out of reach. */
export async function serverOrCachedEvent(
  id: string,
  fid: string,
): Promise<CalendarEvent | null> {
  try {
    return await pb.collection("events").getOne<CalendarEvent>(id);
  } catch (err) {
    if (!isNetError(err)) throw err;
    noteOffline();
    return eventStore(fid).events[id] ?? null;
  }
}
