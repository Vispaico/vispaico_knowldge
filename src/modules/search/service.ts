import { NotFoundError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import type { SearchInput, SearchResponse } from "./schema.js";
import * as repo from "./repository.js";
import * as wsRepo from "../workspaces/repository.js";

export async function searchWorkspace(
  workspace_id: string,
  input: SearchInput,
): Promise<SearchResponse> {
  const workspace = await wsRepo.findWorkspaceById(workspace_id);
  if (!workspace) {
    throw new NotFoundError("Workspace", workspace_id);
  }

  logger.info({ workspace_id, query: input.query, limit: input.limit, offset: input.offset }, "Workspace search");

  const result = await repo.searchWorkspace(workspace_id, input);

  logger.info({ workspace_id, query: input.query, total: result.total }, "Workspace search results");

  return result;
}
