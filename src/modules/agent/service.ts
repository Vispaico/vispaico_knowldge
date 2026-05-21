import { NotFoundError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import * as retrieveService from "../retrieve/service.js";
import * as wsRepo from "../workspaces/repository.js";
import { detectIntent, buildActions } from "./intent.js";
import { cleanSnippet, isLowSignalSnippet } from "./cleanup.js";
import { synthesizeAnswer } from "./synthesizer.js";
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

  // Step 4: Build synthesized answer — NEVER append raw snippet text
  const answer = await synthesizeAnswer(input.message, intent.primary, cleanedContexts);

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
