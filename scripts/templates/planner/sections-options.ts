// Planner page section 6: options, decision matrix, why, sensitivity.

import { escAttr, escHtml } from "../../core/html.ts";
import { decisionSensitivity, weightedTotals } from "./model.ts";
import type { PlanOption } from "./model.ts";
import { chip, field, linkChip, list, num, section, table, wrapHtml, wrapText } from "./ui.ts";
import type { Env, Sec, Tone } from "./ui.ts";

const EPS = 1e-9;

function optionCard(env: Env, o: PlanOption, chosen: boolean, hasDecision: boolean): string {
  const { t } = env;
  const rejected = hasDecision && !chosen && o.rejectedBecause
    ? `<p class="nsx-rejected"><strong>${escHtml(t.rejected)}:</strong> ${wrapText(env, o.rejectedBecause)}</p>`
    : "";
  const pros = o.pros.length ? `<div><h4 class="nsx-sub">${escHtml(t.pros)}</h4>${list(o.pros.map((p) => wrapText(env, p)), "nsx-pros")}</div>` : "";
  const cons = o.cons.length ? `<div><h4 class="nsx-sub">${escHtml(t.cons)}</h4>${list(o.cons.map((c) => wrapText(env, c)), "nsx-cons")}</div>` : "";
  return `<article class="nsx-card nsx-option${chosen ? " nsx-chosen" : ""}" id="${escAttr(o.id)}"${field(`options[${o.id}]`)}>
      <div class="nsx-meta">${chip(o.id, "info")}<strong>${escHtml(o.title)}</strong>${chosen ? chip(t.chosen, "ok") : ""}</div>
      ${o.summary ? `<p>${wrapText(env, o.summary)}</p>` : ""}
      ${pros || cons ? `<div class="nsx-cols">${pros}${cons}</div>` : ""}
      ${rejected}
    </article>`;
}

/** The first option with the highest total (option order breaks ties, as in the model). */
function leaderOf(env: Env, totals: Record<string, number>): string | null {
  let best: string | null = null;
  for (const o of env.plan.options) if (best === null || totals[o.id] > totals[best] + EPS) best = o.id;
  return best;
}

function matrix(env: Env, totals: Record<string, number>): string {
  const { plan, t, lang } = env;
  const winner = leaderOf(env, totals);
  const chosen = plan.decision?.chosen;
  const maxScore = 5 * plan.criteria.reduce((sum, c) => sum + c.weight, 0) || 1;
  const win = (id: string) => (id === winner ? " nsx-win" : "");
  const head = [
    escHtml(t.criterion),
    ...plan.options.map(
      (o) => `${escHtml(o.id)} ${escHtml(o.title)}${o.id === chosen ? ` ${chip(t.chosen, "ok")}` : ""}`,
    ),
  ];
  const rows = plan.criteria.map(
    (c) =>
      `<tr><th scope="row">${escHtml(c.label)} <span class="nsx-muted">(${escHtml(t.weight)} ${num(c.weight, lang)})</span></th>${plan.options
        .map((o) => `<td class="nsx-num${win(o.id)}">${plan.scores[o.id]?.[c.id] ?? "–"}</td>`)
        .join("")}</tr>`,
  );
  rows.push(
    `<tr class="nsx-total"><th scope="row">${escHtml(t.total)}</th>${plan.options
      .map((o) => {
        const pct = Math.round((totals[o.id] / maxScore) * 100);
        return `<td class="nsx-num${win(o.id)}"${o.id === winner ? ' data-winner="true"' : ""}><strong>${num(totals[o.id], lang)}</strong><span class="nsx-score-bar" aria-hidden="true"><span style="width:${pct}%"></span></span></td>`;
      })
      .join("")}</tr>`,
  );
  return `<h3 class="nsx-sub">${escHtml(t.matrixTitle)}</h3>${table(head, rows, "nsx-matrix")}`;
}

function why(env: Env): string {
  const { plan, t } = env;
  const d = plan.decision;
  if (!d) return "";
  const chosen = plan.options.find((o) => o.id === d.chosen);
  const drivers = d.drivers.length
    ? `<div class="nsx-chips"><span class="nsx-muted">${escHtml(t.drivers)}:</span>${d.drivers.map((id) => linkChip(id)).join("")}</div>`
    : "";
  const tone: Record<string, Tone> = { good: "ok", bad: "bad", neutral: "" };
  const consequences = d.consequences.length
    ? `<h4 class="nsx-sub">${escHtml(t.consequences)}</h4>${list(
        d.consequences.map((c) => `${chip(t.tone[c.tone], tone[c.tone])} ${wrapText(env, c.text)}`),
        "nsx-conseq",
      )}`
    : "";
  return `<div${field("decision")}><h3 class="nsx-sub">${escHtml(t.whyTitle)}</h3>
      <p class="nsx-lead">${chosen ? `<strong>${escHtml(chosen.id)} ${escHtml(chosen.title)}.</strong> ` : ""}${wrapHtml(env, escHtml(d.because))}</p>
      ${drivers}${consequences}</div>`;
}

function sensitivity(env: Env): string {
  const { plan, t, lang } = env;
  if (plan.options.length < 2 || plan.criteria.length === 0) return "";
  const flips = decisionSensitivity(plan);
  const sentences = flips.map((f) => {
    const crit = plan.criteria.find((c) => c.id === f.criterion);
    const opt = plan.options.find((o) => o.id === f.flipsTo);
    const from = num(crit?.weight ?? 0, lang);
    const to = num(f.atWeight, lang);
    const label = crit?.label ?? f.criterion;
    const name = opt ? opt.title : f.flipsTo;
    const down = f.atWeight < (crit?.weight ?? 0);
    return escHtml((down ? t.sensDown : t.sensUp)(label, from, to, name));
  });
  const body = sentences.length ? list(sentences, "nsx-sens") : `<p>${escHtml(t.sensNone)}</p>`;
  return `<div${field("criteria")}><h3 class="nsx-sub">${escHtml(t.sensitivityTitle)}</h3>${body}</div>`;
}

export function optionsSection(env: Env): Sec | null {
  const { plan, t } = env;
  if (plan.options.length === 0) return null;
  const totals = weightedTotals(plan);
  const chosen = plan.decision?.chosen;
  let inner = `<div class="nsx-stack">${plan.options.map((o) => optionCard(env, o, o.id === chosen, !!plan.decision)).join("")}</div>`;
  if (plan.criteria.length) inner += matrix(env, totals);
  inner += why(env);
  inner += sensitivity(env);
  return section("decision-matrix", t.optionsTitle, inner);
}
