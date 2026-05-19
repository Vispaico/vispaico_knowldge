# knowledge-api

Multi-tenant knowledge platform backend. Provides REST APIs for managing organizations, workspaces, content sources, ingestion jobs, and crawled documents. Integrates with Firecrawl for website crawling with automatic result polling and page persistence.

## Tech Stack

- **Runtime**: Node.js 22
- **Framework**: Fastify 5
- **Language**: TypeScript (strict mode)
- **Database**: PostgreSQL 16
- **Cache**: Redis 7
- **Validation**: Zod
- **Query Builder**: Knex.js (ad-hoc queries; migrations use raw SQL)
- **External**: Firecrawl (website crawling)

## Quick Start (Local Development)

### Prerequisites

- Node.js >= 22
- PostgreSQL 16
- Redis 7
- Firecrawl instance (internal or cloud)

### Setup

```bash
cp .env.example .env
# Edit .env with your Firecrawl credentials and DB/Redis URLs

npm install
npm run dev
```

Migrations run automatically on startup. To run them manually:

```bash
npm run migrate
```

The API starts at `http://localhost:3000`.

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| NODE_ENV | No | development | Environment mode |
| PORT | No | 3000 | Server port |
| HOST | No | 0.0.0.0 | Server host |
| LOG_LEVEL | No | info | Pino log level |
| DATABASE_URL | Yes | — | PostgreSQL connection string |
| REDIS_URL | Yes | — | Redis connection string |
| FIRECRAWL_BASE_URL | Yes | — | Firecrawl API base URL |
| FIRECRAWL_API_KEY | Yes | — | Firecrawl API key |

### Docker (Development)

```bash
docker compose -f docker-compose.dev.yml up -d postgres redis
cp .env.example .env
npm install
npm run dev
```

## API Endpoints

### GET /health

Returns service health status.

```json
{ "status": "ok", "timestamp": "...", "version": "0.1.0" }
```

### POST /organizations

Create an organization (tenant).

```json
{ "name": "Acme Corp", "slug": "acme-corp" }
```

### POST /workspaces

Create a workspace within an organization.

```json
{ "organization_id": "uuid", "name": "Support KB", "slug": "support-kb" }
```

### POST /sources/website

Register a website as a content source.

```json
{ "workspace_id": "uuid", "name": "Docs Site", "base_url": "https://docs.example.com" }
```

### GET /sources/:id

Retrieve a source by ID.

### GET /sources/:id/documents

Retrieve all documents belonging to a source.

```json
{ "documents": [...], "total": 5 }
```

### GET /documents/:id

Retrieve a document with its parsed sections.

```json
{ "document": {...}, "sections": [...] }
```

### POST /ingestion/website-crawl

Trigger a Firecrawl crawl for a website source. The endpoint starts the crawl, polls Firecrawl for completion (up to 5 minutes), persists returned pages into `documents` and `document_sections`, and returns the final job record.

```json
{
  "workspace_id": "uuid",
  "source_id": "uuid",
  "config": {
    "max_pages": 100,
    "exclude_paths": ["/admin/*"]
  }
}
```

### GET /ingestion/jobs/:id

Retrieve an ingestion job by ID, including Firecrawl metadata and page count.

## Project Structure

```
src/
├── config/env.ts           # Environment validation
├── lib/
│   ├── db.ts               # Knex/PostgreSQL
│   ├── redis.ts            # ioredis
│   ├── logger.ts           # Pino
│   ├── errors.ts           # Error classes
│   ├── migrate.ts          # Auto-migration runner
│   └── migrate-cli.ts      # Manual migration CLI
├── types/index.ts          # TypeScript interfaces
├── modules/
│   ├── health/             # Health check
│   ├── organizations/      # Organization CRUD
│   ├── workspaces/         # Workspace CRUD
│   ├── sources/            # Source management
│   ├── ingestion/          # Ingestion jobs + Firecrawl client
│   └── documents/          # Document + section persistence & query
├── app.ts                  # Fastify bootstrap
└── server.ts               # Entry point (runs migrations, starts server)
```

## Migration Behavior

- **On startup**: `server.ts` calls `runMigrations()` after the database connection is verified.
- **Tracking**: Applied migrations are tracked in a `schema_migrations` table with filename and timestamp. Already-applied files are skipped.
- **Manual run**: `npm run migrate` runs the same runner standalone.
- **New environments**: Just point to the database and start. Migrations apply automatically.
- **Rollbacks**: Not supported in the auto-runner. To revert, write a new migration file.

## Deployment (Coolify)

1. Push to GitHub.
2. In Coolify, create a new service pointing to your repository.
3. Set build pack to Dockerfile.
4. Configure environment variables (DATABASE_URL, REDIS_URL, FIRECRAWL_BASE_URL, FIRECRAWL_API_KEY).
5. No manual migration step needed -- migrations run automatically on container startup.
6. Deploy.

## Architecture Notes

- **Multi-tenant**: Every record belongs to an organization. Workspaces provide further isolation.
- **Firecrawl integration**: Isolated in `src/modules/ingestion/firecrawl-client.ts`.

  **Ingestion flow (POST /ingestion/website-crawl)**:

  1. Validates workspace and source belong together; source type must be `website`.
  2. Creates `ingestion_jobs` record with status `pending`, then sets `running` + `started_at`.
  3. POSTs to Firecrawl `{base_url}/v1/crawl` with `max_pages`, `exclude_paths`, `include_paths` from config.
  4. Stores the returned `crawl_id` in job metadata.
  5. Polls `GET {base_url}/v1/crawl/{crawl_id}` every 2 seconds (up to 5 minute timeout).
     - Waits for `status === "completed"` before proceeding.
     - Follows `next` pagination URLs to accumulate **all** pages, not just the first batch.
  6. Normalizes each page: title and url are read from top-level fields first, then fall back to `metadata.sourceURL` / `metadata.title` (Firecrawl v1 nesting).
  7. For each page, creates a `documents` row. Content is taken from `markdown` or `content` field (truncated to 1 MB).
  8. Splits document content by markdown headings (`#`, `##`, `###`) into `document_sections` rows. Pages with no headings still get one section.
  9. All rows carry `organization_id`, `workspace_id`, `source_id`, and `ingestion_job_id`.
  10. Updates job to `success` with page count in `raw_response`. If any step fails, job is set to `failed` with `error_message`.

  **Why documents were empty before the fix**: The poller previously returned as soon as `data.length > 0`, which happened with partial pages while Firecrawl status was still `"scraping"`. The pagination `next` URL was never followed. Title and URL fields were read from top-level keys only, but Firecrawl v1 may nest them inside `metadata`.

- **Document persistence**: Crawled pages are split by markdown headings into sections. Each page becomes a `document` row; each heading block becomes a `document_section` row. Content is truncated at 1 MB per page.
- **Queue readiness**: The ingestion service is structured so a background queue worker can call `triggerWebsiteCrawl` directly without the HTTP layer. The polling timeout (5 min) and interval (2 s) are constants that can be tuned.
- **Row-level security**: Tables have `organization_id` on every row. RLS policies can be added to the schema without code changes.
- **No auth**: Auth is a placeholder. `workspace_members.user_id` and `audit_logs.actor_id` accept arbitrary strings for future integration.
