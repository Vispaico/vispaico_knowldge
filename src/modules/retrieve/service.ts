import { NotFoundError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import * as repo from "./repository.js";
import * as wsRepo from "../workspaces/repository.js";
import type { RetrieveInput, RetrieveResponse, RetrievedContext } from "./schema.js";

// Max sections from the same document to include, to avoid one doc dominating results
const MAX_SECTIONS_PER_DOCUMENT = 3;

export async function retrieveWorkspace(
  workspace_id: string,
  input: RetrieveInput,
): Promise<RetrieveResponse> {
  const workspace = await wsRepo.findWorkspaceById(workspace_id);
  if (!workspace) {
    throw new NotFoundError("Workspace", workspace_id);
  }

  logger.info({ workspace_id, query: input.query, limit: input.limit }, "Workspace retrieve");

  // Use dedicated retrieve repository with cascade of query strategies
  const fetchLimit = Math.min(input.limit * 3, 50);
  const result = await repo.retrieveContexts(workspace_id, input.query, fetchLimit);

  if (result.total === 0) {
    logger.warn({ workspace_id, query: input.query }, "Retrieve returned zero results across all strategies");
    return { query: input.query, contexts: [] };
  }

  // Group hits by document_id, keep top N per doc, flatten sorted by relevance
  const groups = new Map<string, RetrievedContext[]>();

  for (const r of result.results) {
    const ctx: RetrievedContext = {
      document_id: r.document_id,
      document_title: r.document_title,
      document_url: r.document_url,
      source_name: r.source_name,
      section_id: r.section_id,
      section_title: r.section_title,
      content_snippet: r.content_snippet,
      relevance_score: r.relevance_score,
    };

    const group = groups.get(r.document_id);
    if (group) {
      group.push(ctx);
    } else {
      groups.set(r.document_id, [ctx]);
    }
  }

  // For each document, sort sections by relevance desc and cap per-document count
  const deduped: RetrievedContext[] = [];
  for (const entries of groups.values()) {
    entries.sort((a, b) => b.relevance_score - a.relevance_score);
    deduped.push(...entries.slice(0, MAX_SECTIONS_PER_DOCUMENT));
  }

  // Sort overall by relevance and trim to the requested limit
  deduped.sort((a, b) => b.relevance_score - a.relevance_score);
  const contexts = deduped.slice(0, input.limit);

  logger.info(
    { workspace_id, query: input.query, raw: result.results.length, after_dedup: deduped.length, returned: contexts.length },
    "Workspace retrieve results",
  );

  return { query: input.query, contexts };
}
