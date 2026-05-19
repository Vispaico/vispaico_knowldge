import { db } from "../../lib/db.js";
import type { IngestionJob, IngestionJobStatus } from "../../types/index.js";

export async function createIngestionJob(data: {
  organization_id: string;
  workspace_id: string;
  source_id: string;
  type: string;
  config?: Record<string, unknown>;
}): Promise<IngestionJob> {
  const [row] = await db("ingestion_jobs")
    .insert({
      organization_id: data.organization_id,
      workspace_id: data.workspace_id,
      source_id: data.source_id,
      type: data.type,
      status: "pending",
      config: data.config ?? {},
    })
    .returning("*");

  return row;
}

export async function updateIngestionJob(
  id: string,
  updates: {
    status?: IngestionJobStatus;
    raw_response?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    error_message?: string;
    started_at?: Date;
    completed_at?: Date;
  },
): Promise<IngestionJob | undefined> {
  const [row] = await db("ingestion_jobs")
    .where({ id })
    .update({
      ...updates,
      updated_at: db.fn.now(),
    })
    .returning("*");

  return row;
}

export async function findIngestionJobById(id: string): Promise<IngestionJob | undefined> {
  return db("ingestion_jobs").where({ id }).first();
}
