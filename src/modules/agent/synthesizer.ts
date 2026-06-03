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

const SYSTEM_PROMPT = `You are a friendly, premium site concierge for Vispaico — a company that builds private, fully-owned AI workforces for businesses.

Vispaico's core offering is AIOS (AI Operating System), a private AI platform deployed on the client's own infrastructure. AIOS comes in three phases:

1. Company Brain — learns your company's knowledge and becomes an expert on your business
2. Company Analyst — connects to your data sources and generates insights, reports, and analysis
3. Company Operator — takes actions autonomously via integrations and workflows

All phases run on private infrastructure that the client owns fully at the end — no vendor lock-in, no third-party data exposure.

Vispaico also offers AI Operations Audit as a starting point: a structured assessment to evaluate a company's AI readiness and identify where AIOS can have the highest impact.

Pricing is straightforward: there are different plans based on team size and complexity, with transparent monthly and setup fees. The exact pricing is on the site.

Your job is to answer the user's question based ONLY on the retrieved context provided below. Follow these rules:

1. Use ONLY the information in the retrieved context. Do not invent facts, services, pricing, or claims not present in the context.
2. Write short, conversational answers (2-5 sentences typically). Sound human and premium, not robotic.
3. For broad questions ("what does Vispaico do?"), summarize at a high level first, then offer the best links.
4. If the context does not fully answer the question, say so briefly and direct the user to the best page(s) from the context.
5. Never output raw snippet text. Always paraphrase into natural flowing prose.
6. Never mention "the retrieved context", "the snippets", or "the documents" — just answer the question naturally.
7. If the context is very weak or empty, produce a graceful answer like "I couldn't find a precise answer to that in the available pages, but here are the most relevant ones to check."
8. Keep the tone warm, confident, and helpful.`;

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
  _confidence: "high" | "medium" | "low",
): string {
  const bestTitle = contexts[0]?.document_title;

  if (_confidence === "low" || !contexts.length) {
    const base = "I could not find enough detail in the sources to fully answer your question.";
    if (bestTitle) {
      return `${base} The best page to check is "${bestTitle}".`;
    }
    return `${base} Please check the relevant page linked below.`;
  }

  switch (intent) {
    case "aios":
      return (
        "Vispaico AIOS (AI Operating System) is a private AI platform deployed on your own infrastructure. " +
        "It gives your business a secure, fully-owned AI workforce — spanning knowledge, analysis, and autonomous operations. " +
        "The AIOS overview page has the full picture."
      );

    case "company_brain":
      return (
        "Company Brain is the first phase of Vispaico AIOS. It learns your company's internal knowledge — documents, processes, history — " +
        "and becomes an expert on your business that your team can ask anything."
      );

    case "company_analyst":
      return (
        "Company Analyst is the second phase of AIOS. It connects to your data sources and provides analysis, reports, dashboards, " +
        "and actionable insights so you can make informed decisions faster."
      );

    case "company_operator":
      return (
        "Company Operator is the third phase of AIOS. It takes autonomous action through integrations, workflows, and systems " +
        "so your AI workforce can execute tasks end-to-end."
      );

    case "ai_operations_audit":
      return (
        "The AI Operations Audit is a structured assessment that evaluates your company's AI readiness. " +
        "It identifies where AIOS can have the highest impact and gives you a clear starting point."
      );

    case "infrastructure":
      return (
        "Vispaico deploys AIOS entirely on your company's private infrastructure. You own the code, data, and systems. " +
        "There is no vendor lock-in and no third-party access to your information."
      );

    case "industries":
      return (
        "Vispaico AIOS is designed for any company that wants a private AI workforce. It's especially relevant for " +
        "knowledge-intensive businesses, regulated industries, and teams that need full control over their data."
      );

    case "pricing":
      return (
        "Vispaico offers straightforward pricing based on team size and complexity. " +
        "There are transparent monthly and setup fees. Check the pricing page for the most current details."
      );

    case "contact":
      return "The best next step is to reach out to Vispaico directly. They can discuss your needs and show you how AIOS fits.";

    case "services": {
      const titles = contexts.map((c) => `"${c.document_title}"`);
      const uniqueTitles = [...new Set(titles)];
      if (uniqueTitles.length > 0) {
        return (
          `Vispaico's core offering is AIOS — a private AI workforce deployed on your infrastructure. ` +
          `It includes Company Brain, Company Analyst, and Company Operator phases, plus the AI Operations Audit as a starting point. ` +
          `Based on the available pages, the relevant ones are ${uniqueTitles.join(", ")}.`
        );
      }
      return (
        "Vispaico's core offering is AIOS — a private AI workforce deployed on your infrastructure. " +
        "It includes Company Brain, Company Analyst, and Company Operator phases, plus the AI Operations Audit as a starting point."
      );
    }

    case "process":
    case "faq":
      return (
        "The best place to learn more is the AIOS overview page and the services pages. " +
        "They break down how each phase works and what you can expect."
      );

    case "about":
      return (
        "Vispaico's mission is to give every company a private, fully-owned AI workforce. " +
        "They focus on infrastructure ownership, security, and real business impact."
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
