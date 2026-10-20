---
version: 1
slug: "src-routes-calendar-page-svelte"
primary_target: "src/routes/calendar/+page.svelte"
related_targets: []
---

# Surface brief — src/routes/calendar/+page.svelte (family week)

## Scope and mode

Authenticated home of the app: the family's current week. Mode: Operate. Phone-first PWA, desktop secondary. This pass: view events from all family calendars (color-coded) and quick-add an event. Edit/delete, calendar toggles, and in-app family setup are out of scope.

## Audience, job, action, proof, constraints

- Audience: whole family on phones, glancing several times a day; adding events on the go.
- Job: see what's on this week at a glance, and what's next; capture a new event in seconds.
- Action: browse weeks (prev / today / next), tap "+ Add" → title, day, all-day or start/end time, calendar → save.
- Content: live PocketBase `calendars` + `events` for the signed-in user's family; Monday-first weeks.
- States: loading, no family yet (admin seeds families in PocketBase; show honest "ask whoever runs the home server to add you"), family but no calendars, empty week, empty day, busy day overflow, server unreachable, save error.
- Constraints: standard web controls (buttons, dialog, inputs, select); world lends type, palette, density, one signature move. Gate visuals untouched.

## Chosen direction and memorable moment

Planner spread — the week as eight ruled boxes, two per row, like a week-on-two-pages planner. Memorable moment: the eighth box is the "Next up" sign — one event, its time large.

## Direction contract

THESIS: the week is a planner spread of eight ruled boxes, not a time grid or an endless agenda. Refuses the category default of an hour-gridded week view and a month of dots.

OWN-WORLD: paper ground with 26px blue lattice, red margin line, marker day labels, ink-framed today box, weekend boxes tinted, events as saturated marker chips in each calendar's own color, all-day events as dashed outline chips. Ink pill for primary action.

STORY: the family member sees the whole week in one look, knows what's next, trusts it's the same truth everyone sees, and adds an event without hunting.

FIRST VIEWPORT (390x844): marker family name top-left with week range beneath; prev / Today / next pills top-right; 2x4 grid of day boxes (Mon–Sun, then Next up) filling to ~640px; calendar legend bottom-left; ink "+ Add" pill bottom-right, thumb reach.

FORM: Planner spread, rank 3 of the grounded list (dealt lead). seed:729e720ad694231b. Raises: Next-up box as single-message sign (from airport wayfinding); box density tracks how busy the day is (from manual tab rail).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved decisions

Event edit/delete, calendar visibility toggles, private-calendar semantics, notifications, kids' UX.

## Month view addendum (extension, 2026-10-20)

Same surface, second mode. Week | Month segmented pill in the header (active segment ink); month view swaps the planner spread for a ruled month sheet: Permanent Marker weekday labels over a 2px-ink-framed 7-column grid whose internal rules are the 1px gaps between cell grounds (the bg-gap trick, no cell borders). Cells: Karla tabular day number (today = marker-red circle), weekend columns in weekend-tint, out-of-month cells dimmed. Events are one-line 11px chips: 6px calendar-color dot (hollow ring for all-day) + planner shorthand, max 2 then `+N`. Tapping a day unfolds a white day panel below the sheet (WED 21 marker header, full week-style chips, per-day plus; tapping again closes) — the panel is the month view's "Next up"-slot moment. Prev/Today/next pills drive month nav; `?v=month` persists the mode; remove it on any event deep link, which always lands in the week view.
