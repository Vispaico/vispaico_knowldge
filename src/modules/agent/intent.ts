/**
 * Intent detection for agent chat.
 * Identifies what the user is asking about and returns
 * URL priority hints and suggested actions.
 */

export type IntentType = "pricing" | "services" | "ownership" | "process" | "faq" | "about" | "contact" | "general";

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
    type: "contact",
    keywords: ["talk", "call", "quote", "consultation", "project", "hire", "inquiry", "reach", "email", "phone", "meet", "speak", "someone", "discuss"],
    boost_urls: ["/en/contact"],
  },
  {
    type: "ownership",
    keywords: [
      "own", "ownership", "owner",
      "belongs to me", "belongs to the client", "belong",
      "keep the code", "keep the infrastructure",
      "handover", "handed over",
      "what do i get at the end", "what is transferred",
      "do i own", "does the client own", "do clients keep",
      "ip", "intellectual property",
      "code", "codebase", "source code", "infrastructure",
    ],
    boost_urls: ["/en/faq", "/en/launch"],
  },
  {
    type: "pricing",
    keywords: ["pricing", "price", "cost", "plan", "subscription", "pay", "payment", "24,800", "24800", "24.800", "launch program", "included", "offer"],
    boost_urls: ["/en/launch", "/en/faq"],
  },
  {
    type: "services",
    keywords: [
      "service", "offer", "solution", "consulting", "studio",
      "what do you do", "capabilities", "expertise",
      "other services", "individually", "a la carte",
      "separately", "what else",
    ],
    boost_urls: ["/en/services"],
  },
  {
    type: "process",
    keywords: ["process", "timeline", "timelines", "duration", "how long", "roadmap", "milestone", "step", "phase", "deliverable"],
    boost_urls: ["/en/faq"],
  },
  {
    type: "faq",
    keywords: ["faq", "question", "support", "help", "how", "what", "why", "when", "which page", "where can i"],
    boost_urls: ["/en/faq"],
  },
  {
    type: "about",
    keywords: ["about", "founder", "company", "team", "vision", "mission", "who are", "background"],
    boost_urls: ["/en/about"],
  },
];

const INTENT_ACTION_LABELS: Record<IntentType, { label: string; url: string } | null> = {
  pricing: { label: "See Launch Program", url: "https://vispaico.com/en/launch" },
  services: { label: "See Services", url: "https://vispaico.com/en/services" },
  ownership: { label: "Ownership FAQ", url: "https://vispaico.com/en/faq" },
  process: { label: "Process FAQ", url: "https://vispaico.com/en/faq" },
  faq: { label: "FAQ Page", url: "https://vispaico.com/en/faq" },
  about: { label: "About Us", url: "https://vispaico.com/en/about" },
  contact: { label: "Contact Us", url: "https://vispaico.com/en/contact" },
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

  // Ownership: always suggest FAQ + Launch
  if (intents.includes("ownership")) {
    const ownershipAction = INTENT_ACTION_LABELS.ownership!;
    if (!seen.has(ownershipAction.url)) {
      actions.push({ type: "open_page", label: ownershipAction.label, url: ownershipAction.url });
      seen.add(ownershipAction.url);
    }
    const launchAction = INTENT_ACTION_LABELS.pricing!;
    if (!seen.has(launchAction.url)) {
      actions.push({ type: "open_page", label: "See Launch Program", url: launchAction.url });
      seen.add(launchAction.url);
    }
  }

  for (const intent of intents) {
    if (intent === "contact" || intent === "ownership") continue;
    const a = INTENT_ACTION_LABELS[intent];
    if (a && !seen.has(a.url)) {
      actions.push({ type: "open_page", label: a.label, url: a.url });
      seen.add(a.url);
    }
  }

  return actions;
}
