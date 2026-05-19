/**
 * Clean up retrieved content snippets before passing to answer generation.
 * Strips markdown images, nav fragments, separators, and other noise.
 */

// Patterns for content we want to strip entirely
const BLOCK_PATTERNS = [
  /!\[.*?\]\(.*?\)/g,                     // markdown images
  /---+/g,                                 // horizontal rules / separators (3+ dashes)
  /\|.*?\|.*?\|/g,                         // table rows (pipes)
  /\[(?:Home|About|Services|Contact|FAQ|Blog|Pricing|Menu|Navigation|Skip to)\][\s\S]{0,100}/gi, // nav-like links
  /^\s*[-•*]\s*$/gm,                       // bare bullet markers
];

// Patterns to replace within text
const INLINE_PATTERNS: Array<[RegExp, string]> = [
  [/\[([^\]]+)\]\([^)]+\)/g, "$1"],        // markdown links -> just text
  [/[*_]{1,2}([*_]{1,2})?/g, ""],          // bold/italic markers
  [/<br\s*\/?>/gi, " "],                   // <br> tags -> space
  [/`{1,3}[^`]*`{1,3}/g, ""],              // code spans
  [/#{1,6}\s+/g, ""],                      // heading markers
];

const NAV_KEYWORDS = [
  "home", "about", "services", "faq", "contact", "blog", "pricing",
  "menu", "navigation", "skip to content", "toggle", "search",
];

function isNavChunk(text: string): boolean {
  const lower = text.trim().toLowerCase();
  // If it's very short and contains only nav-like text
  if (lower.length < 40) {
    return NAV_KEYWORDS.some((kw) => lower.includes(kw));
  }
  return false;
}

function isLowSignal(text: string): boolean {
  const clean = text.trim();
  if (clean.length < 20) return true;

  // Count alpha vs non-alpha characters
  const alpha = clean.replace(/[^a-zA-Z\s]/g, "").length;
  const ratio = alpha / clean.length;
  if (ratio < 0.4) return true; // mostly symbols/numbers

  // If it's mostly punctuation or whitespace
  const words = clean.split(/\s+/).filter((w) => w.length > 0);
  if (words.length <= 2) return true;

  return false;
}

export function cleanSnippet(raw: string): string {
  // Strip block-level noise
  let cleaned = raw;
  for (const pattern of BLOCK_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }

  // Apply inline replacements
  for (const [pattern, replacement] of INLINE_PATTERNS) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  // Collapse whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned;
}

export function filterLowSignal(
  item: { content_snippet: string; document_title?: string },
): boolean {
  return !isLowSignal(item.content_snippet) && !isNavChunk(item.content_snippet);
}

export function isLowSignalSnippet(snippet: string): boolean {
  return isLowSignal(snippet) || isNavChunk(snippet);
}
