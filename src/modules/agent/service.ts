import { NotFoundError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import * as retrieveService from "../retrieve/service.js";
import * as wsRepo from "../workspaces/repository.js";
import type { AgentChatInput, AgentChatResponse, Citation, Action } from "./schema.js";

// Map of topic keywords to suggested actions
const TOPIC_ACTIONS: Array<{ keywords: string[]; label: string; url: string }> = [
  { keywords: ["pricing", "price", "cost", "plan", "subscription", "pay", "payment", "24,800", "24800"], label: "See Launch Program", url: "https://vispaico.com/en/launch" },
  { keywords: ["launch", "program"], label: "See Launch Program", url: "https://vispaico.com/en/launch" },
  { keywords: ["service", "offer", "solution", "consulting", "studio"], label: "See Services", url: "https://vispaico.com/en/services" },
  { keywords: ["owner", "ownership", "own", "ip", "intellectual property", "codebase", "source code"], label: "Ownership FAQ", url: "https://vispaico.com/en/faq" },
  { keywords: ["process", "timeline", "timelines", "duration", "how long", "roadmap", "milestone"], label: "Process FAQ", url: "https://vispaico.com/en/faq" },
  { keywords: ["faq", "question", "support", "help"], label: "FAQ Page", url: "https://vispaico.com/en/faq" },
  { keywords: ["about", "company", "founder", "team", "vision", "mission"], label: "About Us", url: "https://vispaico.com/en/about" },
  { keywords: ["contact", "call", "quote", "consultation", "reach", "email", "phone", "meet"], label: "Contact Us", url: "https://vispaico.com/en/contact" },
];

function findActions(message: string, contexts: { document_url?: string | null }[]): Action[] {
  const lower = message.toLowerCase();
  const suggested: Action[] = [];

  for (const topic of TOPIC_ACTIONS) {
    if (topic.keywords.some((kw) => lower.includes(kw))) {
      // Deduplicate by url
      if (!suggested.some((a) => a.url === topic.url)) {
        suggested.push({ type: "open_page", label: topic.label, url: topic.url });
      }
    }
  }

  // If no topic match, derive from the top retrieved context's URL
  if (suggested.length === 0 && contexts.length > 0) {
    const topUrl = contexts[0].document_url;
    if (topUrl) {
      suggested.push({ type: "open_page", label: "View Page", url: topUrl });
    }
  }

  return suggested;
}

function buildAnswer(
  contexts: { document_title: string; content_snippet: string }[],
): string {
  if (contexts.length === 0) {
    return "I could not find relevant information to answer your question. Please try rephrasing or visit the FAQ page for more details.";
  }

  // Build a summary answer from the top context snippets
  const parts: string[] = [];

  for (let i = 0; i < Math.min(contexts.length, 3); i++) {
    const ctx = contexts[i];
    // Strip <mark> tags for cleaner answer text
    const clean = ctx.content_snippet.replace(/<\/?mark>/g, "");
    if (clean.trim()) {
      parts.push(clean);
    }
  }

  if (parts.length === 0) {
    return `Based on the retrieved information from "${contexts[0].document_title}", I found relevant results but could not extract a clean snippet. Please visit the page directly.`;
  }

  return parts.join("\n\n");
}

export async function agentChat(
  workspace_id: string,
  input: AgentChatInput,
): Promise<AgentChatResponse> {
  const workspace = await wsRepo.findWorkspaceById(workspace_id);
  if (!workspace) {
    throw new NotFoundError("Workspace", workspace_id);
  }

  logger.info({ workspace_id, message: input.message }, "Agent chat");

  // Step 1: Retrieve relevant context
  const retrieveResult = await retrieveService.retrieveWorkspace(workspace_id, {
    query: input.message,
    limit: 8,
  });

  const contexts = retrieveResult.contexts;

  // Step 2: Build answer from context
  const answer = buildAnswer(contexts);

  // Step 3: Build citations
  const citations: Citation[] = contexts.map((ctx) => ({
    document_title: ctx.document_title,
    document_url: ctx.document_url,
    section_title: ctx.section_title,
  }));

  // Step 4: Build smart action suggestions
  const actions = findActions(input.message, contexts);

  logger.info(
    { workspace_id, contexts_used: contexts.length, actions: actions.length },
    "Agent chat response",
  );

  return {
    answer,
    citations,
    actions,
    contexts_used: contexts.length,
  };
}
