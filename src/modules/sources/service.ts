import { NotFoundError } from "../../lib/errors.js";
import type { Source } from "../../types/index.js";
import * as wsRepo from "../workspaces/repository.js";
import * as repo from "./repository.js";

export async function createWebsiteSource(data: {
  workspace_id: string;
  name: string;
  base_url: string;
  metadata?: Record<string, unknown>;
}): Promise<Source> {
  const workspace = await wsRepo.findWorkspaceById(data.workspace_id);
  if (!workspace) {
    throw new NotFoundError("Workspace", data.workspace_id);
  }

  return repo.createSource({
    organization_id: workspace.organization_id,
    workspace_id: data.workspace_id,
    type: "website",
    name: data.name,
    base_url: data.base_url,
    metadata: data.metadata,
  });
}

export async function getSource(id: string): Promise<Source> {
  const source = await repo.findSourceById(id);
  if (!source) {
    throw new NotFoundError("Source", id);
  }
  return source;
}
