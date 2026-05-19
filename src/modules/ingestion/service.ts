import { NotFoundError, ValidationError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import type { IngestionJob } from "../../types/index.js";
import * as wsRepo from "../workspaces/repository.js";
import * as sourceRepo from "../sources/repository.js";
import * as docRepo from "../documents/repository.js";
import * as repo from "./repository.js";
import { triggerFirecrawlCrawl, fetchCrawlResults } from "./firecrawl-client.js";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 300_000;

async function pollCrawlResults(
  crawlId: string,
  abortController: AbortController,
): ReturnType<typeof fetchCrawlResults> {
  const poll = async (): Promise<ReturnType<typeof fetchCrawlResults>> => {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    if (abortController.signal.aborted) {
      return { success: false, error: "Polling timed out" };
    }

    const snapshot = await fetchCrawlResults(crawlId);

    if (!snapshot.success) {
      return snapshot;
    }

    // Firecrawl status is "completed" when all pages are ready
    if (snapshot.status === "completed") {
      return snapshot;
    }

    // For synchronous/v1.1 responses, data may arrive without a status field
    if (snapshot.data && snapshot.data.length > 0 && !snapshot.status) {
      return snapshot;
    }

    // If status is "failed", return what we have
    if (snapshot.status === "failed") {
      return snapshot;
    }

    // Still scraping — poll again
    return poll();
  };

  const timeout = setTimeout(() => {
    abortController.abort();
  }, POLL_TIMEOUT_MS);

  try {
    return await poll();
  } finally {
    clearTimeout(timeout);
  }
}

interface CrawledPage {
  url?: string;
  title?: string;
  content?: string;
  markdown?: string;
  html?: string;
  metadata?: Record<string, unknown>;
}

function normalizeCrawlPages(
  rawData: unknown,
): CrawledPage[] {
  if (!rawData) return [];
  if (Array.isArray(rawData)) return rawData as CrawledPage[];
  if (typeof rawData === "object" && rawData !== null) {
    const obj = rawData as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data as CrawledPage[];
    if (Array.isArray(obj.pages)) return obj.pages as CrawledPage[];
  }
  return [];
}

async function persistCrawlPages(
  job: IngestionJob,
  pages: CrawledPage[],
): Promise<{ docsInserted: number; sectionsInserted: number; skipped: number }> {
  const orgId = job.organization_id;
  const wsId = job.workspace_id;
  const sourceId = job.source_id;
  const jobId = job.id;

  logger.info({ job_id: jobId, total_items: pages.length }, "Persisting crawl pages");

  let docsInserted = 0;
  let sectionsInserted = 0;
  let skipped = 0;

  for (const page of pages) {
    if (!page || typeof page !== "object") {
      skipped++;
      continue;
    }

    const metadata = page.metadata ?? {};
    const content = (page.content ?? page.markdown ?? "")?.substring(0, 1_000_000) ?? "";
    const docUrl = page.url ?? undefined;
    const title = page.title ?? docUrl ?? "Untitled";

    if (!docUrl && !content) {
      logger.debug({ job_id: jobId }, "Skipping page with no url and no content");
      skipped++;
      continue;
    }

    const doc = await docRepo.createDocument({
      organization_id: orgId,
      workspace_id: wsId,
      source_id: sourceId,
      ingestion_job_id: jobId,
      title,
      url: docUrl,
      content: content || undefined,
      metadata: {
        ...metadata,
        raw_title: page.title,
        crawl_url: page.url,
        has_html: !!page.html,
      },
    });
    docsInserted++;

    if (content) {
      const sectionMap = splitContentIntoSections(content);
      for (const section of sectionMap) {
        await docRepo.createDocumentSection({
          organization_id: orgId,
          workspace_id: wsId,
          document_id: doc.id,
          title: section.title ?? undefined,
          content: section.content,
          order_index: section.order_index,
        });
        sectionsInserted++;
      }
    } else {
      await docRepo.createDocumentSection({
        organization_id: orgId,
        workspace_id: wsId,
        document_id: doc.id,
        title: undefined,
        content: undefined,
        order_index: 0,
      });
      sectionsInserted++;
    }
  }

  logger.info(
    { job_id: jobId, total_items: pages.length, docs: docsInserted, sections: sectionsInserted, skipped },
    "Crawl pages persisted",
  );

  return { docsInserted, sectionsInserted, skipped };
}

function splitContentIntoSections(
  content: string,
): Array<{ title: string | null; content: string; order_index: number }> {
  const headingRegex = /^#{1,3}\s+(.+)$/gm;
  const sections: Array<{ title: string | null; content: string; order_index: number }> = [];
  let lastIndex = 0;
  let lastHeading: string | null = null;
  let order = 0;

  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(content)) !== null) {
    const sectionContent = content.slice(lastIndex, match.index).trim();
    if (sectionContent || lastHeading) {
      sections.push({
        title: lastHeading,
        content: sectionContent,
        order_index: order++,
      });
    }
    lastHeading = match[1];
    lastIndex = match.index + match[0].length;
  }

  const remaining = content.slice(lastIndex).trim();
  if (remaining || lastHeading) {
    sections.push({
      title: lastHeading,
      content: remaining,
      order_index: order++,
    });
  }

  if (sections.length === 0) {
    sections.push({ title: null, content: content.substring(0, 500_000), order_index: 0 });
  }

  return sections;
}

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

    const crawlId = firecrawlResult.id;
    if (!crawlId) {
      const updated = await repo.updateIngestionJob(job.id, {
        status: "failed",
        error_message: "Firecrawl did not return a crawl id",
        completed_at: new Date(),
        raw_response: firecrawlResult as unknown as Record<string, unknown>,
      });
      return updated!;
    }

    await repo.updateIngestionJob(job.id, {
      metadata: { firecrawl_crawl_id: crawlId },
    });

    // Firecrawl may return pages synchronously in the POST response body.
    // If present, use them directly and skip the status GET.
    let pages: CrawledPage[] = [];

    if (firecrawlResult.pages && firecrawlResult.pages.length > 0) {
      pages = firecrawlResult.pages.map((p) => ({
        url: p.url,
        title: p.title,
        content: p.content,
        markdown: p.markdown,
        html: p.html,
        metadata: p.metadata,
      }));

      logger.info({ job_id: job.id, crawlId, syncPages: pages.length }, "Using synchronous crawl pages from POST response");
    } else {
      logger.info({ crawlId }, "No sync pages in POST response, polling Firecrawl for results");

      const abortController = new AbortController();
      const crawlResults = await pollCrawlResults(crawlId, abortController);

      if (!crawlResults.success) {
        logger.warn({ job_id: job.id, crawlId, error: crawlResults.error }, "Crawl polling failed");
        const updated = await repo.updateIngestionJob(job.id, {
          status: "failed",
          error_message: crawlResults.error ?? "Failed to fetch crawl results",
          completed_at: new Date(),
          raw_response: crawlResults as unknown as Record<string, unknown>,
        });
        return updated!;
      }

      pages = normalizeCrawlPages(crawlResults.data);

      logger.info(
        { job_id: job.id, crawlId, status: crawlResults.status, pagesReturned: pages.length },
        "Crawl results fetched via polling",
      );
    }

    let persistResult = { docsInserted: 0, sectionsInserted: 0, skipped: 0 };

    if (pages.length > 0) {
      persistResult = await persistCrawlPages(job, pages);
    } else {
      logger.warn({ job_id: job.id, crawlId }, "Crawl returned zero pages");
    }

    const updated = await repo.updateIngestionJob(job.id, {
      status: "success",
      raw_response: {
        crawl_id: crawlId,
        page_count: pages.length,
        docs_inserted: persistResult.docsInserted,
        sections_inserted: persistResult.sectionsInserted,
        skipped: persistResult.skipped,
      } as unknown as Record<string, unknown>,
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
