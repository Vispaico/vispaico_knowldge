import { db } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";
import type { RetrievedContext } from "./schema.js";

/** ts_headline config tuned for agent-facing snippets — broad context, multiple fragments. */
const HEADLINE_OPTS = `'MaxWords=60, MinWords=20, MaxFragments=3, FragmentDelimiter=" … ", StartSel=<mark>, StopSel=</mark>'`;

// Common stop/question words to strip from natural language queries
const STOP_WORDS = new Set([
  "what", "do", "does", "did", "how", "when", "where", "why", "which", "who",
  "whom", "whose", "can", "will", "would", "could", "should", "may", "might",
  "shall", "is", "are", "was", "were", "be", "been", "being", "has", "have",
  "had", "having", "the", "a", "an", "and", "or", "but", "in", "on", "at",
  "to", "for", "of", "by", "with", "from", "as", "into", "through", "during",
  "before", "after", "above", "below", "between", "out", "off", "over",
  "under", "again", "further", "then", "once", "here", "there", "all",
  "each", "every", "both", "few", "more", "most", "other", "some", "such",
  "no", "nor", "not", "only", "same", "so", "than", "too", "very",
  "just", "because", "about", "if", "then", "also", "any", "this", "that",
  "these", "those", "it", "its", "they", "them", "their", "you", "your",
  "we", "us", "our", "he", "she", "him", "her", "his",
  "tell", "give", "get", "make", "take", "know", "think", "come",
  "go", "see", "use", "find", "want", "need", "say",
]);

const tsvector = `to_tsvector('english', coalesce(ds.title, '') || ' ' || coalesce(ds.content, ''))`;

function extractKeyTerms(query: string): string[] {
  const parts = query.match(/"[^"]+"|\S+/g) ?? [];
  const terms: string[] = [];

  for (const part of parts) {
    if (part.startsWith('"') && part.endsWith('"')) {
      terms.push(part);
      continue;
    }
    const cleaned = part.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ");
    for (const token of cleaned.split(/\s+/)) {
      if (token.length >= 3 && !STOP_WORDS.has(token)) {
        terms.push(token);
      }
    }
  }

  return terms;
}

/**
 * Execute a full-text search with the given tsquery SQL expression.
 * `tsqueryExpr` is a SQL fragment like `websearch_to_tsquery('english', ?)` or `to_tsquery('english', ?)`.
 * `queryParams` are the bindings for all `?` markers in `tsqueryExpr`.
 */
async function executeSearch(
  workspace_id: string,
  tsqueryExpr: string,
  queryParams: readonly (string | number)[],
  limit: number,
): Promise<{ results: RetrievedContext[]; total: number }> {

  // Count query: workspace_id (1) + tsqueryExpr (qLen markers)
  const countBindings = [workspace_id, ...queryParams];
  const countQuery = db.raw(
    `SELECT COUNT(*) AS total FROM document_sections ds INNER JOIN documents d ON ds.document_id = d.id WHERE ds.workspace_id = ? AND ${tsvector} @@ ${tsqueryExpr}`,
    countBindings,
  );
  const countRows = await countQuery;
  const total = Number(countRows.rows?.[0]?.total ?? countRows[0]?.total ?? 0);

  if (total === 0) return { results: [], total: 0 };

  // Fetch: headline uses tsqueryExpr (qLen markers), rank uses tsqueryExpr (qLen markers),
  // workspace_id (1), @@ uses tsqueryExpr again (qLen markers), LIMIT (1)
  // Total: qLen + qLen + 1 + qLen + 1 = 3*qLen + 2
  const fetchBindings = [
    ...queryParams, // for headline
    ...queryParams, // for rank
    workspace_id,   // for workspace_id filter
    ...queryParams, // for @@ condition
    limit,           // for LIMIT
  ];
  const resultQuery = db.raw(
    `SELECT
      d.id AS document_id,
      d.title AS document_title,
      d.url AS document_url,
      s.name AS source_name,
      ds.id AS section_id,
      ds.title AS section_title,
      ts_headline('english', ds.content, ${tsqueryExpr}, ${HEADLINE_OPTS}) AS content_snippet,
      ts_rank(${tsvector}, ${tsqueryExpr}) AS relevance_score
    FROM document_sections ds
    INNER JOIN documents d ON ds.document_id = d.id
    INNER JOIN sources s ON d.source_id = s.id
    WHERE ds.workspace_id = ? AND ${tsvector} @@ ${tsqueryExpr}
    ORDER BY relevance_score DESC
    LIMIT ?`,
    fetchBindings,
  );
  const resultRows = await resultQuery;
  const rows = resultRows.rows ?? resultRows;

  const results: RetrievedContext[] = rows.map((r: Record<string, unknown>) => ({
    document_id: r.document_id as string,
    document_title: r.document_title as string,
    document_url: (r.document_url as string | null) ?? null,
    source_name: r.source_name as string,
    section_id: r.section_id as string,
    section_title: (r.section_title as string | null) ?? null,
    content_snippet: (r.content_snippet as string | null) ?? "",
    relevance_score: Number(r.relevance_score),
  }));

  return { results, total };
}

export async function retrieveContexts(
  workspace_id: string,
  query: string,
  limit: number,
): Promise<{ results: RetrievedContext[]; total: number }> {
  // --- Attempt 1: websearch_to_tsquery on the raw query ---
  const tsqueryExpr = `websearch_to_tsquery('english', ?)`;

  const webResult = await executeSearch(workspace_id, tsqueryExpr, [query], limit);
  if (webResult.total > 0) {
    logger.info({ workspace_id, query, tsquery_fn: "websearch_to_tsquery", total: webResult.total }, "Retrieve: websearch_to_tsquery succeeded");
    return webResult;
  }

  // --- Attempt 2: Extract key terms, use OR'd to_tsquery ---
  const terms = extractKeyTerms(query);
  if (terms.length === 0) {
    logger.warn({ workspace_id, query }, "Retrieve: no key terms extracted from query");
    return { results: [], total: 0 };
  }

  const tsqueryTerms = terms.join(" | ");
  logger.info(
    { workspace_id, query, key_terms: terms, tsquery: tsqueryTerms },
    "Retrieve: falling back to key-term OR",
  );

  const orResult = await executeSearch(workspace_id, `to_tsquery('english', ?)`, [tsqueryTerms], limit);
  if (orResult.total > 0) return orResult;

  // --- Attempt 3: Narrow to top 3 terms, OR'd ---
  const top3 = terms.slice(0, 3).join(" | ");
  logger.info(
    { workspace_id, query, key_terms: terms.slice(0, 3), tsquery: top3 },
    "Retrieve: falling back to top-3 key-term OR",
  );

  const top3Result = await executeSearch(workspace_id, `to_tsquery('english', ?)`, [top3], limit);
  if (top3Result.total > 0) return top3Result;

  // All attempts failed
  logger.warn({ workspace_id, query, key_terms: terms }, "Retrieve: all strategies returned zero results");
  return { results: [], total: 0 };
}
