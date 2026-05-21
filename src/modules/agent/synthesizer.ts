/**
 * Answer synthesis for agent chat.
 *
 * Two-tier approach:
 * 1. Try LLM-based synthesis from retrieved context (premium, conversational)
 * 2. Fall back to template-based answers if LLM is unavailable or errors
 *
 * NEVER concatenates raw snippet text into the answer string.
 */

import { chatCompletion } from "../../lib/llm.js";
import { logger } from "../../lib/logger.js";

interface ContextItem {
  document_title: string;
  document_url: string | null;
  section_title: string | null;
  content_snippet: string;
}

const SYSTEM_PROMPT = `You are a friendly, premium knowledge assistant for Vispaico — a company that helps startups and businesses build and ship products faster through studio and consulting services.

Your job is to answer the user's question based ONLY on the retrieved context provided below. Follow these rules:

1. Use ONLY the information in the retrieved context. Do not invent facts, services, pricing, or claims not present in the context.
2. Write short, conversational answers (2-4 sentences typically). Sound human, not robotic.
3. If the context does not fully answer the question, say so briefly and direct the user to the best page(s) from the context.
4. Never output raw snippet text. Always paraphrase into natural flowing prose.
5. Never mention "the retrieved context", "the snippets", or "the documents" — just answer the question naturally.
6. If the context is very weak or empty, produce a graceful answer like "I couldn't find a precise answer to that in the available pages, but here are the most relevant ones to check."
7. Keep the tone warm, confident, and helpful.`;

/**
 * Try to synthesize an answer using the LLM. Returns null if LLM is unavailable or fails.
 */
async function synthesizeWithLlm(
  question: string,
  contexts: ContextItem[],
  confidence: "high" | "medium" | "low",
): Promise<string | null> {
  const contextText = contexts
    .map(
      (c, i) =>
        `[${i + 1}] Page: "${c.document_title}"${c.section_title ? ` — Section: "${c.section_title}"` : ""}\nContent: ${c.content_snippet}`,
    )
    .join("\n\n");

  const confidenceNote =
    confidence === "high"
      ? ""
      : confidence === "medium"
        ? "Note: The context below may only partially answer the question. Be transparent and suggest the best pages."
        : "Note: The context below is weak. Be honest that you couldn't find a precise answer, and direct the user to the best available pages.";

  const userMessage = `Context:\n${contextText}\n\n${confidenceNote}\n\nQuestion: ${question}`;

  const result = await chatCompletion([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ]);

  return result;
}

// ── Template fallbacks ──────────────────────────────────────────────

function templateFallback(
  intent: string,
  contexts: ContextItem[],
  confidence: "high" | "medium" | "low",
): string {
  const bestTitle = contexts[0]?.document_title;

  if (confidence === "low" || !contexts.length) {
    const base = "I could not find enough detail in the sources to fully answer your question.";
    if (bestTitle) {
      return `${base} The best page to check is "${bestTitle}".`;
    }
    return `${base} Please check the relevant page linked below.`;
  }

  switch (intent) {
    case "ownership":
      return (
        "At the end of the Launch Program, you own the code, infrastructure, content, " +
        "and systems built for your company. Vispaico presents the program as a full " +
        "handover rather than an ongoing dependency."
      );

    case "pricing":
      return (
        "The Launch Program page explains the $24,800 / 6 month offer and breaks down what is included. " +
        "It is the best place to start."
      );

    case "contact":
      return "The best next step is to reach out to Vispaico directly through the contact page to discuss your project.";

    case "services": {
      // For services, try to reference more if we have context
      const titles = contexts.map((c) => `"${c.document_title}"`);
      const uniqueTitles = [...new Set(titles)];
      if (uniqueTitles.length > 0) {
        return (
          `Vispaico offers studio and consulting services to help companies build and ship products faster. ` +
          `Based on the available pages, the relevant ones are ${uniqueTitles.join(", ")}. ` +
          `The Services page has the full breakdown.`
        );
      }
      return (
        "Vispaico offers studio and consulting services to help companies build and ship products faster. " +
        "The Services page has the full breakdown."
      );
    }

    case "process":
    case "faq":
      return (
        "The FAQ page covers this topic in detail. " +
        "Based on what we retrieved, the main points are explained on the site."
      );

    case "about":
      return (
        "Vispaico was founded to help companies move fast and build great products. " +
        "The About page has more on the company, team, and mission."
      );

    default: {
      if (bestTitle) {
        const moreTitles = contexts
          .slice(1, 3)
          .map((c) => `"${c.document_title}"`)
          .filter(Boolean);
        const suffix = moreTitles.length ? ` You might also want to check ${moreTitles.join(", ")}.` : "";
        return `I found relevant information in "${bestTitle}". Please visit the page for the full details.${suffix}`;
      }
      return "I found relevant information. Please check the pages linked below for details.";
    }
  }
}

/**
 * Compute a simple confidence level based on retrieved contexts.
 */
function computeConfidence(contexts: ContextItem[]): "high" | "medium" | "low" {
  if (contexts.length === 0) return "low";

  const totalContentLength = contexts.reduce((sum, c) => sum + c.content_snippet.length, 0);

  if (contexts.length >= 2 && totalContentLength > 200) return "high";
  if (contexts.length >= 1 && totalContentLength > 60) return "medium";
  return "low";
}

/**
 * Synthesize a natural-language answer from retrieved context.
 *
 * Priority:
 * 1. LLM-based synthesis (if configured and available)
 * 2. Template fallback (always available)
 */
export async function synthesizeAnswer(
  question: string,
  intent: string,
  contexts: ContextItem[],
): Promise<string> {
  const confidence = computeConfidence(contexts);
  const hasContent = contexts.length > 0;

  logger.debug({ intent, confidence, contexts: contexts.length }, "Synthesizing answer");

  if (hasContent) {
    // Try LLM first — graceful failure falls back to templates
    const llmAnswer = await synthesizeWithLlm(question, contexts, confidence);
    if (llmAnswer) {
      return llmAnswer;
    }
  }

  // Fallback to template
  return templateFallback(intent, contexts, confidence);
}
