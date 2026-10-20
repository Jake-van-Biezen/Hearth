import { pb } from "$lib/pocketbase";
import type { CalendarEvent } from "$lib/calendar";

export type Reminder = {
  id: string;
  user: string;
  event: string;
  minutesBefore: number;
};

/** Lead times offered in the event sheet. 0 = at the start. */
export const REMINDER_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "None" },
  { value: 0, label: "At start" },
  { value: 5, label: "5 min" },
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 60, label: "1 hour" },
  { value: 1440, label: "1 day" },
];

/** Reminders only make sense for a single timed event (see deploy/push/server.mjs). */
export function canRemind(
  ev: Pick<CalendarEvent, "recurrence" | "allDay">,
): boolean {
  return !ev.recurrence && !ev.allDay;
}

/** This person's reminder for an event, if any. */
export async function loadReminder(
  uid: string,
  eventId: string,
): Promise<Reminder | null> {
  const res = await pb.collection("reminders").getList<Reminder>(1, 1, {
    filter: pb.filter("user = {:uid} && event = {:ev}", { uid, ev: eventId }),
    requestKey: `reminder-${eventId}`,
  });
  return res.items[0] ?? null;
}

/**
 * Set, change or clear this person's reminder for an event. Online only:
 * the reminder has to reach the server for the sidecar to fire it.
 */
export async function setReminder(
  uid: string,
  eventId: string,
  minutesBefore: number | null,
  existing: Reminder | null,
): Promise<void> {
  if (minutesBefore === null) {
    if (existing) await pb.collection("reminders").delete(existing.id);
    return;
  }
  if (existing) {
    if (existing.minutesBefore !== minutesBefore) {
      await pb.collection("reminders").update(existing.id, { minutesBefore });
    }
    return;
  }
  await pb
    .collection("reminders")
    .create({ user: uid, event: eventId, minutesBefore });
}
