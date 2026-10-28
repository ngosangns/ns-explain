// Planner template: turns a plan manifest into a page. Request, starting point, goals, sourced research,
// options and decision, steps with a dependency graph and schedule, risks, charts, open questions, verdict.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkBareCode, checkRefs } from "../../core/refs.ts";
import { escAttr, escHtml } from "../../core/html.ts";
import { wrapConcepts } from "../../core/concepts.ts";
import { diffManifests } from "../../core/revision.ts";
import type { RevisionChange } from "../../core/revision.ts";
import type { RenderContext, Template, TemplateResult } from "../../core/template.ts";
import { PLANNER_CSS } from "./css.ts";
import { L10N } from "./l10n.ts";
import { allSteps, normalizePlan } from "./model.ts";
import { chartsSection, questionsSection, verdictSection } from "./sections-end.ts";
import { optionsSection } from "./sections-options.ts";
import { planSection, risksSection } from "./sections-plan.ts";
import { goalsSection, requestSection, researchSection, revisionSection, startingSection, statusStrip } from "./sections-intro.ts";
import { checkSources } from "./sources.ts";
import type { Env, Sec } from "./ui.ts";

export { PLANNER_CSS };

const TOC_MIN_SECTIONS = 6;
const CHECK_TIMEOUT_MS = 8000;
const REF_ID_RE = /\[([SF]\d+)\]/g;
const DATA_PATH_RE = /data-path=["']([^"']+)["']/g;

/** `[S9]` or `[F9]` written in an HTML fragment must name a source or finding that exists. */
function checkIdTypos(fragments: [string, string][], env: Env): void {
  const known = new Set([...env.plan.sources.map((s) => s.id), ...env.plan.findings.map((f) => f.id)]);
  for (const [where, html] of fragments) {
    for (const m of html.matchAll(REF_ID_RE)) {
      if (!known.has(m[1])) env.warnings.push(`${where}: "[${m[1]}]" is not a source or finding id`);
    }
  }
}

function toc(env: Env, sections: Sec[]): string {
  if (sections.length < TOC_MIN_SECTIONS) return "";
  const links = sections.map((s) => `<a href="#sec-${escAttr(s.id)}">${escHtml(s.title)}</a>`).join("");
  return `<nav class="nsx-toc" aria-label="${escAttr(env.t.tocLabel)}">${links}</nav>`;
}

async function render(ctx: RenderContext): Promise<TemplateResult> {
  const { lang, concepts, warnings } = ctx;
  const errors: string[] = [];
  const plan = normalizePlan(ctx.manifest, warnings, errors);
  if (errors.length > 0) {
    for (const e of errors) console.error(`manifest: ${e}`);
    process.exit(2);
  }

  const env: Env = {
    plan,
    t: L10N[lang],
    lang,
    concepts,
    warnings,
    prose: [],
    labels: [],
    fragments: [],
    embed: new Set(),
  };

  // Author-written HTML. Each one is checked for refs, bare code and id typos.
  const authored: [string, string][] = [["oneLiner", plan.oneLiner]];
  if (plan.starting.summary) authored.push(["starting.summary", plan.starting.summary]);
  plan.starting.facts.forEach((f, i) => authored.push([`starting.facts[${i}]`, f.text]));
  for (const f of plan.findings) authored.push([`findings[${f.id}]`, f.text]);
  for (const s of allSteps(plan)) if (s.detail) authored.push([`steps[${s.id}].detail`, s.detail]);
  env.fragments.push(...authored.map(([, html]) => html));
  checkIdTypos(authored, env);

  for (const [, html] of authored) for (const m of html.matchAll(DATA_PATH_RE)) env.embed.add(m[1]);
  for (const s of plan.sources) if ((s.kind === "code" || s.kind === "doc") && s.path) env.embed.add(s.path);

  const oneLiner = wrapConcepts(plan.oneLiner, concepts);
  env.prose.push(oneLiner);

  const previous = ctx.options.previous;
  const changes: RevisionChange[] =
    typeof previous === "object" && previous !== null ? diffManifests(previous, ctx.manifest) : [];

  const body: (Sec | null)[] = [
    revisionSection(env, changes),
    requestSection(env),
    startingSection(env),
    goalsSection(env),
    researchSection(env),
    optionsSection(env),
    planSection(env),
    risksSection(env),
    chartsSection(env),
    questionsSection(env),
    verdictSection(env),
  ];
  const sections = body.filter((s): s is Sec => s !== null);
  const [first, ...rest] = [statusStrip(env), toc(env, sections), ...sections.map((s) => s.html)];

  const webSources = plan.sources.filter((s) => s.kind === "web");
  const afterWrite = async () => {
    checkBareCode(authored, warnings);
    if (ctx.options.checkSources !== true) return;
    const results = await checkSources(webSources, { timeoutMs: CHECK_TIMEOUT_MS });
    let failed = 0;
    for (const r of results) {
      if (r.status !== "error" && r.status < 400) continue;
      failed++;
      warnings.push(`source ${r.id} ${r.url} -> ${r.status === "error" ? `error${r.message ? ` (${r.message})` : ""}` : r.status}`);
    }
    console.error(`sources checked: ${results.length - failed} ok, ${failed} failed`);
  };

  return {
    oneLiner,
    sections: [first, ...rest].filter(Boolean).join("\n  "),
    embed: [...env.embed],
    ui: { comments: env.t.comments },
    css: PLANNER_CSS,
    prose: env.prose,
    labels: env.labels,
    refFragments: env.fragments,
    afterWrite,
  };
}

export const planner: Template = {
  id: "planner",
  required: ["title", "oneLiner", "request", "phases"],
  summary: {
    vi: "Lên kế hoạch: yêu cầu, điểm xuất phát, research có nguồn, phương án, các bước, rủi ro, câu hỏi mở.",
    en: "Plan work: request, starting point, sourced research, options, steps, risks, open questions.",
  },
  playbook: join(dirname(fileURLToPath(import.meta.url)), "playbook.md"),
  render,
};
