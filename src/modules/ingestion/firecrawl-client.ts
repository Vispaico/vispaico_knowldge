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
  pages?: FirecrawlPage[];
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
  const apiUrl = `${env.FIRECRAWL_BASE_URL}/v1/crawl`;

  logger.info({ firecrawlBaseUrl: env.FIRECRAWL_BASE_URL, targetUrl: params.url, apiUrl }, "Triggering Firecrawl crawl");

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

  let response: Response;
  try {
    response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown fetch error";
    logger.error({ err, firecrawlBaseUrl: env.FIRECRAWL_BASE_URL, apiUrl }, `Firecrawl crawl request failed at network level: ${msg}`);
    return { success: false, error: `Network error starting crawl: ${msg}` };
  }

  if (!response.ok) {
    const errorText = await response.text();
    logger.error({ status: response.status, body: errorText.slice(0, 2000) }, "Firecrawl crawl request failed");
    return {
      success: false,
      error: `Firecrawl returned ${response.status}: ${errorText.slice(0, 2000)}`,
    };
  }

  const json = (await response.json()) as Record<string, unknown>;

  // Firecrawl v1 may return page data synchronously in the POST response
  const pages = extractPagesFromResponse(json);

  logger.info(
    { firecrawlBaseUrl: env.FIRECRAWL_BASE_URL, id: json.id, jobId: json.jobId, syncPages: pages.length },
    "Firecrawl crawl triggered successfully",
  );

  return {
    success: true,
    id: json.id as string | undefined,
    jobId: json.jobId as string | undefined,
    data: json.data,
    pages: pages.length > 0 ? pages : undefined,
  };
}

export async function fetchCrawlResults(crawlId: string): Promise<FirecrawlCrawlStatusResponse> {
  const env = getEnv();
  const statusUrl = `${env.FIRECRAWL_BASE_URL}/v1/crawl/${encodeURIComponent(crawlId)}`;

  logger.info({ firecrawlBaseUrl: env.FIRECRAWL_BASE_URL, crawlId, statusUrl }, "Fetching Firecrawl crawl results");

  const allPages: FirecrawlPage[] = [];
  let nextUrl: string | undefined = statusUrl;
  let finalStatus: string | undefined;
  let finalError: string | undefined;
  let paginationFailed = false;

  while (nextUrl) {
    // Resolve next URL against the current batch URL (not the raw base URL).
    // Firecrawl may return next as:
    //   - absolute URL: "https://firecrawl:3002/v1/crawl/abc?page=2"  (use as-is)
    //   - relative path: "/v1/crawl/abc?page=2"                       (resolve against FIRECRAWL_BASE_URL)
    //   - query+path: "v1/crawl/abc?page=2"                           (resolve against FIRECRAWL_BASE_URL)
    let absoluteUrl: string;
    if (nextUrl.startsWith("http://") || nextUrl.startsWith("https://")) {
      absoluteUrl = nextUrl;
    } else {
      const base = env.FIRECRAWL_BASE_URL.replace(/\/+$/, "");
      const path = nextUrl.startsWith("/") ? nextUrl : `/${nextUrl}`;
      absoluteUrl = `${base}${path}`;
    }

    logger.debug(
      { firecrawlBaseUrl: env.FIRECRAWL_BASE_URL, crawlId, nextUrl, absoluteUrl, nextIsAbsolute: nextUrl.startsWith("http") },
      "Fetching crawl result batch",
    );

    let response: Response;
    try {
      response = await fetch(absoluteUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      logger.error({ err, crawlId, absoluteUrl, pagesSoFar: allPages.length }, `Firecrawl pagination fetch failed: ${msg}`);
      paginationFailed = true;
      finalError = `Pagination fetch failed after ${allPages.length} pages: ${msg}`;
      break;
    }

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ status: response.status, crawlId, absoluteUrl, body: errorText.slice(0, 2000), pagesSoFar: allPages.length }, "Firecrawl results fetch HTTP error");
      paginationFailed = true;
      finalError = `HTTP ${response.status} after ${allPages.length} pages: ${errorText.slice(0, 2000)}`;
      break;
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

  // Return all pages even if pagination failed partway through
  const result: FirecrawlCrawlStatusResponse = {
    success: !paginationFailed && (!finalStatus || finalStatus !== "failed"),
    status: finalStatus,
    data: allPages,
    error: finalError,
  };

  if (paginationFailed) {
    logger.warn(
      { crawlId, pagesFetched: allPages.length, error: finalError },
      "Firecrawl crawl results partially fetched (pagination failed)",
    );
  } else {
    logger.info(
      { crawlId, status: finalStatus, totalPages: allPages.length },
      "Firecrawl crawl results fetched (all pages)",
    );
  }

  return result;
}

function extractPagesFromResponse(json: Record<string, unknown>): FirecrawlPage[] {
  // Firecrawl v1 returns pages in the "data" array (top-level or inside a nested structure)
  const rawData = json.data ?? json.pages;
  if (!Array.isArray(rawData)) return [];

  const pages: FirecrawlPage[] = [];

  for (const item of rawData) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const page = item as Record<string, unknown>;
    const metadata = (page.metadata as Record<string, unknown> | undefined) ?? {};

    // In Firecrawl v1, title and url may be at the top level or inside metadata
    const url = (page.url as string | undefined) ?? (metadata.sourceURL as string | undefined) ?? (metadata.url as string | undefined);
    const title = (page.title as string | undefined) ?? (metadata.title as string | undefined);

    pages.push({
      url,
      title,
      content: page.content as string | undefined,
      markdown: page.markdown as string | undefined,
      html: page.html as string | undefined,
      metadata,
    });
  }

  return pages;
}
