// Template interface and registry. A template turns a manifest into the sections of the page; the shell
// (core/shell.ts) owns everything around them.

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Concept } from "./concepts.ts";
import { reviewer } from "../templates/reviewer/index.ts";

export type Lang = "vi" | "en";

export interface RenderContext {
  manifest: Record<string, unknown>;
  manifestPath: string;            // absolute
  name: string;                    // kebab output name
  lang: Lang;
  concepts: Concept[];             // normalized
  warnings: string[];              // push warnings here
  options: Record<string, unknown>;// CLI flags, e.g. { checkSources: true }
}

export interface TemplateResult {
  oneLiner: string;                // already concept-wrapped HTML
  sections: string;                // every <section> after the header, in order
  embed: string[];                 // repo-relative paths to embed in the file store
  ui?: Record<string, unknown>;    // merged into the #nsx-ui JSON
  css?: string;                    // extra CSS, put in a <style> after the base styles
  prose: string[];                 // wrapped HTML used for the "concept not in prose" check
  labels: string[];                // ref + diagram labels for the same check
  refFragments: unknown[];         // fragments for checkRefs
  afterWrite?: () => void | Promise<void>; // checks that run after the HTML file is written
}

export interface Template {
  id: string;
  required: string[];              // required top-level manifest fields
  summary: { vi: string; en: string }; // one line: when to use it (printed by `templates` and bare `playbook`)
  playbook: string;                // absolute path of the template playbook.md
  render(ctx: RenderContext): Promise<TemplateResult>;
}

/** What `templates` and bare `playbook` print. Needs no module load. */
export interface TemplateInfo {
  id: string;
  summary: { vi: string; en: string };
  playbook: string;
}

const CORE_DIR = dirname(fileURLToPath(import.meta.url)); // scripts/core/
const TEMPLATES_DIR = join(CORE_DIR, "..", "templates");

// The planner module is loaded on demand: `templates`, `playbook` and reviewer renders never touch it.
const PLANNER_INFO: TemplateInfo = {
  id: "planner",
  summary: {
    vi: "Lên kế hoạch: yêu cầu, điểm xuất phát, research có nguồn, phương án, các bước, rủi ro, câu hỏi mở.",
    en: "Plan work: request, starting point, sourced research, options, steps, risks, open questions.",
  },
  playbook: join(TEMPLATES_DIR, "planner", "playbook.md"),
};

const INFOS: TemplateInfo[] = [
  { id: reviewer.id, summary: reviewer.summary, playbook: reviewer.playbook },
  PLANNER_INFO,
];

export function listTemplates(): TemplateInfo[] {
  return INFOS.map((info) => ({ ...info }));
}

export function templateIds(): string[] {
  return INFOS.map((info) => info.id);
}

/**
 * Import a module next to the core files only when its file exists. A missing file returns null; a file
 * that exists but fails to load throws, so a real error is never hidden. `rel` is relative to scripts/.
 */
export async function importIfPresent<T = Record<string, unknown>>(rel: string): Promise<T | null> {
  const url = new URL(`../${rel}`, import.meta.url);
  try {
    await readFile(fileURLToPath(url), "utf8");
  } catch {
    return null;
  }
  return await import(url.href) as T;
}

/** Throws `unknown template` for an id that is not registered, and `not available` when its module is missing. */
export async function getTemplate(id: string): Promise<Template> {
  if (id === reviewer.id) return reviewer;
  if (id === PLANNER_INFO.id) {
    const mod = await importIfPresent<{ planner?: Template }>("templates/planner/index.ts");
    if (!mod?.planner) throw new Error(`template "${id}" is not available`);
    return mod.planner;
  }
  throw new Error(`unknown template "${id}" (valid: ${templateIds().join(", ")})`);
}
