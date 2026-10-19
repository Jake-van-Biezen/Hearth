# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Whole family (parents + kids old enough to have their own phones/accounts). Everyone uses the PWA on their phone; each member signs in and shares one family's calendars. Primary situation: quick glances and edits on the go — checking what's coming and adding events (school things, appointments, outings).

## Product Purpose

Self-hosted shared family calendar inspired by TimeTree. Makes the whole family's schedule visible and editable by every member through shared, color-coded calendars. Success: family stops double-booking and forgetting; everyone checks the same source instead of asking each other.

## Positioning

TimeTree-shaped shared-calendar experience, but self-hosted on our own NAS and free of ads/clutter. A Google Calendar family setup (one shared calendar, everyone's own account) neither gives per-calendar organization with member-visible color coding nor stays free of a giant platform's clutter; TimeTree owns the data and monetizes attention. Hearth does both jobs: data ownership and a cleaner shared-calendar flow.

## Operating Context

- Backend: PocketBase on the home NAS (UGREEN, 192.168.1.69), Docker Compose, port 8090; collections `families`, `calendars`, `events` provisioned by migrations (`deploy/pb_migrations/`).
- Frontend PWA installed on family phones; points at `POCKETBASE_URL` env.
- Family devices are shared across normal household use — one NAS, few users, private LAN access.

## Capabilities and Constraints

- Data model: `families` (name, members) → `calendars` (family, name, color, visibility `family`|`private`) → `events` (calendar, title, description, location, startsAt, endsAt, allDay, createdBy).
- Access rules: membership in the family is the authorization boundary for all reads/writes; private calendars are visible to family members via backend rules (visibility semantics still being shaped).
- Events cover both all-day things (school days, holidays) and timed appointments (startsAt required, endsAt optional, allDay flag).
- Technical: SvelteKit 2 + Svelte 5 runes, Tailwind CSS 4, shadcn-svelte, PocketBase JS SDK via `pb` singleton, PWA with autoUpdate service worker.
- Explicitly undecided: kids' age-appropriate UX, event detail depth, notification model, private-calendar scope.

## Brand Commitments

- Name: Hearth (fixed).
- Inspired-by alignment: TimeTree (familiar shared-calendar patterns are an asset, not something to copy verbatim).
- Personality implied by name: warm, domestic, home-centered.

## Evidence on Hand

- No marketing assets, screenshots, testimonials, or press — none may be fabricated.
- Working stack in repo: PocketBase migrations define the real schema; app currently a title placeholder at `/`.

## Product Principles

1. Shared first — the calendar's job is family-wide visibility; every choice favors "everyone sees the same truth".
2. Ownership matters — family data lives on our NAS; no third-party dependency on trust.
3. Phones are the scene of use — glanceable in seconds, quick capture first.
4. Simplicity beats power — fewer features, done cleanly; TimeTree's clutter is the anti-pattern.
5. Warm, not cute — domestic warmth in tone and detail without gimmicks.
