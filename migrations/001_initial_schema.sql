CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ORGANIZATIONS

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- WORKSPACES

CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (organization_id, slug)
);

CREATE INDEX idx_workspaces_organization_id ON workspaces(organization_id);

-- WORKSPACE MEMBERS

CREATE TABLE workspace_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (workspace_id, user_id)
);

CREATE INDEX idx_workspace_members_workspace_id ON workspace_members(workspace_id);

-- SOURCES

CREATE TYPE source_type AS ENUM ('website', 'note', 'pdf', 'doc', 'faq', 'policy');
CREATE TYPE source_status AS ENUM ('active', 'inactive', 'error');

CREATE TABLE sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type source_type NOT NULL,
  name TEXT NOT NULL,
  base_url TEXT,
  status source_status NOT NULL DEFAULT 'active',
  config JSONB NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sources_organization_id ON sources(organization_id);
CREATE INDEX idx_sources_workspace_id ON sources(workspace_id);
CREATE INDEX idx_sources_type ON sources(type);

-- INGESTION JOBS

CREATE TYPE ingestion_job_type AS ENUM ('website_crawl', 'note_ingest', 'pdf_ingest', 'doc_ingest', 'faq_ingest', 'policy_ingest');
CREATE TYPE ingestion_job_status AS ENUM ('pending', 'running', 'success', 'failed');

CREATE TABLE ingestion_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  type ingestion_job_type NOT NULL,
  status ingestion_job_status NOT NULL DEFAULT 'pending',
  config JSONB NOT NULL DEFAULT '{}',
  raw_response JSONB,
  metadata JSONB NOT NULL DEFAULT '{}',
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ingestion_jobs_organization_id ON ingestion_jobs(organization_id);
CREATE INDEX idx_ingestion_jobs_workspace_id ON ingestion_jobs(workspace_id);
CREATE INDEX idx_ingestion_jobs_source_id ON ingestion_jobs(source_id);
CREATE INDEX idx_ingestion_jobs_status ON ingestion_jobs(status);

-- DOCUMENTS

CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  ingestion_job_id UUID REFERENCES ingestion_jobs(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  url TEXT,
  content TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_organization_id ON documents(organization_id);
CREATE INDEX idx_documents_workspace_id ON documents(workspace_id);
CREATE INDEX idx_documents_source_id ON documents(source_id);
CREATE INDEX idx_documents_ingestion_job_id ON documents(ingestion_job_id);

-- DOCUMENT SECTIONS

CREATE TABLE document_sections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  title TEXT,
  content TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_document_sections_document_id ON document_sections(document_id);
CREATE INDEX idx_document_sections_organization_id ON document_sections(organization_id);

-- AUDIT LOGS

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  workspace_id UUID,
  actor_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  changes JSONB NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_organization_id ON audit_logs(organization_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
