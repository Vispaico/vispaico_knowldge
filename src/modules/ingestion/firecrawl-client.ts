import { getEnv } from "../../config/env.js";
import { logger } from "../../lib/logger.js";

interface FirecrawlCrawlParams {
  url: string;
  maxPages?: number;
  excludePaths?: string[];
  includePaths?: string[];
}

interface FirecrawlCrawlResponse {
  success: boolean;
  id?: string;
  jobId?: string;
  data?: unknown;
  error?: string;
}

interface FirecrawlPage {
  id?: string;
  url?: string;
  title?: string;
  content?: string;
  markdown?: string;
  html?: string;
  metadata?: Record<string, unknown>;
}

interface FirecrawlCrawlStatusResponse {
  success: boolean;
  status?: string;
  total?: number;
  completed?: number;
  creditsUsed?: number;
  data?: FirecrawlPage[];
  error?: string;
}

export async function triggerFirecrawlCrawl(params: FirecrawlCrawlParams): Promise<FirecrawlCrawlResponse> {
  const env = getEnv();
  const url = `${env.FIRECRAWL_BASE_URL}/v1/crawl`;

  const body: Record<string, unknown> = {
    url: params.url,
  };

  if (params.maxPages) {
    body.limit = params.maxPages;
  }

  if (params.excludePaths && params.excludePaths.length > 0) {
    body.excludes = params.excludePaths;
  }

  if (params.includePaths && params.includePaths.length > 0) {
    body.includes = params.includePaths;
  }

  logger.info({ url: params.url }, "Triggering Firecrawl crawl");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error({ status: response.status, body: errorText }, "Firecrawl crawl request failed");
    return {
      success: false,
      error: `Firecrawl returned ${response.status}: ${errorText}`,
    };
  }

  const json = (await response.json()) as Record<string, unknown>;

  logger.info({ firecrawlResponse: json }, "Firecrawl crawl triggered successfully");

  return {
    success: true,
    id: json.id as string | undefined,
    jobId: json.jobId as string | undefined,
    data: json.data,
  };
}

export async function fetchCrawlResults(crawlId: string): Promise<FirecrawlCrawlStatusResponse> {
  const env = getEnv();
  const url = `${env.FIRECRAWL_BASE_URL}/v1/crawl/${encodeURIComponent(crawlId)}`;

  logger.info({ crawlId }, "Fetching Firecrawl crawl results");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error({ status: response.status, body: errorText }, "Firecrawl results fetch failed");
    return {
      success: false,
      error: `Firecrawl returned ${response.status}: ${errorText}`,
    };
  }

  const json = (await response.json()) as Record<string, unknown>;

  const statusData: FirecrawlCrawlStatusResponse = {
    success: true,
    status: json.status as string | undefined,
    total: json.total as number | undefined,
    completed: json.completed as number | undefined,
    creditsUsed: json.creditsUsed as number | undefined,
    data: (json.data as FirecrawlPage[] | undefined) ?? (json.pages as FirecrawlPage[] | undefined),
    error: json.error as string | undefined,
  };

  logger.info(
    { crawlId, status: statusData.status, pages: statusData.data?.length ?? 0 },
    "Firecrawl crawl results fetched",
  );

  return statusData;
}
