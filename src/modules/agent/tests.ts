/**
 * Regression tests for agent chat: intent detection, cleanup, and answer synthesis.
 * Run with: npx tsx src/modules/agent/tests.ts
 */

// Set dummy env vars for modules that call getEnv() at import time
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgres://localhost:5432/test";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.FIRECRAWL_BASE_URL = "http://localhost:3000";
process.env.FIRECRAWL_API_KEY = "test-key";

async function main() {
  const { detectIntent, buildActions } = await import("./intent.js");
  const { cleanSnippet, isLowSignalSnippet } = await import("./cleanup.js");
  const { synthesizeAnswer } = await import("./synthesizer.js");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, label: string): void {
    if (condition) {
      passed++;
    } else {
      failed++;
      console.error(`  FAIL: ${label}`);
    }
  }

  // ── Intent detection tests ──────────────────────────────────────────

  function testIntentDetection(): void {
    console.log("\n[Intent detection]");

    // AIOS
    const aios = detectIntent("What is AIOS?");
    assert(aios.all_intents.includes("aios"), "AIOS intent detected from 'aios'");
    assert(aios.primary === "aios", "AIOS is primary");

    const aios2 = detectIntent("Tell me about Vispaico AIOS");
    assert(aios2.all_intents.includes("aios"), "AIOS intent detected from 'Vispaico AIOS'");

    const aios3 = detectIntent("What does Vispaico do?");
    assert(aios3.all_intents.includes("aios"), "AIOS intent detected from 'What does Vispaico do'");

    const aios4 = detectIntent("What is a private AI workforce?");
    assert(aios4.all_intents.includes("aios"), "AIOS intent detected from 'private AI workforce'");

    // Company Brain
    const brain = detectIntent("What is Company Brain?");
    assert(brain.all_intents.includes("company_brain"), "Company Brain intent detected");
    assert(brain.boost_urls.some((u) => u.includes("company-brain")), "Company Brain boosts brain URL");

    const brain2 = detectIntent("Phase one of AIOS");
    assert(brain2.all_intents.includes("company_brain"), "Phase one detected as company brain");

    // Company Analyst
    const analyst = detectIntent("What is Company Analyst?");
    assert(analyst.all_intents.includes("company_analyst"), "Company Analyst intent detected");

    // Company Operator
    const operator = detectIntent("What is Company Operator?");
    assert(operator.all_intents.includes("company_operator"), "Company Operator intent detected");

    // AI Operations Audit
    const audit = detectIntent("What is the AI Operations Audit?");
    assert(audit.all_intents.includes("ai_operations_audit"), "AI Operations Audit intent detected");

    const audit2 = detectIntent("Where should we start?");
    assert(audit2.all_intents.includes("ai_operations_audit"), "Where to start detects AI audit");

    // Infrastructure / Ownership
    const infra = detectIntent("Is this self-hosted?");
    assert(infra.all_intents.includes("infrastructure"), "Self-hosted detected as infrastructure");

    const infra2 = detectIntent("Do I own the code?");
    assert(infra2.all_intents.includes("infrastructure"), "Own the code detected as infrastructure");

    const infra3 = detectIntent("Is there vendor lock-in?");
    assert(infra3.all_intents.includes("infrastructure"), "Vendor lock-in detected as infrastructure");

    // Industries
    const ind = detectIntent("What industries is this for?");
    assert(ind.all_intents.includes("industries"), "Industries intent detected");

    const ind2 = detectIntent("Who is AIOS for?");
    assert(ind2.all_intents.includes("industries"), "Who is AIOS for detected as industries");

    // Pricing
    const pricing1 = detectIntent("How much does AIOS cost?");
    assert(pricing1.all_intents.includes("pricing"), "AIOS cost detected as pricing");

    const pricing2 = detectIntent("What are your setup fees?");
    assert(pricing2.all_intents.includes("pricing"), "Setup fees detected as pricing");

    // Services
    const services1 = detectIntent("What services do you offer?");
    assert(services1.all_intents.includes("services"), 'services detected: "What services do you offer?"');

    // Mixed
    const mixed = detectIntent("What is AIOS and how much does it cost?");
    assert(mixed.all_intents.includes("aios"), "mixed: aios detected");
    assert(mixed.all_intents.includes("pricing"), "mixed: pricing detected");
  }

  // ── Action building tests ────────────────────────────────────────────

  function testActionBuilding(): void {
    console.log("\n[Action building]");

    const contactActions = buildActions(["contact"]);
    assert(contactActions.length >= 1, "contact produces at least 1 action");

    const aiosActions = buildActions(["aios"]);
    assert(aiosActions.length >= 1, "aios produces at least 1 action");
    assert(aiosActions[0].url.includes("aios"), "aios action points to aios page");

    const brainActions = buildActions(["company_brain"]);
    assert(brainActions.length >= 1, "company_brain produces at least 1 action");
    assert(brainActions[0].url.includes("company-brain"), "company_brain action points to brain page");

    const pricingActions = buildActions(["pricing"]);
    assert(pricingActions.length >= 1, "pricing produces at least 1 action");
    assert(pricingActions[0].url.includes("aios"), "pricing action points to aios page");

    const infraActions = buildActions(["infrastructure"]);
    assert(infraActions.length >= 1, "infrastructure produces at least 1 action");
    assert(infraActions[0].url.includes("aios"), "infrastructure action points to aios page");
  }

  // ── Cleanup tests ────────────────────────────────────────────────────

  function testCleanup(): void {
    console.log("\n[Cleanup]");

    const withMark = cleanSnippet("You <mark>own</mark> the code.");
    assert(!withMark.includes("<mark>"), "<mark> tags stripped");
    assert(!withMark.includes("</mark>"), "</mark> tags stripped");
    assert(withMark.includes("own"), "text inside <mark> preserved");

    const withImage = cleanSnippet("Some text ![image](https://example.com/img.png) more text");
    assert(!withImage.includes("![image]"), "markdown image syntax stripped");

    const withLink = cleanSnippet("Check [the AIOS page](https://vispaico.com/en/aios) for details.");
    assert(withLink.includes("the AIOS page"), "link text preserved");
    assert(!withLink.includes("[the AIOS page]"), "link brackets stripped");
    assert(!withLink.includes("(https://"), "link URL stripped");

    const withSep = cleanSnippet("text\n---\nmore text");
    assert(!withSep.includes("---"), "separators stripped");

    const spaced = cleanSnippet("lots    of   spaces");
    assert(!spaced.includes("  "), "whitespace collapsed");

    const hr = cleanSnippet("above\n\n---\n\nbelow");
    assert(hr.includes("above"), "text before hr preserved");
    assert(hr.includes("below"), "text after hr preserved");
  }

  // ── Low-signal detection tests ──────────────────────────────────────

  function testLowSignalDetection(): void {
    console.log("\n[Low-signal detection]");

    assert(isLowSignalSnippet("Home About Services"), "short nav text is low signal");
    assert(isLowSignalSnippet("!!!"), "punctuation only is low signal");
    assert(isLowSignalSnippet("a b"), "very short is low signal");

    assert(!isLowSignalSnippet("AIOS is a private AI operating system deployed on your own infrastructure."), "meaningful text is not low signal");
    assert(!isLowSignalSnippet("Company Brain learns your company's knowledge and becomes an expert on your business."), "informative text is not low signal");
  }

  // ── Specific query regression tests ─────────────────────────────────

  function testRegressionQueries(): void {
    console.log("\n[Regression queries]");

    const q1 = detectIntent("What is AIOS?");
    assert(q1.primary === "aios", "Q1: aios is primary");
    assert(q1.all_intents.includes("aios"), "Q1: aios in all_intents");

    const q2 = detectIntent("How much does AIOS cost?");
    assert(q2.all_intents.includes("pricing"), "Q2: pricing intent detected");
    assert(q2.all_intents.includes("aios"), "Q2: aios intent detected");

    const q3 = detectIntent("What is Company Brain?");
    assert(q3.primary === "company_brain", "Q3: company_brain primary intent");

    const q4 = detectIntent("What's the difference between Company Brain and Company Analyst?");
    assert(q4.all_intents.includes("company_brain"), "Q4: company_brain detected");
    assert(q4.all_intents.includes("company_analyst"), "Q4: company_analyst detected");

    const q5 = detectIntent("Is this self-hosted?");
    assert(q5.all_intents.includes("infrastructure"), "Q5: infrastructure intent detected");

    const q6 = detectIntent("What industries is this for?");
    assert(q6.all_intents.includes("industries"), "Q6: industries intent detected");

    const q7 = detectIntent("Where should we start?");
    assert(q7.all_intents.includes("ai_operations_audit"), "Q7: where to start -> audit detected");

    const q8 = detectIntent("What does Vispaico do?");
    assert(q8.all_intents.includes("aios"), "Q8: what does vispaico do -> aios");
  }

  // ── Answer synthesis regression tests ───────────────────────────────

  async function testAnswerSynthesis(): Promise<void> {
    console.log("\n[Answer synthesis]");

    const aiosContexts = [
      { document_title: "AIOS", document_url: "/en/aios", section_title: "Private AI Workforce", content_snippet: "Vispaico AIOS is a private AI operating system deployed on your own infrastructure, giving your business a secure and fully-owned AI workforce." },
    ];

    const aiosAnswer = await synthesizeAnswer("What is AIOS?", "aios", aiosContexts);
    assert(aiosAnswer.length > 0, "AIOS answer is not empty");
    assert(!aiosAnswer.includes("24,800"), "AIOS answer has no legacy pricing language");

    const brainContexts = [
      { document_title: "Company Brain", document_url: "/en/services/company-brain", section_title: "Overview", content_snippet: "Company Brain is the first phase of AIOS. It learns your company's internal knowledge and becomes an expert on your business." },
    ];

    const brainAnswer = await synthesizeAnswer("What is Company Brain?", "company_brain", brainContexts);
    assert(brainAnswer.length > 0, "Company Brain answer is not empty");

    const noContentAnswer = await synthesizeAnswer("Something unknown", "general", []);
    assert(noContentAnswer.length < 300, "fallback answer is short");
  }

  // ── Cleanup guardrail tests ─────────────────────────────────────────

  function testCleanupGuardrails(): void {
    console.log("\n[Cleanup guardrails]");

    const tableText = cleanSnippet("| Feature | Included |\n|---|---|\n| Code | Yes |");
    assert(!tableText.includes("|"), "pipe table rows stripped");

    const bold = cleanSnippet("**bold** and *italic*");
    assert(!bold.includes("**"), "bold markers stripped");
    assert(!bold.includes("*italic*"), "italic markers stripped");
  }

  console.log("=== Agent module regression tests ===");
  testIntentDetection();
  testActionBuilding();
  testCleanup();
  testLowSignalDetection();
  testCleanupGuardrails();
  await testAnswerSynthesis();
  testRegressionQueries();

  const total = passed + failed;
  console.log(`\n=== Results: ${passed}/${total} passed${failed > 0 ? `, ${failed} failed` : ""} ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
