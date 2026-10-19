# Hearth

Self-hosted family calendar inspired by TimeTree.

## Stack

- SvelteKit (TypeScript, Svelte 5 runes)
- [PocketBase](https://pocketbase.io) backend (self-hosted on the NAS)
- Tailwind CSS 4
- shadcn-svelte
- PWA (@vite-pwa/sveltekit)
- pnpm

## Development

```sh
pnpm install
cp .env.example .env          # point POCKETBASE_URL at your PocketBase
pnpm dev                      # http://localhost:5173
```

Run type checks with `pnpm check`.

## Production (NAS)

Live at **https://hearth.tail88cd42.ts.net** (Tailscale Service `svc:hearth`).

A single PocketBase container (`hearth`, stack `/volume1/docker/stacks/hearth/`)
serves the API, the admin UI (`/_/`) and the built app (SPA via
`adapter-static`, from `pb_public`). Same origin, so the frontend needs no
PocketBase URL in production.

Deploy (build, upload `pb_public` + `pb_migrations`, restart):

```sh
deploy/deploy-nas.sh
```

Migrations in `deploy/pb_migrations/` run on restart. Google sign-in needs
`https://hearth.tail88cd42.ts.net/api/oauth2-redirect` as an authorized
redirect URI.

Backups: PocketBase writes a consistent zip to `pb_data/backups` nightly at
01:00 UTC (keeps 7). The NAS nightly appdata archive (03:30 local) includes it.

## Local PocketBase

`deploy/docker-compose.yml` runs a dev PocketBase on port 8090 (`pnpm pb:up`).
Collections are provisioned on first boot from `deploy/pb_migrations/`.

## Design language

Design work uses the [Impeccable](https://github.com/pbakaus/impeccable) skill (`.opencode/skills/impeccable/`) — run `/impeccable`.
