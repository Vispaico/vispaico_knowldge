import { db } from "../../lib/db.js";
import type { Source, SourceType } from "../../types/index.js";

export async function createSource(data: {
  organization_id: string;
  workspace_id: string;
  type: SourceType;
  name: string;
  base_url?: string;
  metadata?: Record<string, unknown>;
}): Promise<Source> {
  const [row] = await db("sources")
    .insert({
      organization_id: data.organization_id,
      workspace_id: data.workspace_id,
      type: data.type,
      name: data.name,
      base_url: data.base_url ?? null,
      metadata: data.metadata ?? {},
    })
    .returning("*");

  return row;
}

export async function findSourceById(id: string): Promise<Source | undefined> {
  return db("sources").where({ id }).first();
}
