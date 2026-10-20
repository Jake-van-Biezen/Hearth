# Hearth

Shared family calendar. Self-hosted PocketBase backend on the NAS, SvelteKit PWA frontend.

## Stack

- SvelteKit 2, Svelte 5 runes only (forced in vite.config), TypeScript
- PocketBase JS SDK (`src/lib/pocketbase.ts`, singleton `pb`; env `PUBLIC_POCKETBASE_URL`)
- Tailwind CSS 4 + shadcn-svelte (luma style, `components.json`)
- PWA: `@vite-pwa/sveltekit` (autoUpdate), icons in `static/icons/`
- pnpm

## Commands

```sh
pnpm dev         # dev server
pnpm check       # svelte-kit sync + svelte-check
pnpm build       # production build (PWA service worker generated)
```

## Backend (NAS)

- Prod: https://hearth.tail88cd42.ts.net — PocketBase container `hearth` on the NAS serves API + admin + the SPA build (`pb_public`)
- Deploy: `deploy/deploy-nas.sh` (build with blank `PUBLIC_POCKETBASE_URL` → same-origin, upload, restart)
- `adapter-static` SPA (`fallback: index.html`, `ssr = false`); service worker must not handle `/api/` or `/_/`
- `deploy/docker-compose.yml` — local dev PocketBase, port 8090
- `deploy/pb_migrations/` — collections provisioned on boot: `families`, `calendars`, `events`, `notifications`, `push_subscriptions`
- `deploy/pb_hooks/` — JSVM hooks (PocketBase 0.28 API; no `onServe`, and `onBootstrap` runs *before* migrations): event create/update/delete → one `notifications` row per other person who can see the event; car bookings: `usesCar` events may not overlap within a family, recurring occurrences included (`car.js`, Europe/Amsterdam wall clock computed in code since the NAS image has no zoneinfo); push superuser bootstrap; `/api/hearth/push/key`, `/api/hearth/notifications/read-all`; membership (`HEARTH_FAMILY_EMAILS` allowlist auto-joins on signup, every member gets a private personal calendar, event moves into unseen calendars rejected)
- Recurring events: `events.recurrence` (`weekly`/`monthly`), series-only (edit/delete touches the series); expansion is client-side (`expandRecurring`/`seriesNext` in `src/lib/calendar.ts`), loaders pull ongoing series too
- Car: `events.usesCar` ("Needs the car" toggle in the event sheet, car glyph on chips). Timed car events need an end; clashes come back as 400 with `data.usesCar.message`
- Calendars: `visibility = "private"` + `owner` → only the owner sees the calendar and its events (enforced in API rules, so realtime too). Shared calendars have no owner
- `deploy/push/` — Node sidecar (`hearth-push`): watches `notifications`, sends Web Push (VAPID) to `push_subscriptions`, stamps `pushedAt`, prunes 404/410 subs. Env in `deploy/.env.example`
- Service worker push/click handlers: `static/push-sw.js` (pulled in via `workbox.importScripts`)
- Dev frontend points at `PUBLIC_POCKETBASE_URL` (copy `.env.example` → `.env`)

## Design

Follow the `impeccable` project skill (`.opencode/skills/impeccable/`) for design work — run `/impeccable` commands (`audit`, `critique`, `polish`, `harden`, ...) and keep `.impeccable/design.json` + `PRODUCT.md` as the design source of truth. Design tokens live in `src/routes/layout.css` (Inter Variable, shadcn theme vars).

## Conventions

- Svelte 5 runes: `$props`, `$state`, `$derived`, `$effect` — no legacy `let` reactivity
- All PocketBase access through the `pb` singleton; no ad-hoc `new PocketBase()` in components
- App is client-heavy (PWA); prefer client-side loading unless SSR needed
