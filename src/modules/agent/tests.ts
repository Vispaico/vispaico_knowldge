/**
 * Regression tests for agent chat: intent detection, cleanup, and answer synthesis.
 * Run with: npx tsx src/modules/agent/tests.ts
 */

import { detectIntent, buildActions } from "./intent.js";
import { cleanSnippet, isLowSignalSnippet } from "./cleanup.js";
import { synthesizeAnswer } from "./synthesizer.js";

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

  // Contact actions always come first
  const mixedActions = buildActions(["pricing", "contact"]);
  assert(mixedActions.length >= 1, "mixed actions has results");
  assert(mixedActions[0].url.includes("contact"), "contact action is first when present");
}

// ── Cleanup tests ────────────────────────────────────────────────────

function testCleanup(): void {
  console.log("\n[Cleanup]");

  // <mark> tags stripped
  const withMark = cleanSnippet("You <mark>own</mark> the code.");
  assert(!withMark.includes("<mark>"), "<mark> tags stripped");
  assert(!withMark.includes("</mark>"), "</mark> tags stripped");
  assert(withMark.includes("own"), "text inside <mark> preserved");

  // Markdown images stripped
  const withImage = cleanSnippet("Some text ![image](https://example.com/img.png) more text");
  assert(!withImage.includes("![image]"), "markdown image syntax stripped");

  // Markdown links -> just text
  const withLink = cleanSnippet("Check [our FAQ](https://vispaico.com/en/faq) for details.");
  assert(withLink.includes("our FAQ"), "link text preserved");
  assert(!withLink.includes("[our FAQ]"), "link brackets stripped");
  assert(!withLink.includes("(https://"), "link URL stripped");

  // Separators stripped
  const withSep = cleanSnippet("text\n---\nmore text");
  assert(!withSep.includes("---"), "separators stripped");

  // Whitespace collapsed
  const spaced = cleanSnippet("lots    of   spaces");
  assert(!spaced.includes("  "), "whitespace collapsed");

  // Horizontal rules stripped
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

  // Query 1: Ownership — must be primary even when "Launch Program" also matches pricing
  const q1 = detectIntent("What do I own at the end of the Launch Program?");
  assert(q1.primary === "ownership", "Q1: ownership is primary");
  assert(q1.all_intents.includes("ownership"), "Q1: ownership in all_intents");
  const q1Actions = buildActions(q1.all_intents);
  assert(q1Actions.some((a) => a.url.includes("faq")), "Q1: action points to faq");
  assert(q1Actions.length <= 2, "Q1: at most 2 actions");

  // Query 2: Pricing
  const q2 = detectIntent("Which page should I read if I want pricing and what is included?");
  assert(q2.all_intents.includes("pricing"), "Q2: pricing intent detected");
  const q2Actions = buildActions(q2.all_intents);
  assert(q2Actions.some((a) => a.url.includes("launch")), "Q2: action points to launch");

  // Query 3: Contact
  const q3 = detectIntent("I want to talk to someone about my project.");
  assert(q3.primary === "contact", "Q3: contact primary intent");
  // "about" triggers about intent; "project" triggers contact
  assert(q3.all_intents.includes("contact"), "Q3: contact in intents");
  const q3Actions = buildActions(q3.all_intents);
  assert(q3Actions.some((a) => a.url.includes("contact")), "Q3: action points to contact");
  assert(q3Actions.length <= 2, "Q3: at most 2 actions (contact + possible about)");
}

// ── Answer synthesis regression tests ───────────────────────────────

function testAnswerSynthesis(): void {
  console.log("\n[Answer synthesis]");

  const dummyContexts = [{ document_title: "Launch Program" }];

  // Ownership answer: must reference ownership, must NOT contain pricing language
  const ownershipAnswer = synthesizeAnswer("ownership", true, dummyContexts);
  assert(ownershipAnswer.includes("own") || ownershipAnswer.includes("ownership"), "ownership answer mentions ownership");
  assert(!ownershipAnswer.includes("best page to read"), "ownership answer has no pricing phrasing");
  assert(!ownershipAnswer.includes("24,800"), "ownership answer has no dollar amount");
  assert(!ownershipAnswer.includes("pricing"), "ownership answer has no 'pricing' language");
  assert(ownershipAnswer.includes("handover"), "ownership answer mentions handover");

  // Pricing answer: must reference launch program page
  const pricingAnswer = synthesizeAnswer("pricing", true, dummyContexts);
  assert(pricingAnswer.includes("Launch Program"), "pricing answer mentions Launch Program");
  assert(pricingAnswer.includes("24,800"), "pricing answer mentions the offer");

  // Fallback (no content): should be short, no raw snippet text
  const noContentAnswer = synthesizeAnswer("general", false, []);
  assert(noContentAnswer.length < 200, "fallback answer is short");
}

// ── Cleanup guardrail tests ─────────────────────────────────────────

function testCleanupGuardrails(): void {
  console.log("\n[Cleanup guardrails]");

  // Raw table rows removed
  const tableText = cleanSnippet("| Feature | Included |\n|---|---|\n| Code | Yes |");
  assert(!tableText.includes("|"), "pipe table rows stripped");

  // Markdown bold/italic removed
  const bold = cleanSnippet("**bold** and *italic*");
  assert(!bold.includes("**"), "bold markers stripped");
  assert(!bold.includes("*italic*"), "italic markers stripped");
}

// ── Run all tests ────────────────────────────────────────────────────

console.log("=== Agent module regression tests ===");
testIntentDetection();
testActionBuilding();
testCleanup();
testLowSignalDetection();
testCleanupGuardrails();
testAnswerSynthesis();
testRegressionQueries();

const total = passed + failed;
console.log(`\n=== Results: ${passed}/${total} passed${failed > 0 ? `, ${failed} failed` : ""} ===`);
process.exit(failed > 0 ? 1 : 0);
