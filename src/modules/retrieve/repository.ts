import { db } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";
import type { RetrievedContext } from "./schema.js";

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
  "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very",
  "just", "because", "about", "if", "then", "also", "any", "this", "that",
  "these", "those", "it", "its", "they", "them", "their", "you", "your",
  "we", "us", "our", "he", "she", "him", "her", "his",
  "tell", "tell", "give", "get", "make", "take", "know", "think", "come",
  "go", "see", "use", "find", "want", "need", "say",
]);

function extractKeyTerms(query: string): string[] {
  // Split on quotes first to preserve quoted phrases
  const parts = query.match(/"[^"]+"|\S+/g) ?? [];
  const terms: string[] = [];

  for (const part of parts) {
    // Preserve quoted phrases as-is
    if (part.startsWith('"') && part.endsWith('"')) {
      terms.push(part);
      continue;
    }
    // Clean and filter unquoted tokens
    const cleaned = part.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ");
    for (const token of cleaned.split(/\s+/)) {
      if (token.length >= 3 && !STOP_WORDS.has(token)) {
        terms.push(token);
      }
    }
  }

  return terms;
}

export async function retrieveContexts(
  workspace_id: string,
  query: string,
  limit: number,
): Promise<{ results: RetrievedContext[]; total: number }> {
  // The tsvector expression used throughout
  const tsvector = `to_tsvector('english', coalesce(ds.title, '') || ' ' || coalesce(ds.content, ''))`;

  // --- Attempt 1: websearch_to_tsquery on the raw query ---
  // websearch_to_tsquery handles punctuation, stop words, and
  // question syntax better than plainto_tsquery. It uses & (AND)
  // implicitly between tokens by default.
  const webquerySql = `websearch_to_tsquery('english', ?)`;

  // Count with websearch approach
  const countWebquery = db.raw(`SELECT COUNT(*) AS total FROM document_sections ds INNER JOIN documents d ON ds.document_id = d.id WHERE ds.workspace_id = ? AND ${tsvector} @@ ${webquerySql}`, [
    workspace_id,
    query,
  ]);
  const countWebRows = await countWebquery;
  const webTotal = Number(countWebRows.rows?.[0]?.total ?? countWebRows[0]?.total ?? 0);

  if (webTotal > 0) {
    logger.info({ workspace_id, query, tsquery_fn: "websearch_to_tsquery", total: webTotal }, "Retrieve: websearch_to_tsquery succeeded");

    const resultQuery = db.raw(
      `SELECT
        d.id AS document_id,
        d.title AS document_title,
        d.url AS document_url,
        s.name AS source_name,
        ds.id AS section_id,
        ds.title AS section_title,
        ts_headline('english', ds.content, ${webquerySql}, 'MaxWords=40, MinWords=15, StartSel=<mark>, StopSel=</mark>') AS content_snippet,
        ts_rank(${tsvector}, ${webquerySql}) AS relevance_score
      FROM document_sections ds
      INNER JOIN documents d ON ds.document_id = d.id
      INNER JOIN sources s ON d.source_id = s.id
      WHERE ds.workspace_id = ? AND ${tsvector} @@ ${webquerySql}
      ORDER BY relevance_score DESC
      LIMIT ?`,
      [query, query, workspace_id, query, limit],
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

    return { results, total: webTotal };
  }

  // --- Attempt 2: Extract key terms, use OR'd to_tsquery ---
  const terms = extractKeyTerms(query);

  if (terms.length === 0) {
    logger.warn({ workspace_id, query }, "Retrieve: no key terms extracted from query");
    return { results: [], total: 0 };
  }

  // Build an OR query: for each term, just use the term itself as a lexeme
  // e.g. "clients | own | launch | program"
  const tsqueryTerms = terms.join(" | ");
  logger.info(
    { workspace_id, query, key_terms: terms, tsquery: tsqueryTerms },
    "Retrieve: falling back to key-term OR",
  );

  const countOr = db.raw(`SELECT COUNT(*) AS total FROM document_sections ds INNER JOIN documents d ON ds.document_id = d.id WHERE ds.workspace_id = ? AND ${tsvector} @@ to_tsquery('english', ?)`, [
    workspace_id,
    tsqueryTerms,
  ]);
  const countOrRows = await countOr;
  const orTotal = Number(countOrRows.rows?.[0]?.total ?? countOrRows[0]?.total ?? 0);

  if (orTotal > 0) {
    const resultQuery = db.raw(
      `SELECT
        d.id AS document_id,
        d.title AS document_title,
        d.url AS document_url,
        s.name AS source_name,
        ds.id AS section_id,
        ds.title AS section_title,
        ts_headline('english', ds.content, to_tsquery('english', ?), 'MaxWords=40, MinWords=15, StartSel=<mark>, StopSel=</mark>') AS content_snippet,
        ts_rank(${tsvector}, to_tsquery('english', ?)) AS relevance_score
      FROM document_sections ds
      INNER JOIN documents d ON ds.document_id = d.id
      INNER JOIN sources s ON d.source_id = s.id
      WHERE ds.workspace_id = ? AND ${tsvector} @@ to_tsquery('english', ?)
      ORDER BY relevance_score DESC
      LIMIT ?`,
      [tsqueryTerms, tsqueryTerms, workspace_id, tsqueryTerms, limit],
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

    return { results, total: orTotal };
  }

  // --- Attempt 3: Narrow to top 3 terms, OR'd ---
  const top3 = terms.slice(0, 3).join(" | ");
  logger.info(
    { workspace_id, query, key_terms: terms.slice(0, 3), tsquery: top3 },
    "Retrieve: falling back to top-3 key-term OR",
  );

  const countTop3 = db.raw(`SELECT COUNT(*) AS total FROM document_sections ds INNER JOIN documents d ON ds.document_id = d.id WHERE ds.workspace_id = ? AND ${tsvector} @@ to_tsquery('english', ?)`, [
    workspace_id,
    top3,
  ]);
  const countTop3Rows = await countTop3;
  const top3Total = Number(countTop3Rows.rows?.[0]?.total ?? countTop3Rows[0]?.total ?? 0);

  if (top3Total > 0) {
    const resultQuery = db.raw(
      `SELECT
        d.id AS document_id,
        d.title AS document_title,
        d.url AS document_url,
        s.name AS source_name,
        ds.id AS section_id,
        ds.title AS section_title,
        ts_headline('english', ds.content, to_tsquery('english', ?), 'MaxWords=40, MinWords=15, StartSel=<mark>, StopSel=</mark>') AS content_snippet,
        ts_rank(${tsvector}, to_tsquery('english', ?)) AS relevance_score
      FROM document_sections ds
      INNER JOIN documents d ON ds.document_id = d.id
      INNER JOIN sources s ON d.source_id = s.id
      WHERE ds.workspace_id = ? AND ${tsvector} @@ to_tsquery('english', ?)
      ORDER BY relevance_score DESC
      LIMIT ?`,
      [top3, top3, workspace_id, top3, limit],
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

    return { results, total: top3Total };
  }

  // All attempts failed
  logger.warn({ workspace_id, query, key_terms: terms }, "Retrieve: all strategies returned zero results");
  return { results: [], total: 0 };
}
