import { NotFoundError, ValidationError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import type { IngestionJob } from "../../types/index.js";
import * as wsRepo from "../workspaces/repository.js";
import * as sourceRepo from "../sources/repository.js";
import * as repo from "./repository.js";
import { triggerFirecrawlCrawl } from "./firecrawl-client.js";

export async function triggerWebsiteCrawl(data: {
  workspace_id: string;
  source_id: string;
  config?: {
    max_pages?: number;
    exclude_paths?: string[];
    include_paths?: string[];
  };
}): Promise<IngestionJob> {
  const workspace = await wsRepo.findWorkspaceById(data.workspace_id);
  if (!workspace) {
    throw new NotFoundError("Workspace", data.workspace_id);
  }

  const source = await sourceRepo.findSourceById(data.source_id);
  if (!source) {
    throw new NotFoundError("Source", data.source_id);
  }

  if (source.workspace_id !== data.workspace_id) {
    throw new ValidationError("Source does not belong to the specified workspace");
  }

  if (source.type !== "website") {
    throw new ValidationError(`Source type '${source.type}' cannot be crawled as a website`);
  }

  if (!source.base_url) {
    throw new ValidationError("Source has no base_url configured");
  }

  const job = await repo.createIngestionJob({
    organization_id: workspace.organization_id,
    workspace_id: data.workspace_id,
    source_id: data.source_id,
    type: "website_crawl",
    config: (data.config ?? {}) as Record<string, unknown>,
  });

  await repo.updateIngestionJob(job.id, {
    status: "running",
    started_at: new Date(),
  });

  try {
    const firecrawlResult = await triggerFirecrawlCrawl({
      url: source.base_url,
      maxPages: data.config?.max_pages,
      excludePaths: data.config?.exclude_paths,
      includePaths: data.config?.include_paths,
    });

    if (!firecrawlResult.success) {
      const updated = await repo.updateIngestionJob(job.id, {
        status: "failed",
        error_message: firecrawlResult.error ?? "Unknown Firecrawl error",
        completed_at: new Date(),
        raw_response: { error: firecrawlResult.error },
      });
      return updated!;
    }

    const updated = await repo.updateIngestionJob(job.id, {
      status: "success",
      raw_response: firecrawlResult as unknown as Record<string, unknown>,
      completed_at: new Date(),
    });

    return updated!;
  } catch (err) {
    logger.error({ err }, "Website crawl ingestion failed unexpectedly");

    const updated = await repo.updateIngestionJob(job.id, {
      status: "failed",
      error_message: err instanceof Error ? err.message : "Unexpected error during crawl",
      completed_at: new Date(),
    });

    return updated!;
  }
}

export async function getIngestionJob(id: string): Promise<IngestionJob> {
  const job = await repo.findIngestionJobById(id);
  if (!job) {
    throw new NotFoundError("IngestionJob", id);
  }
  return job;
}
