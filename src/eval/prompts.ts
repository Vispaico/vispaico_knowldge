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
 *
 * Updated for new Vispaico positioning around AIOS,
 * Company Brain / Analyst / Operator, AI Operations Audit.
 */

const EVAL_PROMPTS = [
  {
    id: "aios-1",
    prompt: "What is AIOS?",
    expected_intent: "aios",
    notes: "Should explain AIOS as a private AI operating system deployed on client infrastructure. No legacy pricing.",
  },
  {
    id: "aios-2",
    prompt: "What does Vispaico do?",
    expected_intent: "aios",
    notes: "Broad overview — should describe AIOS and the three phases in conversational language.",
  },
  {
    id: "company-brain-1",
    prompt: "What is Company Brain?",
    expected_intent: "company_brain",
    notes: "Should describe it as phase 1 — learning company knowledge, becoming an expert on the business.",
  },
  {
    id: "company-brain-analyst",
    prompt: "What's the difference between Company Brain and Company Analyst?",
    expected_intent: "company_brain",
    notes: "Mixed intent — should distinguish between knowledge (Brain) and analysis (Analyst).",
  },
  {
    id: "company-analyst-1",
    prompt: "What is Company Analyst?",
    expected_intent: "company_analyst",
    notes: "Should describe it as phase 2 — data sources, insights, reports, dashboards.",
  },
  {
    id: "company-operator-1",
    prompt: "What is Company Operator?",
    expected_intent: "company_operator",
    notes: "Should describe it as phase 3 — autonomous actions, workflows, integrations.",
  },
  {
    id: "audit-1",
    prompt: "What is the AI Operations Audit?",
    expected_intent: "ai_operations_audit",
    notes: "Should describe the assessment to evaluate AI readiness and identify impact areas.",
  },
  {
    id: "audit-2",
    prompt: "Where should we start?",
    expected_intent: "ai_operations_audit",
    notes: "Should point to AI Operations Audit as the recommended starting point.",
  },
  {
    id: "pricing-1",
    prompt: "How much does AIOS cost?",
    expected_intent: "pricing",
    notes: "Should reference pricing based on team size/complexity, transparent monthly and setup fees. Point to pricing page.",
  },
  {
    id: "self-hosted-1",
    prompt: "Is this self-hosted?",
    expected_intent: "infrastructure",
    notes: "Should confirm AIOS runs on private infrastructure the client owns, no vendor lock-in.",
  },
  {
    id: "self-hosted-2",
    prompt: "Do I own the code and infrastructure?",
    expected_intent: "infrastructure",
    notes: "Should confirm full ownership of code, data, and infrastructure.",
  },
  {
    id: "industries-1",
    prompt: "What industries is this for?",
    expected_intent: "industries",
    notes: "Should describe relevance to knowledge-intensive and regulated industries.",
  },
  {
    id: "industries-2",
    prompt: "Who is AIOS for?",
    expected_intent: "industries",
    notes: "Should describe target audience and use cases.",
  },
  {
    id: "fallback-unknown",
    prompt: "Can I pay in cryptocurrency?",
    expected_intent: "general",
    notes: "Completely unknown — should produce graceful 'I couldn't find a precise answer' fallback.",
  },
  {
    id: "mixed-aios-pricing",
    prompt: "What is AIOS and how much does it cost?",
    expected_intent: "aios",
    notes: "Mixed intent; should handle both aspects without conflating.",
  },
  {
    id: "mixed-brain-analyst-operator",
    prompt: "Can you explain the three phases of AIOS?",
    expected_intent: "company_brain",
    notes: "Should describe all three phases with the correct order.",
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
