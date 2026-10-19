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

- `deploy/docker-compose.yml` — PocketBase container, port 8090
- `deploy/pb_migrations/` — collections provisioned on boot: `families`, `calendars`, `events`
- Frontend points at `POCKETBASE_URL` (copy `.env.example` → `.env`)

## Design

Follow the `impeccable` project skill (`.opencode/skills/impeccable/`) for design work — run `/impeccable` commands (`audit`, `critique`, `polish`, `harden`, ...) and keep `.impeccable/design.json` + `PRODUCT.md` as the design source of truth. Design tokens live in `src/routes/layout.css` (Inter Variable, shadcn theme vars).

## Conventions

- Svelte 5 runes: `$props`, `$state`, `$derived`, `$effect` — no legacy `let` reactivity
- All PocketBase access through the `pb` singleton; no ad-hoc `new PocketBase()` in components
- App is client-heavy (PWA); prefer client-side loading unless SSR needed
