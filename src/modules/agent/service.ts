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

  // Step 3: Clean and filter contexts
  const cleanedContexts = retrieveResult.contexts
    .map((ctx) => ({
      ...ctx,
      content_snippet: cleanSnippet(ctx.content_snippet),
    }))
    .filter((ctx) => !isLowSignalSnippet(ctx.content_snippet) && ctx.content_snippet.length >= 20);

  // Step 4: Build synthesized answer
  const answer = synthesizeAnswer(intent.primary, cleanedContexts);

  // Step 5: Build citations (max 3, most relevant only)
  const citations: Citation[] = cleanedContexts.slice(0, 3).map((ctx) => ({
    document_title: ctx.document_title,
    document_url: ctx.document_url,
    section_title: ctx.section_title,
  }));

  // Step 6: Build actions from intent detection
  const actions = buildActions(intent.all_intents);

  // Step 7: Limit contexts_used to 2-4
  const contextsUsed = Math.min(Math.max(cleanedContexts.length, 2), 4);

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

function synthesizeAnswer(
  intent: string,
  contexts: Array<{ document_title: string; document_url?: string | null; content_snippet: string }>,
): string {
  if (contexts.length === 0) {
    return "I could not find relevant information to answer your question. Please try rephrasing or visit one of the pages linked below for more details.";
  }

  // Extract the most relevant content fragments
  const relevantFacts: string[] = [];
  const seenTitles = new Set<string>();

  for (const ctx of contexts) {
    if (seenTitles.size >= 3 && relevantFacts.length >= 3) break;
    seenTitles.add(ctx.document_title);

    const clean = ctx.content_snippet;
    if (clean.length < 30) continue;

    relevantFacts.push(clean);
  }

  // If we have no usable content after cleaning
  if (relevantFacts.length === 0) {
    return `Based on "${contexts[0].document_title}": I found relevant information but could not extract clear text. Please visit the page directly.`;
  }

  // Build a concise 2-5 sentence answer based on intent + facts
  return buildGroundedAnswer(intent, contexts, relevantFacts);
}

function buildGroundedAnswer(
  intent: string,
  contexts: Array<{ document_title: string; document_url?: string | null }>,
  facts: string[],
): string {
  const bestTitle = contexts[0]?.document_title ?? "the page";
  const bestFacts = facts.slice(0, 3);

  // Intent-specific answer formats
  switch (intent) {
    case "contact": {
      return `The best next step is to contact Vispaico directly or book a call through the contact page. ${bestFacts[0] ?? ""}`;
    }
    case "pricing": {
      // If we have a concrete pricing snippet, lead with it
      const pricingFact = bestFacts[0] ?? "";
      if (pricingFact) {
        return `${pricingFact}`;
      }
      return `The best page to read is the Launch Program page. It explains the offer and breaks down what is included.`;
    }
    case "ownership": {
      const ownershipFact = bestFacts[0] ?? "";
      if (ownershipFact) {
        return `Yes, you retain full ownership. ${ownershipFact}`;
      }
      return `At the end of the program, you own the code, infrastructure, content, and systems built for your company. Vispaico positions the program as a handover, not a dependency model.`;
    }
    case "services": {
      return `Vispaico offers a range of services to help build and scale your company. ${bestFacts[0] ?? ""}`;
    }
    case "about": {
      return `Vispaico was founded to help companies move fast and build great products. ${bestFacts[0] ?? ""}`;
    }
    default: {
      // General answer: synthesize from top facts
      const parts: string[] = [];
      for (const fact of bestFacts) {
        // Don't include facts that are too short or nav-like
        if (fact.length >= 40 && !parts.includes(fact)) {
          parts.push(fact);
        }
      }
      if (parts.length > 0) {
        // Use first sentence as lead, then supplement
        const answer = parts.join(" ");
        // Keep to ~3 sentences max
        const sentences = answer.match(/[^.!?]+[.!?]+/g) ?? [answer];
        return sentences.slice(0, 3).join(" ");
      }
      return `Based on "${bestTitle}": I found relevant information. Please visit the page for full details.`;
    }
  }
}
