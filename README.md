# Hearth

Self-hostable family calendar inspired by TimeTree.

## Stack

- SvelteKit with TypeScript
- SQLite with Drizzle ORM
- Tailwind CSS
- shadcn-svelte
- pnpm

## Development

```sh
pnpm install
cp .env.example .env
pnpm dev
```

Run project checks with `pnpm check` and manage the database with the
`db:push`, `db:generate`, `db:migrate`, and `db:studio` scripts.
