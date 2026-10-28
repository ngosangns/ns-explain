// Concepts: words the user asked about. Render wraps them in prose with a click popover.

import { escAttr } from "./html.ts";

export interface Concept { term?: string; explain?: string }

// A concept span inside the feature button would be a second button. Keep the
// mark so the word still counts, and let the row button take the click.
export function inertTerms(html: string): string {
  return html.replaceAll(
    ` role="button" tabindex="0" aria-expanded="false" aria-controls="ref-popover"`,
    "",
  );
}

// Whole word, case-insensitive, including letters outside ASCII. Longer terms
// are tried first so "page size" wins over "page".
function conceptPattern(concepts: Concept[]): RegExp | null {
  const terms = concepts
    .map((c) => c.term?.trim() ?? "")
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (!terms.length) return null;
  const alts = terms.map((term) => term.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&"));
  return new RegExp(
    `(?<![\\p{L}\\p{N}_])(?:${alts.join("|")})(?![\\p{L}\\p{N}_])`,
    "giu",
  );
}

export function normalizeConcepts(raw: unknown, warnings: string[]): Concept[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    warnings.push("concepts: expected a list of {term, explain}");
    return [];
  }
  const seen = new Set<string>();
  const out: Concept[] = [];
  for (const item of raw as Concept[]) {
    const term = String(item?.term ?? "").trim();
    const explain = String(item?.explain ?? "").replace(/\s+/g, " ").trim();
    if (!term || !explain) {
      warnings.push(`concepts: "${term || "?"}" needs both term and a plain explanation`);
      continue;
    }
    const key = term.toLowerCase();
    if (seen.has(key)) {
      warnings.push(`concepts: "${term}" is listed twice — the first explanation is kept`);
      continue;
    }
    seen.add(key);
    out.push({ term, explain });
  }
  return out;
}

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
  "source", "track", "wbr",
]);

// Quote-aware. A `>` inside data-desc="Promise<boolean>" stays inside the tag.
export function splitTags(html: string): string[] {
  const parts: string[] = [];
  let i = 0;
  while (i < html.length) {
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      const j = end === -1 ? html.length : end + 3;
      parts.push(html.slice(i, j));
      i = j;
      continue;
    }
    if (html[i] === "<" && /^<\/?[a-zA-Z!]/.test(html.slice(i))) {
      let j = i + 1;
      let quote = "";
      while (j < html.length) {
        const ch = html[j];
        if (quote) {
          if (ch === quote) quote = "";
        } else if (ch === "\"" || ch === "'") quote = ch;
        else if (ch === ">") { j++; break; }
        j++;
      }
      parts.push(html.slice(i, j));
      i = j;
      continue;
    }
    const next = html.indexOf("<", i + (html[i] === "<" ? 1 : 0));
    const end = next === -1 ? html.length : next;
    parts.push(html.slice(i, end));
    i = end;
  }
  return parts;
}

function isSkipElement(name: string, tag: string): boolean {
  if (name === "code" || name === "pre" || name === "script" || name === "style") return true;
  if (name !== "span") return false;
  const cls = /\bclass\s*=\s*["']([^"']*)["']/.exec(tag)?.[1] ?? "";
  const tokens = cls.split(/\s+/);
  return tokens.includes("term") || tokens.includes("ref");
}

// Wrap concept words in prose. Skip code, pre, and existing .ref / .term
// spans so a component name is not wrapped a second time.
export function wrapConcepts(html: string, concepts: Concept[]): string {
  const re = conceptPattern(concepts);
  if (!re || !html) return html;
  const byTerm = new Map(concepts.map((c) => [c.term?.trim().toLowerCase() ?? "", c.term?.trim() ?? ""]));
  let skip = 0;
  return splitTags(html).map((part) => {
    if (part.startsWith("<") || part.startsWith("<!--")) {
      const named = /^<\s*(\/?)\s*([a-zA-Z][\w:-]*)/.exec(part);
      if (!named) return part;
      const closing = named[1] === "/";
      const name = named[2].toLowerCase();
      const selfClose = /\/>\s*$/.test(part) || VOID_TAGS.has(name);
      if (closing) {
        if (skip > 0) skip--;
      } else if (!selfClose && (skip > 0 || isSkipElement(name, part))) {
        skip++;
      }
      return part;
    }
    if (skip > 0) return part;
    re.lastIndex = 0;
    return part.replace(re, (match) => {
      const term = byTerm.get(match.toLowerCase());
      if (!term) return match;
      return `<span class="term" role="button" tabindex="0" aria-expanded="false" aria-controls="ref-popover" data-term="${escAttr(term)}">${match}</span>`;
    });
  }).join("");
}

// A term is present when render wrapped it, or a .ref / diagram label is exactly
// that word (those popovers gain the explanation without a second span).
export function conceptIsPresent(term: string, wrapped: string[], labels: string[]): boolean {
  const attr = `data-term="${escAttr(term)}"`;
  if (wrapped.some((html) => html.includes(attr))) return true;
  const key = term.toLowerCase();
  return labels.some((label) => label.trim().toLowerCase() === key);
}
