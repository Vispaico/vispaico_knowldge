import { NotFoundError } from "../../lib/errors.js";
import type { Document, DocumentSection } from "../../types/index.js";
import * as repo from "./repository.js";

export async function getDocument(id: string): Promise<{ document: Document; sections: DocumentSection[] }> {
  const document = await repo.findDocumentById(id);
  if (!document) {
    throw new NotFoundError("Document", id);
  }
  const sections = await repo.findSectionsByDocumentId(id);
  return { document, sections };
}

export async function getDocumentsBySource(
  source_id: string,
): Promise<{ documents: Document[]; total: number }> {
  const documents = await repo.findDocumentsBySourceId(source_id);
  const total = documents.length;
  return { documents, total };
}
