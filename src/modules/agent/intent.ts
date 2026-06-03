/**
 * Intent detection for agent chat.
 * Identifies what the user is asking about and returns
 * URL priority hints and suggested actions.
 *
 * Updated for Vispaico's new positioning around AIOS,
 * Company Brain / Analyst / Operator and AI Operations Audit.
 */

export type IntentType =
  | "aios"
  | "company_brain"
  | "company_analyst"
  | "company_operator"
  | "ai_operations_audit"
  | "infrastructure"
  | "industries"
  | "pricing"
  | "services"
  | "process"
  | "faq"
  | "about"
  | "contact"
  | "general";

export interface IntentResult {
  primary: IntentType;
  boost_urls: string[];
  all_intents: IntentType[];
}

// Each intent: keywords to detect, URLs to boost, action to suggest
const INTENT_RULES: Array<{
  type: IntentType;
  keywords: string[];
  boost_urls: string[];
}> = [
  {
    type: "aios",
    keywords: [
      "aios", "ai operating system", "operating system",
      "private ai workforce", "ai workforce",
      "what is vispaico", "what does vispaico do",
      "platform", "technology",
    ],
    boost_urls: ["/en/aios"],
  },
  {
    type: "company_brain",
    keywords: [
      "company brain", "brain", "knowledge base", "knowledge",
      "learn", "understand", "documentation",
      "phase one", "phase 1",
    ],
    boost_urls: ["/en/services/company-brain", "/en/services"],
  },
  {
    type: "company_analyst",
    keywords: [
      "company analyst", "analyst", "analysis", "analyze",
      "insight", "report", "reporting", "analytics",
      "phase two", "phase 2",
    ],
    boost_urls: ["/en/services/company-analyst", "/en/services"],
  },
  {
    type: "company_operator",
    keywords: [
      "company operator", "operator", "automation", "automate",
      "autonomous", "action", "workflow", "execute",
      "phase three", "phase 3",
    ],
    boost_urls: ["/en/services/company-operator", "/en/services"],
  },
  {
    type: "ai_operations_audit",
    keywords: [
      "audit", "ai operations audit", "operations audit",
      "assessment", "readiness", "evaluate",
      "where to start", "where should", "how to start", "getting started",
      "assessment",
    ],
    boost_urls: ["/en/services/ai-operations-audit", "/en/services"],
  },
  {
    type: "infrastructure",
    keywords: [
      "own", "ownership", "owner",
      "belongs to me", "belongs to the client", "belong",
      "keep the code", "keep the infrastructure",
      "handover", "handed over",
      "what do i get", "what is transferred",
      "do i own", "does the client own", "do clients keep",
      "ip", "intellectual property",
      "code", "codebase", "source code", "infrastructure",
      "self-host", "self hosted", "selfhost",
      "private", "vendor lock-in", "lock in", "lockin",
      "on premise", "on-premise", "on-prem",
      "your own servers", "your infrastructure",
      "full ownership", "data ownership",
    ],
    boost_urls: ["/en/aios", "/en/services"],
  },
  {
    type: "pricing",
    keywords: [
      "pricing", "price", "cost", "plan", "subscription",
      "pay", "payment", "monthly", "setup", "setup fee",
      "starting", "starting at", "starting price",
      "how much", "what does it cost", "investment",
      "budget", "offer", "included", "what's included",
    ],
    boost_urls: ["/en/aios", "/en/services"],
  },
  {
    type: "industries",
    keywords: [
      "industry", "industries", "vertical", "sector",
      "use case", "use cases", "who is this for",
      "aios for", "who uses", "for whom", "target", "audience",
      "small business", "startup", "enterprise",
      "healthcare", "finance", "legal", "manufacturing",
      "retail", "logistics", "saas", "software",
    ],
    boost_urls: ["/en/aios", "/en/services"],
  },
  {
    type: "services",
    keywords: [
      "service", "services", "offer", "offering",
      "solution", "solutions", "consulting",
      "what do you do", "capabilities", "expertise",
      "what else", "other services", "all services",
    ],
    boost_urls: ["/en/services"],
  },
  {
    type: "contact",
    keywords: [
      "talk", "call", "quote", "consultation", "project",
      "hire", "inquiry", "reach", "email", "phone",
      "meet", "speak", "someone", "discuss", "demo",
      "book", "schedule", "contact",
    ],
    boost_urls: ["/en/aios"],
  },
  {
    type: "process",
    keywords: [
      "process", "timeline", "timelines", "duration",
      "how long", "roadmap", "milestone", "step",
      "phase", "deliverable", "phases", "stages",
    ],
    boost_urls: ["/en/services"],
  },
  {
    type: "about",
    keywords: [
      "about", "founder", "company", "team", "vision",
      "mission", "who are", "background", "story",
    ],
    boost_urls: ["/en/aios"],
  },
  {
    type: "faq",
    keywords: [
      "faq", "question", "support", "help",
      "which page", "where can i",
    ],
    boost_urls: ["/en/aios", "/en/services"],
  },
];

