# knowledge-api — AGENTS.md

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start dev server with hot-reload via `tsx watch src/server.ts` |
| `npm run build` | `tsc` compile to `dist/` |
| `npm run start` | Run compiled output: `node --enable-source-maps dist/server.js` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run migrate` | Run raw-SQL migrations standalone via `tsx src/lib/migrate-cli.ts` |

- Migrations also run **automatically on startup** (`src/server.ts` → `runMigrations()`).
- **No linter, no formatter, no test framework** are configured. Do not run `npm test` or `npm run lint`.
- `.env.example` is in `.gitignore` — it is not committed. If missing, create from env vars listed in README.

## ESM

`"type": "module"` in package.json. **All relative imports must include `.js` extension** (e.g. `"./config/env.js"`). Using `.ts` or no extension will fail at runtime.

## Module pattern

Each domain (organizations, workspaces, sources, ingestion, documents, search) has four files under `src/modules/<name>/`:
- `routes.ts` — Fastify plugin, registers routes via `app.register(moduleRoutes)`
- `schema.ts` — Zod schemas + TypeScript types
- `service.ts` — business logic
- `repository.ts` — Knex queries

Wire new modules into `src/app.ts` via `app.register(moduleRoutes)`.

## Error handling

Use `src/lib/errors.ts` classes:
- `NotFoundError(resource, id)` → 404
- `ValidationError(message, details?)` → 400
- `ConflictError(message)` → 409

Throw them in service layer; the error handler in `app.ts` catches and formats as `{ error: { code, message, details? } }`.

## Database

- **Knex.js** for queries, **raw SQL files** in `migrations/` for schema changes.
- Migrations are applied by `src/lib/migrate.ts`, tracked in a `schema_migrations` table (filename + applied_at). Only `.sql` files are processed, sorted alphabetically.
- All tables carry `organization_id`, `workspace_id` for multi-tenancy.
- Search in `src/modules/search/` uses PostgreSQL full-text search (`plainto_tsquery`, `ts_headline`, `ts_rank`). Requires migration `002_fulltext_search.sql` for GIN indexes.

## Redis

Optional — server logs a warning and continues if Redis is unavailable. Used via `getRedis()` in `src/lib/redis.ts` (lazy singleton, lazyConnect).

## Deployment (Coolify)

Dockerfile processes `migrations/`, `knexfile.ts`, and compiled `dist/`. Migrations auto-run on container startup. No manual migration step.

## Key constraints

| Constraint | Detail |
|---|---|
| Node.js | `>=22`, checked via `engines` in package.json |
| TypeScript | Strict mode, `ESNext` modules, `ES2024` target |
| PostgreSQL | 16, with `uuid-ossp` extension |
| Redis | 7 |
| Auth | None — `user_id` and `actor_id` accept arbitrary strings |
