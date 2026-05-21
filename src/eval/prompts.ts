/**
 * Evaluation test prompts for the agent chat RAG pipeline.
 *
 * Run manually to review answer quality across intent categories.
 * Usage: npx tsx src/eval/prompts.ts
 *
 * Each prompt tests a different aspect:
 *  - Intent detection accuracy
 *  - Context retrieval relevance
 *  - Answer synthesis quality (LLM or template fallback)
 *  - Fallback behavior on weak/no context
 */

const EVAL_PROMPTS = [
  {
    id: "ownership-1",
    prompt: "What do I own at the end of the Launch Program?",
    expected_intent: "ownership",
    notes: "Should describe code, infra, content handover. Hard no on pricing language.",
  },
  {
    id: "pricing-1",
    prompt: "Which page should I read for pricing?",
    expected_intent: "pricing",
    notes: "Should point to Launch Program page and mention $24,800.",
  },
  {
    id: "pricing-2",
    prompt: "How much does the Launch Program cost and what is included?",
    expected_intent: "pricing",
    notes: "Should explain cost and what's included.",
  },
  {
    id: "contact-1",
    prompt: "I want to talk to someone about my project.",
    expected_intent: "contact",
    notes: "Should direct to contact page or booking a call.",
  },
  {
    id: "services-1",
    prompt: "What other services do you offer?",
    expected_intent: "services",
    notes: "Should describe studio/consulting services and link to Services page.",
  },
  {
    id: "services-2",
    prompt: "Do you offer services individually?",
    expected_intent: "services",
    notes: "Should explain how services are offered (bundled vs a la carte).",
  },
  {
    id: "services-3",
    prompt: "What else can Vispaico help me with beyond the Launch Program?",
    expected_intent: "services",
    notes: "Should describe broader service offerings.",
  },
  {
    id: "faq-1",
    prompt: "How does the program timeline work?",
    expected_intent: "faq",
    notes: "Should reference FAQ page or timeline details.",
  },
  {
    id: "about-1",
    prompt: "Tell me about Vispaico and the team behind it.",
    expected_intent: "about",
    notes: "Should describe company background and mission.",
  },
  {
    id: "fallback-weak",
    prompt: "What is the refund policy for the Launch Program?",
    expected_intent: "general",
    notes: "If not in knowledge base, should produce a graceful fallback directing to best pages.",
  },
  {
    id: "fallback-unknown",
    prompt: "Can I pay in cryptocurrency?",
    expected_intent: "general",
    notes: "Completely unknown — should produce graceful 'I couldn't find a precise answer' without clipping.",
  },
  {
    id: "mixed-ownership-pricing",
    prompt: "How much does the Launch Program cost and what do I own?",
    expected_intent: "ownership",
    notes: "Mixed intent; should handle both aspects without conflating.",
  },
  {
    id: "mixed-services-contact",
    prompt: "I'm interested in consulting services, how do I get started?",
    expected_intent: "contact",
    notes: "Mixed services+contact; contact action should take priority.",
  },
];

/**
 * Run a manual evaluation review.
 * Call this with: npx tsx src/eval/prompts.ts
 * Then inspect the output JSON and assess answer quality manually.
 */
async function main() {
  const action = process.argv[2] ?? "list";

  if (action === "list") {
    console.log(JSON.stringify(EVAL_PROMPTS, null, 2));
    return;
  }

  if (action === "run") {
    console.log("To run evaluation, import this file and call evaluate() with a real workspace ID.");
    console.log("Example:");
    console.log("  npx tsx -e \"import('./eval.js')\"");
    return;
  }

  console.error("Unknown action. Use: npx tsx src/eval/prompts.ts [list|run]");
  process.exit(1);
}

main();

export { EVAL_PROMPTS };
