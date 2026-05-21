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

    const ownership = detectIntent("What do I own at the end of the Launch Program?");
    assert(ownership.all_intents.includes("ownership"), "ownership intent detected");
    assert(ownership.boost_urls.length > 0, "ownership has boost URLs");

    const pricing = detectIntent("Which page should I read if I want pricing and what is included?");
    assert(pricing.all_intents.includes("pricing"), "pricing intent detected");

    const contact = detectIntent("I want to talk to someone about my project.");
    assert(contact.all_intents.includes("contact"), "contact intent detected");
    assert(contact.primary === "contact", "contact is primary");

    const mixed = detectIntent("How much does the Launch Program cost and what do I own?");
    assert(mixed.all_intents.includes("pricing"), "mixed: pricing detected");
    assert(mixed.all_intents.includes("ownership"), "mixed: ownership detected");

    const services1 = detectIntent("What other services do you offer?");
    assert(services1.all_intents.includes("services"), 'services detected: "What other services do you offer?"');

    const services2 = detectIntent("Do you offer services individually?");
    assert(services2.all_intents.includes("services"), 'services detected: "Do you offer services individually?"');
  }

  // ── Action building tests ────────────────────────────────────────────

  function testActionBuilding(): void {
    console.log("\n[Action building]");

    const contactActions = buildActions(["contact"]);
    assert(contactActions.length >= 1, "contact produces at least 1 action");
    assert(contactActions[0].url.includes("contact"), "contact action points to contact page");

    const pricingActions = buildActions(["pricing"]);
    assert(pricingActions.length >= 1, "pricing produces at least 1 action");
    assert(pricingActions[0].url.includes("launch"), "pricing action points to launch page");

    const mixedActions = buildActions(["pricing", "contact"]);
    assert(mixedActions.length >= 1, "mixed actions has results");
    assert(mixedActions[0].url.includes("contact"), "contact action is first when present");
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

    const withLink = cleanSnippet("Check [our FAQ](https://vispaico.com/en/faq) for details.");
    assert(withLink.includes("our FAQ"), "link text preserved");
    assert(!withLink.includes("[our FAQ]"), "link brackets stripped");
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

    assert(!isLowSignalSnippet("At the end of the Launch Program, you own the code and infrastructure built for your company."), "meaningful text is not low signal");
    assert(!isLowSignalSnippet("The best page to read is the Launch Program page. It explains the offer."), "informative text is not low signal");
  }

  // ── Specific query regression tests ─────────────────────────────────

  function testRegressionQueries(): void {
    console.log("\n[Regression queries]");

    const q1 = detectIntent("What do I own at the end of the Launch Program?");
    assert(q1.primary === "ownership", "Q1: ownership is primary");
    assert(q1.all_intents.includes("ownership"), "Q1: ownership in all_intents");
    const q1Actions = buildActions(q1.all_intents);
    assert(q1Actions.some((a) => a.url.includes("faq")), "Q1: action points to faq");
    assert(q1Actions.length <= 2, "Q1: at most 2 actions");

    const q2 = detectIntent("Which page should I read if I want pricing and what is included?");
    assert(q2.all_intents.includes("pricing"), "Q2: pricing intent detected");
    const q2Actions = buildActions(q2.all_intents);
    assert(q2Actions.some((a) => a.url.includes("launch")), "Q2: action points to launch");

    const q3 = detectIntent("I want to talk to someone about my project.");
    assert(q3.primary === "contact", "Q3: contact primary intent");
    assert(q3.all_intents.includes("contact"), "Q3: contact in intents");
    const q3Actions = buildActions(q3.all_intents);
    assert(q3Actions.some((a) => a.url.includes("contact")), "Q3: action points to contact");
    assert(q3Actions.length <= 2, "Q3: at most 2 actions (contact + possible about)");

    const q4 = detectIntent("What other services do you offer?");
    assert(q4.all_intents.includes("services"), "Q4: services intent detected");
    const q4Actions = buildActions(q4.all_intents);
    assert(q4Actions.some((a) => a.url.includes("services")), "Q4: action points to services");

    const q5 = detectIntent("Do you offer services individually?");
    assert(q5.all_intents.includes("services"), "Q5: services intent detected");
  }

  // ── Answer synthesis regression tests ───────────────────────────────

  async function testAnswerSynthesis(): Promise<void> {
    console.log("\n[Answer synthesis]");

    const dummyContexts = [
      { document_title: "Launch Program", document_url: "/en/launch", section_title: "What You Own", content_snippet: "At the end of the Launch Program, you own the code, infrastructure, content, and systems built for your company." },
    ];

    const ownershipAnswer = await synthesizeAnswer("What do I own at the end of the Launch Program?", "ownership", dummyContexts);
    assert(ownershipAnswer.includes("own") || ownershipAnswer.includes("ownership"), "ownership answer mentions ownership");
    assert(!ownershipAnswer.includes("24,800"), "ownership answer has no dollar amount");

    const pricingAnswer = await synthesizeAnswer("Which page should I read for pricing?", "pricing", dummyContexts);
    assert(pricingAnswer.includes("Launch Program"), "pricing answer mentions Launch Program");

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
