import { NotFoundError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import * as retrieveService from "../retrieve/service.js";
import * as wsRepo from "../workspaces/repository.js";
import { detectIntent, buildActions } from "./intent.js";
import { cleanSnippet, isLowSignalSnippet } from "./cleanup.js";
import type { AgentChatInput, AgentChatResponse, Citation } from "./schema.js";

export async function agentChat(
  workspace_id: string,
  input: AgentChatInput,
): Promise<AgentChatResponse> {
  const workspace = await wsRepo.findWorkspaceById(workspace_id);
  if (!workspace) {
    throw new NotFoundError("Workspace", workspace_id);
  }

  logger.info({ workspace_id, message: input.message }, "Agent chat");

  // Step 1: Detect intent and get URL boost list
  const intent = detectIntent(input.message);
  const boostUrls = intent.boost_urls;

  // Step 2: Retrieve with intent-aware boosting
  const retrieveResult = await retrieveService.retrieveWorkspace(
    workspace_id,
    { query: input.message, limit: 8 },
    { boost_urls: boostUrls.length > 0 ? boostUrls : undefined },
  );

  // Step 3: Clean and filter contexts (used for citations + confidence check only)
  const cleanedContexts = retrieveResult.contexts
    .map((ctx) => ({
      ...ctx,
      content_snippet: cleanSnippet(ctx.content_snippet),
    }))
    .filter((ctx) => !isLowSignalSnippet(ctx.content_snippet) && ctx.content_snippet.length >= 30);

  const hasRelevantContent = cleanedContexts.length > 0;

  // Step 4: Build synthesized answer — NEVER append raw snippet text
  const answer = synthesizeAnswer(intent.primary, hasRelevantContent, cleanedContexts);

  // Step 5: Build citations (max 3, meaningful only)
  const citations: Citation[] = cleanedContexts
    .filter((c) => c.document_title && c.document_title !== "Untitled")
    .slice(0, 3)
    .map((ctx) => ({
      document_title: ctx.document_title,
      document_url: ctx.document_url,
      section_title: ctx.section_title,
    }));

  // Step 6: Build actions (prefer 1 primary, optionally 1 secondary)
  const actions = buildActions(intent.all_intents).slice(0, 2);

  // Step 7: contexts_used target: 2-3
  const contextsUsed = Math.min(cleanedContexts.length, 3);

  logger.info(
    { workspace_id, contexts_raw: retrieveResult.contexts.length, contexts_clean: cleanedContexts.length, intent: intent.primary, actions: actions.length },
    "Agent chat response",
  );

  return {
    answer,
    citations,
    actions,
    contexts_used: contextsUsed,
  };
}

/**
 * Synthesize a standalone answer from intent + confidence check only.
 * NEVER concatenates raw snippet text into the answer string.
 */
function synthesizeAnswer(
  intent: string,
  hasContent: boolean,
  contexts: Array<{ document_title: string }>,
): string {
  const bestTitle = contexts[0]?.document_title;

  if (!hasContent) {
    const base = "I could not find enough detail in the sources to fully answer your question.";
    if (bestTitle) {
      return `${base} I suggest reading "${bestTitle}" for more information.`;
    }
    return `${base} Please check the relevant page linked below.`;
  }

  switch (intent) {
    case "ownership": {
      return (
        "At the end of the Launch Program, you own the code, infrastructure, content, " +
        "and systems built for your company. Vispaico positions the program as a handover, " +
        "not a dependency model."
      );
    }

    case "pricing": {
      return (
        "The best page to read is the Launch Program page. " +
        "It explains the $24,800 / 6 month offer and breaks down what is included."
      );
    }

    case "contact": {
      return (
        "The best next step is to contact Vispaico directly or book a call through the contact page."
      );
    }

    case "services": {
      return (
        "Vispaico offers studio and consulting services to help companies build and ship products faster. " +
        "The Services page has the full breakdown."
      );
    }

    case "process":
    case "faq": {
      return (
        "The FAQ page covers this topic in detail. " +
        "Based on what we retrieved, the main points are explained on the site."
      );
    }

    case "about": {
      return (
        "Vispaico was founded to help companies move fast and build great products. " +
        "The About page has more on the company, team, and mission."
      );
    }

    default: {
      if (bestTitle) {
        return `I found relevant information in "${bestTitle}". Please visit the page for the full details.`;
      }
      return "I found relevant information. Please check the pages linked below for details.";
    }
  }
}
