export interface Organization {
  id: string;
  name: string;
  slug: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Workspace {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: string;
  created_at: string;
  updated_at: string;
}

export type SourceType = "website" | "note" | "pdf" | "doc" | "faq" | "policy";
export type SourceStatus = "active" | "inactive" | "error";

export interface Source {
  id: string;
  organization_id: string;
  workspace_id: string;
  type: SourceType;
  name: string;
  base_url: string | null;
  status: SourceStatus;
  config: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type IngestionJobType =
  | "website_crawl"
  | "note_ingest"
  | "pdf_ingest"
  | "doc_ingest"
  | "faq_ingest"
  | "policy_ingest";

export type IngestionJobStatus = "pending" | "running" | "success" | "failed";

export interface IngestionJob {
  id: string;
  organization_id: string;
  workspace_id: string;
  source_id: string;
  type: IngestionJobType;
  status: IngestionJobStatus;
  config: Record<string, unknown>;
  raw_response: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  organization_id: string;
  workspace_id: string;
  source_id: string;
  ingestion_job_id: string | null;
  title: string;
  url: string | null;
  content: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DocumentSection {
  id: string;
  organization_id: string;
  workspace_id: string;
  document_id: string;
  title: string | null;
  content: string | null;
  order_index: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  actor_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  changes: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
}
