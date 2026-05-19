import { z } from "zod";

export const searchSchema = z.object({
  query: z.string().min(1).max(500),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export type SearchInput = z.infer<typeof searchSchema>;

export interface SearchResult {
  document_id: string;
  document_title: string;
  document_url: string | null;
  source_name: string;
  source_type: string;
  section_id: string;
  section_title: string | null;
  section_order: number;
  content_snippet: string;
  relevance_score: number;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
}
