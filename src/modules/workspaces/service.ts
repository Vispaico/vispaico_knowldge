import { ConflictError, NotFoundError } from "../../lib/errors.js";
import type { Workspace } from "../../types/index.js";
import * as orgRepo from "../organizations/repository.js";
import * as repo from "./repository.js";

export async function createWorkspace(data: {
  organization_id: string;
  name: string;
  slug: string;
  description?: string;
}): Promise<Workspace> {
  const org = await orgRepo.findOrganizationById(data.organization_id);
  if (!org) {
    throw new NotFoundError("Organization", data.organization_id);
  }

  const existing = await repo.findWorkspaceByOrgAndSlug(data.organization_id, data.slug);
  if (existing) {
    throw new ConflictError(
      `Workspace with slug '${data.slug}' already exists in this organization`,
    );
  }

  return repo.createWorkspace(data);
}
