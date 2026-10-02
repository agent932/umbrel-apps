# Pirate Cribbage

Online 2-player cribbage with accounts, stats, ranked play, and pirate-flavoured rule twists. See [PLAN.md](PLAN.md) for the roadmap.

## Layout

| Path              | What                                                                            |
| ----------------- | ------------------------------------------------------------------------------- |
| `packages/engine` | Shared TypeScript game engine: rules, scoring, AI (used by both server and web) |
| `apps/server`     | Fastify API + game server, Drizzle ORM on PostgreSQL                            |
| `apps/web`        | React + Vite + Tailwind client                                                  |

## Development

Requires Node 22+ and Docker.

```bash
npm install
cp .env.example .env
npm run db:up        # start local Postgres
npm run db:migrate   # apply migrations
npm run dev          # server on :3000, web on http://localhost:5173
```

Play the engine against the bot in your terminal: `npm run play`.

Other scripts: `npm test`, `npm run typecheck`, `npm run lint`, `npm run format`, `npm run build`.

Changing the database schema: edit `apps/server/src/db/schema.ts`, then `npm run db:generate` to write a new migration.

## Self-hosting (Umbrel / any Docker host)

The production image bundles the server and the built web app; migrations run automatically on start.

```bash
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" > .env
docker compose up -d --build
```

The app is served on port `8121` (override with `APP_PORT`). Health check: `GET /api/health`.
