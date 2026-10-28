// Shared helpers for the planner page: the render environment, chips, section frames, number format.

import { escAttr, escHtml } from "../../core/html.ts";
import { wrapConcepts } from "../../core/concepts.ts";
import type { Concept } from "../../core/concepts.ts";
import type { Lang } from "../../core/template.ts";
import type { Plan, Step } from "./model.ts";
import type { Copy } from "./l10n.ts";

export type Tone = "ok" | "warn" | "bad" | "info" | "primary" | "";

/** What every section builder needs. `prose`, `labels`, `fragments` and `embed` fill up while sections render. */
export interface Env {
  plan: Plan;
  t: Copy;
  lang: Lang;
  concepts: Concept[];
  warnings: string[];
  /** Concept-wrapped HTML that counts as prose for the "concept not in prose" check. */
  prose: string[];
  /** Ref and diagram labels for the same check. */
  labels: string[];
  /** Author-written HTML fragments for checkRefs. */
  fragments: string[];
  /** Repo-relative paths for the file store. */
  embed: Set<string>;
}

/** Number with up to 2 decimals, no trailing zeros. Vietnamese uses a decimal comma. */
export function num(n: number, lang: Lang): string {
  const s = String(Math.round(n * 100) / 100);
  return lang === "vi" ? s.replace(".", ",") : s;
}

export function withUnit(n: number, unit: string, lang: Lang): string {
  return unit ? `${num(n, lang)} ${unit}` : num(n, lang);
}

export function chip(text: string, tone: Tone = "", extra = ""): string {
  const cls = ["nsx-chip", tone && `nsx-${tone}`, extra].filter(Boolean).join(" ");
  return `<span class="${cls}">${escHtml(text)}</span>`;
}

export function linkChip(id: string, href = `#${id}`, tone: Tone = ""): string {
  const cls = ["nsx-chip", "nsx-link", tone && `nsx-${tone}`].filter(Boolean).join(" ");
  return `<a class="${cls}" href="${escAttr(href)}">${escHtml(id)}</a>`;
}

export function sourceChips(ids: string[]): string {
  return ids.map((id) => linkChip(id, `#src-${id}`, "info")).join("");
}

/** Author HTML: concept-wrap it and count it as prose. */
export function wrapHtml(env: Env, html: string): string {
  const out = wrapConcepts(html, env.concepts);
  env.prose.push(out);
  return out;
}

/** Plain text field: escape first, then concept-wrap. */
export function wrapText(env: Env, text: string): string {
  return wrapHtml(env, escHtml(text));
}

/** One page section: the id (`sec-<id>`), the heading for the table of contents, and the markup. */
export interface Sec { id: string; title: string; html: string }

export function section(id: string, title: string, inner: string, extra = ""): Sec {
  return {
    id,
    title,
    html: `<section id="sec-${id}" class="nsx-sec rounded-box bg-base-100 p-6 shadow-sm"${extra}>
    <h2 class="text-xl font-semibold mb-3">${escHtml(title)}</h2>
    ${inner}
  </section>`,
  };
}

export const field = (path: string) => ` data-nsx-field="${escAttr(path)}"`;

export function table(head: string[], rows: string[], cls = ""): string {
  const th = head.map((h) => `<th scope="col">${h}</th>`).join("");
  return `<div class="nsx-scroll"><table class="nsx-table ${cls}"><thead><tr>${th}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

export function list(items: string[], cls = ""): string {
  return items.length ? `<ul class="nsx-list ${cls}">${items.map((i) => `<li>${i}</li>`).join("")}</ul>` : "";
}

/** `path:line` -> { path, line }. A bare path has no line. */
export function splitPathLine(spec: string): { path: string; line?: number } {
  const m = /^(.+):(\d+)$/.exec(spec.trim());
  return m ? { path: m[1], line: Number(m[2]) } : { path: spec.trim() };
}

export const baseName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

/** Sum of PERT means of the steps that carry an estimate. */
export function stepMean(step: Step): number {
  const e = step.estimate;
  return e ? (e.o + 4 * e.m + e.p) / 6 : 0;
}
