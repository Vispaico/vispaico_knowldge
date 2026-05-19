import { NotFoundError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import * as repo from "./repository.js";
import * as wsRepo from "../workspaces/repository.js";
import type { RetrieveInput, RetrieveResponse, RetrievedContext } from "./schema.js";

// Max sections from the same document to include in results (diversity-first)
const MAX_SECTIONS_PER_DOCUMENT = 2;

export async function retrieveWorkspace(
  workspace_id: string,
  input: RetrieveInput,
): Promise<RetrieveResponse> {
  const workspace = await wsRepo.findWorkspaceById(workspace_id);
  if (!workspace) {
    throw new NotFoundError("Workspace", workspace_id);
  }

  logger.info({ workspace_id, query: input.query, limit: input.limit }, "Workspace retrieve");

  // Fetch extra results so we have enough candidates for diversity-based selection
  const fetchLimit = Math.min(input.limit * 4, 60);
  const result = await repo.retrieveContexts(workspace_id, input.query, fetchLimit);

  if (result.total === 0 || result.results.length === 0) {
    logger.warn({ workspace_id, query: input.query }, "Retrieve returned zero results across all strategies");
    return { query: input.query, contexts: [] };
  }

  // Build the diversity-first selection using round-robin
  const contexts = selectDiverseContexts(result.results, input.limit, MAX_SECTIONS_PER_DOCUMENT);

  logger.info(
    { workspace_id, query: input.query, raw: result.results.length, returned: contexts.length },
    "Workspace retrieve results",
  );

  return { query: input.query, contexts };
}

/**
 * Select diverse contexts by taking the top section from each document first
 * (sorted by that section's relevance), then filling remaining slots
 * round-robin with additional sections. Caps at `maxPerDoc` per document.
 */
function selectDiverseContexts(
  items: RetrievedContext[],
  limit: number,
  maxPerDoc: number,
): RetrievedContext[] {
  // Group by document_id, sort each group by relevance desc
  const groups = new Map<string, RetrievedContext[]>();
  for (const item of items) {
    const g = groups.get(item.document_id);
    if (g) {
      g.push(item);
    } else {
      groups.set(item.document_id, [item]);
    }
  }

  // Sort each document's sections by relevance score descending
  for (const entries of groups.values()) {
    entries.sort((a, b) => b.relevance_score - a.relevance_score);
  }

  // Sort documents by their best section's relevance score
  const docEntries = Array.from(groups.entries())
    .map(([docId, sections]) => ({ docId, bestScore: sections[0].relevance_score, sections }))
    .sort((a, b) => b.bestScore - a.bestScore);

  const result: RetrievedContext[] = [];
  const taken = new Map<string, number>();

  // Round 1: one section from each document (highest scoring first)
  for (const entry of docEntries) {
    if (result.length >= limit) break;
    result.push(entry.sections[0]);
    taken.set(entry.docId, 1);
  }

  // Round 2+: round-robin additional sections from top documents
  if (result.length < limit) {
    let idx = 0;
    const maxIterations = docEntries.length * maxPerDoc * 2;
    let iterations = 0;

    while (result.length < limit && iterations < maxIterations) {
      iterations++;
      const entry = docEntries[idx % docEntries.length];
      const count = taken.get(entry.docId)!;

      if (count < maxPerDoc && count < entry.sections.length) {
        result.push(entry.sections[count]);
        taken.set(entry.docId, count + 1);
      }

      idx++;
    }
  }

  return result;
}
