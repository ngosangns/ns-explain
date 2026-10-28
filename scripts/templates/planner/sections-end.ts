// Planner page sections 9-11: charts, open questions and assumptions, the reader's decision.

import { chartSvg, validateChart } from "../../core/charts.ts";
import type { ChartSpec } from "../../core/charts.ts";
import { escAttr, escHtml } from "../../core/html.ts";
import { chip, field, linkChip, section, wrapText } from "./ui.ts";
import type { Env, Sec } from "./ui.ts";

const CONFIDENCES = ["high", "medium", "low"] as const;

/** Stacked bar: findings per source kind, split by confidence. Derived from the plan, so it needs no source. */
function coverageChart(env: Env): string | null {
  const { plan, t, lang } = env;
  const kindOf = new Map(plan.sources.map((s) => [s.id, s.kind as string]));
  const rows = new Map<string, Record<string, number>>();
  for (const f of plan.findings) {
    for (const kind of new Set(f.sources.map((id) => kindOf.get(id)).filter((k): k is string => !!k))) {
      const row = rows.get(kind) ?? { high: 0, medium: 0, low: 0 };
      row[f.confidence]++;
      rows.set(kind, row);
    }
  }
  if (rows.size === 0) return null;
  const x = [...rows.keys()];
  return `<figure class="nsx-figure">${chartSvg(
    {
      kind: "stacked",
      title: t.coverageTitle,
      unit: t.coverageUnit,
      x,
      series: CONFIDENCES.map((c) => ({ name: t.confidence[c], values: x.map((k) => rows.get(k)![c]) })),
    },
    { lang },
  )}<figcaption class="nsx-muted">${escHtml(t.coverageTitle)}</figcaption></figure>`;
}

export function chartsSection(env: Env): Sec | null {
  const { plan, t, lang, warnings } = env;
  const sourceIds = new Set(plan.sources.map((s) => s.id));
  const parts: string[] = [];
  for (const raw of plan.charts) {
    const spec: ChartSpec | null = validateChart(raw, `charts[${raw.id}]`, sourceIds, warnings);
    if (!spec) continue;
    const caption = `${spec.title ? `<span>${escHtml(spec.title)}</span> ` : ""}${spec.source && sourceIds.has(spec.source) ? linkChip(spec.source, `#src-${spec.source}`, "info") : ""}`;
    parts.push(
      `<figure class="nsx-figure"${field(`charts[${raw.id}]`)}>${chartSvg(spec, { lang })}<figcaption class="nsx-muted">${caption}</figcaption></figure>`,
    );
  }
  const coverage = coverageChart(env);
  if (coverage) parts.push(coverage);
  if (plan.charts.length === 0) return null;
  return section("charts", t.chartsTitle, parts.join(""));
}

function questionCard(env: Env, q: Env["plan"]["questions"][number]): string {
  const { t } = env;
  const block = q.blocking && !q.answer;
  const head = `<div class="nsx-meta">${chip(q.id, "info")}${q.blocking ? chip(t.blocking, "warn") : ""}${q.answer ? chip(t.answered, "ok") : ""}</div>`;
  const text = `<p class="nsx-lead">${wrapText(env, q.text)}</p>`;
  const cls = `nsx-card nsx-question${block ? " nsx-blocking" : ""}`;
  const open = `<article class="${cls}" id="${escAttr(q.id)}"${field(`questions[${q.id}]`)} data-nsx-label="${escAttr(q.text)}">`;
  if (q.answer) return `${open}${head}${text}<p class="nsx-answer">${wrapText(env, q.answer)}</p></article>`;
  const def = q.default ? `<p class="nsx-muted">${escHtml(t.defaultIf)} ${wrapText(env, q.default)}</p>` : "";
  const input = q.options.length
    ? `<div data-nsx-input role="radiogroup" aria-label="${escAttr(`${t.answerLabel} ${q.id}`)}" class="nsx-radios">${q.options
        .map((o) => `<label class="nsx-choice"><input type="radio" name="${escAttr(q.id)}" value="${escAttr(o)}"> <span>${escHtml(o)}</span></label>`)
        .join("")}</div>`
    : `<textarea data-nsx-input rows="2" class="nsx-textarea" aria-label="${escAttr(`${t.answerLabel} ${q.id}`)}"></textarea>`;
  return `${open}${head}${text}${def}${input}</article>`;
}

export function questionsSection(env: Env): Sec | null {
  const { plan, t } = env;
  if (plan.questions.length === 0 && plan.assumptions.length === 0) return null;
  const ordered = [...plan.questions].sort((a, b) => Number(b.blocking && !b.answer) - Number(a.blocking && !a.answer));
  let inner = ordered.map((q) => questionCard(env, q)).join("");
  if (plan.assumptions.length) {
    inner += `<h3 class="nsx-sub">${escHtml(t.assumptions)}</h3><ul class="nsx-list">${plan.assumptions
      .map(
        (a) =>
          `<li id="${escAttr(a.id)}"${field(`assumptions[${a.id}]`)}>${chip(a.id, "info")} ${wrapText(env, a.text)}${a.checkBy ? ` <span class="nsx-muted">${escHtml(t.checkBy)}: ${wrapText(env, a.checkBy)}</span>` : ""}</li>`,
      )
      .join("")}</ul>`;
  }
  return section("questions", t.questionsTitle, inner);
}

export function verdictSection(env: Env): Sec {
  const { t } = env;
  const inner = `<p>${escHtml(t.verdictHelp)}</p>
    <div class="nsx-verdict"${field("decision")} data-nsx-decision>
      <div class="nsx-verdict-btns">
        <button type="button" class="nsx-vbtn" data-nsx-verdict="approve" aria-pressed="false">${escHtml(t.approve)}</button>
        <button type="button" class="nsx-vbtn" data-nsx-verdict="request-changes" aria-pressed="false">${escHtml(t.requestChanges)}</button>
      </div>
      <label class="nsx-notelabel">${escHtml(t.noteLabel)}<textarea data-nsx-decision-note rows="3" class="nsx-textarea"></textarea></label>
    </div>`;
  return section("verdict", t.verdictTitle, inner);
}
