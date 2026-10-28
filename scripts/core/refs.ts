// The `.ref` component contract: spans that carry a file path and a description.

import { escAttr, escHtml } from "./html.ts";

// Parse `.ref` spans; attrs may hold `>` inside quoted values (e.g.
// data-desc="Promise<boolean>"), so the attr scan is quote-aware.
export const REF_RE =
  /<span class="ref"((?:"[^"]*"|'[^']*'|[^'">])*)>([\s\S]*?)<\/span>/g;
export const ATTR_RE = /([\w-]+)=["']([^"']*)["']/g;

export function checkRefs(fragments: unknown[], warnings: string[]) {
  for (const frag of fragments) {
    for (const m of String(frag).matchAll(REF_RE)) {
      const attrs = Object.fromEntries(
        [...m[1].matchAll(ATTR_RE)].map((a) => [a[1], a[2]]),
      );
      const label = m[2].replace(/<[^>]+>/g, "").trim();
      const at = `ref "${label || "?"}"`;
      if (!attrs["data-path"])
        warnings.push(
          `${at}: missing data-path — every popover needs a file; point platform APIs at the closest repo call site`,
        );
      if (!attrs["data-desc"]) warnings.push(`${at}: missing data-desc`);
      if (attrs["data-line"] != null && !/^\d+$/.test(attrs["data-line"]))
        warnings.push(`${at}: data-line "${attrs["data-line"]}" is not a line number`);
      if (/:\d+$/.test(label) || /[\w-]+\/[\w/-]+/.test(label))
        warnings.push(
          `${at}: label looks like a path — the label shows only the component name; the location lives in the popover`,
        );
    }
  }
}

// A bare `<code>foo</code>` in the lenses names a component without giving it
// a popover — every mentioned variable/function/class/interface/constant must
// be a `.ref` span instead.
const CODE_RE = /<code[^>]*>([^<]*)<\/code>/g;
const BARE_IDENT = /^[a-zA-Z_$][\w$.]*$|^[\w$.]+\([^()]*\)$/;
const CODE_LITERALS = new Set([
  "null", "true", "false", "undefined", "this", "self", "void",
]);

export function checkBareCode(fragments: [string, unknown][], warnings: string[]) {
  for (const [field, frag] of fragments) {
    const s = String(frag || "");
    // <code> inside a .ref label is already referenced — skip those ranges.
    const refRanges = [...s.matchAll(REF_RE)].map((m) => [
      m.index,
      m.index + m[0].length,
    ]);
    for (const m of s.matchAll(CODE_RE)) {
      if (refRanges.some(([a, b]) => m.index >= a && m.index < b)) continue;
      const t = m[1].trim();
      if (BARE_IDENT.test(t) && !CODE_LITERALS.has(t))
        warnings.push(
          `${field}: \`${t}\` is plain <code> — every named component must be a .ref span so it gets the popover`,
        );
    }
  }
}

// One `.ref` span. The label is the component name only; the path lives in the popover.
export function refSpan(path: string, line: number | undefined, desc: string, label: string): string {
  return `<span class="ref" tabindex="0" data-path="${escAttr(path)}"${line != null ? ` data-line="${line}"` : ""} data-desc="${escAttr(desc)}">${escHtml(label)}</span>`;
}
