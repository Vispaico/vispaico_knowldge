import { z } from "zod";

export const agentChatSchema = z.object({
  message: z.string().min(1).max(2000),
});

export type AgentChatInput = z.infer<typeof agentChatSchema>;

export interface Citation {
  document_title: string;
  document_url: string | null;
  section_title: string | null;
}

export interface Action {
  type: "open_page";
  label: string;
  url: string;
}

export interface AgentChatResponse {
  answer: string;
  citations: Citation[];
  actions: Action[];
  contexts_used: number;
}
