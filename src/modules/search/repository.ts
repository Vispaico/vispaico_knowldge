import { db } from "../../lib/db.js";
import type { SearchInput, SearchResult, SearchResponse } from "./schema.js";

export async function searchWorkspace(
  workspace_id: string,
  input: SearchInput,
): Promise<SearchResponse> {
  const { query, limit, offset } = input;

  // Count total matching sections
  const countRows = await db("document_sections AS ds")
    .join("documents AS d", "ds.document_id", "d.id")
    .where("ds.workspace_id", workspace_id)
    .whereRaw(
      `to_tsvector('english', coalesce(ds.title, '') || ' ' || coalesce(ds.content, '')) @@ plainto_tsquery('english', ?)`,
      [query],
    )
    .count({ total: "*" })
    .first();

  const total = Number(countRows?.total ?? 0);

  if (total === 0) {
    return { results: [], total: 0, query };
  }

  // Fetch ranked results with headline snippets
  const rows = await db("document_sections AS ds")
    .join("documents AS d", "ds.document_id", "d.id")
    .join("sources AS s", "d.source_id", "s.id")
    .where("ds.workspace_id", workspace_id)
    .whereRaw(
      `to_tsvector('english', coalesce(ds.title, '') || ' ' || coalesce(ds.content, '')) @@ plainto_tsquery('english', ?)`,
      [query],
    )
    .select(
      "d.id AS document_id",
      "d.title AS document_title",
      "d.url AS document_url",
      "s.name AS source_name",
      "s.type AS source_type",
      "ds.id AS section_id",
      "ds.title AS section_title",
      "ds.order_index AS section_order",
      db.raw(
        `ts_headline('english', ds.content, plainto_tsquery('english', ?), 'MaxWords=40, MinWords=15, StartSel=<mark>, StopSel=</mark>') AS content_snippet`,
        [query],
      ),
      db.raw(
        `ts_rank(to_tsvector('english', coalesce(ds.title, '') || ' ' || coalesce(ds.content, '')), plainto_tsquery('english', ?)) AS relevance_score`,
        [query],
      ),
    )
    .orderBy("relevance_score", "desc")
    .limit(limit)
    .offset(offset);

  const results: SearchResult[] = rows.map((r: Record<string, unknown>) => ({
    document_id: r.document_id as string,
    document_title: r.document_title as string,
    document_url: (r.document_url as string | null) ?? null,
    source_name: r.source_name as string,
    source_type: r.source_type as string,
    section_id: r.section_id as string,
    section_title: (r.section_title as string | null) ?? null,
    section_order: Number(r.section_order),
    content_snippet: (r.content_snippet as string | null) ?? "",
    relevance_score: Number(r.relevance_score),
  }));

  return { results, total, query };
}
