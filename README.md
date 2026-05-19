# knowledge-api

Multi-tenant knowledge platform backend. Provides REST APIs for managing organizations, workspaces, content sources, and ingestion jobs. Integrates with Firecrawl for website crawling.

## Tech Stack

- **Runtime**: Node.js 22
- **Framework**: Fastify 5
- **Language**: TypeScript (strict mode)
- **Database**: PostgreSQL 16
- **Cache**: Redis 7
- **Validation**: Zod
- **Query Builder**: Knex.js
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
npm run migrate:latest
npm run dev
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
npm run migrate:latest
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

### POST /ingestion/website-crawl

Trigger a Firecrawl crawl for a website source.

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

Retrieve an ingestion job by ID, including Firecrawl response.

## Project Structure

```
src/
├── config/env.ts          # Environment validation
├── lib/                   # Shared infrastructure
│   ├── db.ts              # Knex/PostgreSQL
│   ├── redis.ts           # ioredis
│   ├── logger.ts          # Pino
│   └── errors.ts          # Error classes
├── types/index.ts         # TypeScript interfaces
├── modules/
│   ├── health/            # Health check
│   ├── organizations/     # Organization CRUD
│   ├── workspaces/        # Workspace CRUD
│   ├── sources/           # Source management
│   └── ingestion/         # Ingestion jobs + Firecrawl client
├── app.ts                 # Fastify bootstrap
└── server.ts              # Entry point
```

## Deployment (Coolify)

1. Push to GitHub.
2. In Coolify, create a new service pointing to your repository.
3. Set build pack to Dockerfile.
4. Configure environment variables (DATABASE_URL, REDIS_URL, FIRECRAWL_BASE_URL, FIRECRAWL_API_KEY).
5. For migrations, either:
   - Add a Coolify post-deploy command: `npm run migrate:latest`
   - Or run `npm run migrate:latest` manually via the Coolify terminal before first deploy
6. Deploy.

## Architecture Notes

- **Multi-tenant**: Every record belongs to an organization. Workspaces provide further isolation.
- **Firecrawl integration**: Isolated in `src/modules/ingestion/firecrawl-client.ts`. Swap it out by implementing the same interface.
- **Queue readiness**: The ingestion service is structured so a background queue worker can call `triggerWebsiteCrawl` directly without the HTTP layer.
- **Row-level security**: Tables have `organization_id` on every row. RLS policies can be added to the schema without code changes.
- **No auth**: Auth is a placeholder. `workspace_members.user_id` and `audit_logs.actor_id` accept arbitrary strings for future integration.
