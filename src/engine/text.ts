// Text helpers: ADF → plain text, normalisation, and the cheap pre-filter.

/** Flatten Atlassian Document Format (or a plain string) into text. */
export function adfToText(body: unknown): string {
  if (body == null) return '';
  if (typeof body === 'string') return body;
  const out: string[] = [];
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'text' && typeof node.text === 'string') out.push(node.text);
    if (node.type === 'hardBreak') out.push('\n');
    if (node.type === 'mention' && node.attrs?.text) out.push(node.attrs.text);
    if (Array.isArray(node.content)) {
      node.content.forEach(walk);
      if (['paragraph', 'heading', 'listItem', 'blockquote', 'codeBlock'].includes(node.type)) out.push('\n');
    }
  };
  walk(body);
  return out.join('').replace(/\n{3,}/g, '\n\n').trim();
}

/** Lower-case, unify quotes and dashes, collapse whitespace. Used for quote checks. */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

// Words that usually accompany a commitment. Deliberately broad: the LLM and the
// agent's confirmation do the precise work; this only skips obvious non-promises.
const COMMITMENT = [
  /\bi(?:'ll| will)\b/,
  /\bwe(?:'ll| will)\b/,
  /\bwill be (?:fixed|resolved|released|shipped|deployed|available|live|ready|sent|done|in)\b/,
  /\bshould be (?:fixed|resolved|released|available|live|ready|done)\b/,
  /\b(?:expect|expected|aim|aiming|plan|planned|scheduled|targeting|eta)\b/,
  /\b(?:promise|guarantee|commit)\b/,
  /\b(?:get back to you|follow up|update you|keep you posted|let you know)\b/,
  /\b(?:next|upcoming|coming) (?:release|version|sprint|build|patch|update)\b/,
];

const TIME = [
  /\b(?:today|tonight|tomorrow|this week|next week|end of (?:the )?(?:day|week|month|sprint))\b/,
  /\b(?:mon|tues|wednes|thurs|fri|satur|sun)day\b/,
  /\b(?:by|before|within|in) \d+ (?:hours?|days?|weeks?)\b/,
  /\b\d{1,2}(?:st|nd|rd|th)? (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/,
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{1,2}\b/,
  /\b\d{4}-\d{2}-\d{2}\b/,
  /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/,
  /\b(?:next|upcoming|coming) (?:release|version|sprint|build|patch)\b/,
  /\b(?:shortly|soon|asap)\b/,
];

/**
 * Cheap gate before any LLM call. A reply is worth a closer look only if it has a
 * commitment word AND a time signal. Most replies stop here.
 */
export function mightContainPromise(text: string): boolean {
  const t = normalise(text);
  if (t.length < 12) return false;
  return COMMITMENT.some((r) => r.test(t)) && TIME.some((r) => r.test(t));
}
