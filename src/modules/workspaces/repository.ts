import { db } from "../../lib/db.js";
import type { Workspace } from "../../types/index.js";

export async function createWorkspace(data: {
  organization_id: string;
  name: string;
  slug: string;
  description?: string;
}): Promise<Workspace> {
  const [row] = await db("workspaces")
    .insert({
      organization_id: data.organization_id,
      name: data.name,
      slug: data.slug,
      description: data.description ?? null,
    })
    .returning("*");

  return row;
}

export async function findWorkspaceById(id: string): Promise<Workspace | undefined> {
  return db("workspaces").where({ id }).first();
}

export async function findWorkspaceByOrgAndSlug(
  organization_id: string,
  slug: string,
): Promise<Workspace | undefined> {
  return db("workspaces").where({ organization_id, slug }).first();
}
