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

## PocketBase (NAS)

PocketBase serves the API + admin UI at `POCKETBASE_URL` (e.g. `http://192.168.1.69:8090/_/`).

Bring it up with Docker Compose:

```sh
docker compose -f deploy/docker-compose.yml up -d
```

Collections are provisioned on first boot from `deploy/pb_migrations/`
(families, calendars, events, members). Create the first admin account at
`http://<nas>:8090/_/`.

## Design language

UI follows the frontend-design skill guidance (`.agents/skills/frontend-design/SKILL.md`).
