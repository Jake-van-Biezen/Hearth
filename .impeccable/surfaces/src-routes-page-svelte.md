---
version: 1
slug: "src-routes-page-svelte"
primary_target: "src/routes/+page.svelte"
related_targets: []
---

# Surface brief — src/routes/+page.svelte (login gate)

## Scope and mode

Root route, unauthenticated state only (authenticated users go to the calendar app). Mode: Operate — the task is sign in, and the gate must do it in seconds. Phone-first (family uses phones), desktop secondary.

## Audience, job, action, proof, constraints

- Audience: whole family (parents + kids with accounts), on phones, first open of the PWA or after session expiry.
- Job: verify each other quickly and get to the shared calendar.
- Action: tap "Continue with Google" (Google-only auth via PocketBase OAuth2; backend admin needs Google client ID/secret and the NAS redirect URI).
- Proof: honest one-line privacy claim — self-hosted on the family's own server, shared with nobody.
- Constraints: Google button keeps Google's own brand grammar; layout, navigation, and controls stay standard web; the world enters only through type, palette, density, and one signature move.

## Chosen direction and memorable moment

Kitchen Wall Planner — the app renders as the wall planner it replaces: ruled paper ground, red margin line, marker-weight wordmark, a ruled week strip with the family's real calendar-color chips. Memorable moment: the wall you hang in the kitchen, now in your pocket — the week strip reads as a real schedule the moment it loads.

Direction contract:

- THESIS: the gate shows the artifact it replaces working, instead of greeting with a copy deck. It refuses the category default of a centered card on a soft gradient.
- OWN-WORLD: warm paper ground with fine ruled blue lattice, one red margin line down the left, marker-red display voice, graphite ink, calendar chips in saturated marker colors (blue, green, yellow). All content removed, it still reads as ruled paper.
- STORY: the visitor understands this is a private, self-hosted family calendar owned by the household; they believe the family shares one truth; they tap Continue with Google.
- FIRST VIEWPORT (390x844, phones carry it): left margin line at ~34px; marker "Hearth" (rotate -2deg) at 150px; tagline under it; ruled week strip (Mon–Sun, chips on Tue/Thu/Sat) at 320px; white Google pill at 542px; privacy note at 632px; footer line bottom. Scale as those positions imply; desktop centers the same column wider, planner page held at a readable book-like width.
- FORM: Kitchen Wall Planner, rank 1 of the grounded list. seed:2ae35349236efe31.
- FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Unresolved decisions

Private-calendar visibility semantics, notification model, kids' UX — later surfaces; do not solve here.
