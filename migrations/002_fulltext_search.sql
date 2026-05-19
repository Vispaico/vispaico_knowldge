-- Full-text search support for documents and document_sections
-- Adds GIN indexes on tsvector columns for performant workspace search

-- Documents: index on content + title combined
CREATE INDEX IF NOT EXISTS idx_documents_fts
  ON documents
  USING GIN (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '')));

-- Document sections: index on content + title combined
CREATE INDEX IF NOT EXISTS idx_document_sections_fts
  ON document_sections
  USING GIN (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '')));
