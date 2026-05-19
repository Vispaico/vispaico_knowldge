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
  next?: string;
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
  const baseUrl = `${env.FIRECRAWL_BASE_URL}/v1/crawl/${encodeURIComponent(crawlId)}`;

  logger.info({ crawlId }, "Fetching Firecrawl crawl results");

  const allPages: FirecrawlPage[] = [];
  let nextUrl: string | undefined = baseUrl;
  let finalStatus: string | undefined;
  let finalError: string | undefined;

  while (nextUrl) {
    const absoluteUrl = nextUrl.startsWith("http") ? nextUrl : `${env.FIRECRAWL_BASE_URL}${nextUrl}`;

    const response = await fetch(absoluteUrl, {
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
        data: allPages.length > 0 ? allPages : undefined,
      };
    }

    const json = (await response.json()) as Record<string, unknown>;

    finalStatus = json.status as string | undefined;
    finalError = json.error as string | undefined;

    const pageData = extractPagesFromResponse(json);
    if (pageData.length > 0) {
      allPages.push(...pageData);
    }

    nextUrl = json.next as string | undefined;

    logger.debug(
      { crawlId, status: finalStatus, batchPages: pageData.length, totalPages: allPages.length, hasNext: !!nextUrl },
      "Firecrawl crawl results batch fetched",
    );
  }

  logger.info(
    { crawlId, status: finalStatus, totalPages: allPages.length },
    "Firecrawl crawl results fetched (all pages)",
  );

  return {
    success: true,
    status: finalStatus,
    data: allPages,
    error: finalError,
  };
}

function extractPagesFromResponse(json: Record<string, unknown>): FirecrawlPage[] {
  // Firecrawl v1 returns pages in the "data" array
  const rawData = json.data ?? json.pages;
  if (!Array.isArray(rawData)) return [];

  return rawData.map((item: unknown) => {
    const page = item as Record<string, unknown>;
    const metadata = page.metadata as Record<string, unknown> | undefined;

    // In Firecrawl v1, title and url may be at the top level or inside metadata
    const url = (page.url as string | undefined) ?? (metadata?.sourceURL as string | undefined) ?? (metadata?.url as string | undefined);
    const title = (page.title as string | undefined) ?? (metadata?.title as string | undefined);

    return {
      url,
      title,
      content: page.content as string | undefined,
      markdown: page.markdown as string | undefined,
      html: page.html as string | undefined,
      metadata: metadata ?? { raw: page },
    };
  });
}
