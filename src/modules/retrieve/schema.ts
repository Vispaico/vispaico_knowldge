import { z } from "zod";

export const retrieveSchema = z.object({
  query: z.string().min(1).max(500),
  limit: z.coerce.number().int().min(1).max(50).optional().default(8),
});

export type RetrieveInput = z.infer<typeof retrieveSchema>;

export interface RetrievedContext {
  document_id: string;
  document_title: string;
  document_url: string | null;
  source_name: string;
  section_id: string;
  section_title: string | null;
  content_snippet: string;
  relevance_score: number;
}

export interface RetrieveResponse {
  query: string;
  contexts: RetrievedContext[];
}