const INTENT_ACTION_LABELS: Record<IntentType, { label: string; url: string } | null> = {
  aios: { label: "Vispaico AIOS Overview", url: "https://www.vispaico.com/en/aios" },
  company_brain: { label: "Company Brain", url: "https://www.vispaico.com/en/services/company-brain" },
  company_analyst: { label: "Company Analyst", url: "https://www.vispaico.com/en/services/company-analyst" },
  company_operator: { label: "Company Operator", url: "https://www.vispaico.com/en/services/company-operator" },
  ai_operations_audit: { label: "AI Operations Audit", url: "https://www.vispaico.com/en/services/ai-operations-audit" },
  infrastructure: { label: "Infrastructure & Ownership", url: "https://www.vispaico.com/en/aios" },
  industries: { label: "Industries & Use Cases", url: "https://www.vispaico.com/en/aios" },
  pricing: { label: "Pricing & Plans", url: "https://www.vispaico.com/en/aios" },
  services: { label: "All Services", url: "https://www.vispaico.com/en/services" },
  process: { label: "How It Works", url: "https://www.vispaico.com/en/services" },
  faq: { label: "AIOS Overview", url: "https://www.vispaico.com/en/aios" },
  about: { label: "About Vispaico", url: "https://www.vispaico.com/en/aios" },
  contact: { label: "Get in Touch", url: "https://www.vispaico.com/en/aios" },
  general: null,
};

export function detectIntent(message: string): IntentResult {
  const lower = message.toLowerCase().trim();
  const detected: IntentType[] = [];
  const boostSet = new Set<string>();

  for (const rule of INTENT_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      detected.push(rule.type);
      for (const url of rule.boost_urls) {
        boostSet.add(url);
      }
    }
  }

  // Deduplicate intents, keep order of detection
  const uniqueIntents = [...new Set(detected)];
  const primary = uniqueIntents[0] ?? "general";

  return {
    primary,
    boost_urls: [...boostSet],
    all_intents: uniqueIntents,
  };
}

export function buildActions(intents: IntentType[]): Array<{ type: "open_page"; label: string; url: string }> {
  const seen = new Set<string>();
  const actions: Array<{ type: "open_page"; label: string; url: string }> = [];

  // Contact always wins if present
  if (intents.includes("contact")) {
    const a = INTENT_ACTION_LABELS.contact!;
    actions.push({ type: "open_page", label: a.label, url: a.url });
    seen.add(a.url);
  }

  // Infrastructure/ownership: link to AIOS
  if (intents.includes("infrastructure")) {
    const a = INTENT_ACTION_LABELS.infrastructure!;
    if (!seen.has(a.url)) {
      actions.push({ type: "open_page", label: a.label, url: a.url });
      seen.add(a.url);
    }
  }

  // Industries: link to AIOS
  if (intents.includes("industries")) {
    const a = INTENT_ACTION_LABELS.industries!;
    if (!seen.has(a.url)) {
      actions.push({ type: "open_page", label: a.label, url: a.url });
      seen.add(a.url);
    }
  }

  // Pricing: link to AIOS
  if (intents.includes("pricing")) {
    const a = INTENT_ACTION_LABELS.pricing!;
    if (!seen.has(a.url)) {
      actions.push({ type: "open_page", label: a.label, url: a.url });
      seen.add(a.url);
    }
  }

  for (const intent of intents) {
    if (
      intent === "contact" ||
      intent === "infrastructure" ||
      intent === "industries" ||
      intent === "pricing"
    ) continue;
    const a = INTENT_ACTION_LABELS[intent];
    if (a && !seen.has(a.url)) {
      actions.push({ type: "open_page", label: a.label, url: a.url });
      seen.add(a.url);
    }
  }

  return actions;
}
