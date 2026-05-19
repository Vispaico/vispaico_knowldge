import { db } from "../../lib/db.js";
import type { Document, DocumentSection } from "../../types/index.js";

export async function createDocument(data: {
  organization_id: string;
  workspace_id: string;
  source_id: string;
  ingestion_job_id: string;
  title: string;
  url?: string;
  content?: string;
  metadata?: Record<string, unknown>;
}): Promise<Document> {
  const [row] = await db("documents")
    .insert({
      organization_id: data.organization_id,
      workspace_id: data.workspace_id,
      source_id: data.source_id,
      ingestion_job_id: data.ingestion_job_id,
      title: data.title ?? "Untitled",
      url: data.url ?? null,
      content: data.content ?? null,
      metadata: data.metadata ?? {},
    })
    .returning("*");

  return row;
}

export async function createDocumentSection(data: {
  organization_id: string;
  workspace_id: string;
  document_id: string;
  title?: string;
  content?: string;
  order_index: number;
  metadata?: Record<string, unknown>;
}): Promise<DocumentSection> {
  const [row] = await db("document_sections")
    .insert({
      organization_id: data.organization_id,
      workspace_id: data.workspace_id,
      document_id: data.document_id,
      title: data.title ?? null,
      content: data.content ?? null,
      order_index: data.order_index,
      metadata: data.metadata ?? {},
    })
    .returning("*");

  return row;
}

export async function findDocumentById(id: string): Promise<Document | undefined> {
  return db("documents").where({ id }).first();
}

export async function findDocumentsBySourceId(source_id: string): Promise<Document[]> {
  return db("documents").where({ source_id }).orderBy("created_at", "asc");
}

export async function findSectionsByDocumentId(document_id: string): Promise<DocumentSection[]> {
  return db("document_sections").where({ document_id }).orderBy("order_index", "asc");
}

export async function countDocumentsBySourceId(source_id: string): Promise<number> {
  const [result] = await db("documents").where({ source_id }).count();
  return Number(result.count ?? 0);
}

export async function findDocumentByUrlInSource(
  url: string,
  source_id: string,
  workspace_id: string,
): Promise<Document | undefined> {
  return db("documents").where({ url, source_id, workspace_id }).first();
}
