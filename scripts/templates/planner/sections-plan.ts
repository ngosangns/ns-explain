// Planner page sections 7-8: plan (steps, dependency graph, schedule, effort) and risks.

import { chartSvg, ganttSvg, riskMatrixSvg } from "../../core/charts.ts";
import { escAttr, escHtml, escJson } from "../../core/html.ts";
import { refSpan } from "../../core/refs.ts";
import type { GraphModel } from "../../src/types.ts";
import { allSteps, riskScore, scheduleSteps } from "./model.ts";
import type { Phase, Step } from "./model.ts";
import { baseName, chip, field, linkChip, list, num, section, splitPathLine, stepMean, table, withUnit, wrapHtml, wrapText } from "./ui.ts";
import type { Env, Sec, Tone } from "./ui.ts";

const STATE_TONE: Record<string, Tone> = { todo: "", doing: "primary", done: "ok", blocked: "bad" };

function fileRefs(env: Env, step: Step): string {
  return step.files
    .map((spec) => {
      const { path, line } = splitPathLine(spec);
      const label = baseName(path);
      env.embed.add(path);
      env.labels.push(label);
      const span = refSpan(path, line, step.title, label);
      env.fragments.push(span);
      return `${span}<span class="nsx-muted nsx-mono"> ${escHtml(path)}${line != null ? `:${line}` : ""}</span>`;
    })
    .join('<span class="nsx-sep"> · </span>');
}

function stepRow(env: Env, phase: Phase, step: Step, critical: Set<string>): string {
  const { t, lang, plan } = env;
  const e = step.estimate;
  const estimate = e
    ? `${chip(`${num(e.o, lang)}–${num(e.m, lang)}–${num(e.p, lang)} (${withUnit(stepMean(step), step.unit || plan.unit, lang)})`, "", "nsx-est")}`
    : chip(t.noEstimate, "warn");
  const star = critical.has(step.id) ? `<span class="nsx-star" title="${escAttr(t.critical)}" aria-label="${escAttr(t.critical)}">★</span>` : "";
  const deps = step.dependsOn.length
    ? `<span class="nsx-muted">${escHtml(t.dependsOn)}</span>${step.dependsOn.map((d) => linkChip(d)).join("")}`
    : "";
  const files = step.files.length ? `<div class="nsx-files">${fileRefs(env, step)}</div>` : "";
  const verify = step.verify ? `<p class="nsx-verify"><strong>${escHtml(t.verify)}:</strong> ${wrapText(env, step.verify)}</p>` : "";
  return `<li class="nsx-step nsx-st-${step.state}" id="${escAttr(step.id)}"${field(`phases[${phase.id}].steps[${step.id}]`)}>
        <div class="nsx-meta">${chip(step.id, "info")}${star}<strong class="nsx-steptitle">${escHtml(step.title)}</strong></div>
        <div class="nsx-chips">${chip(t.state[step.state], STATE_TONE[step.state])}${chip(t.owner[step.owner])}${estimate}${deps}</div>
        ${step.detail ? `<div class="nsx-html">${wrapHtml(env, step.detail)}</div>` : ""}
        ${files}${verify}
      </li>`;
}

function phaseBlock(env: Env, phase: Phase, critical: Set<string>): string {
  const { t, lang, plan } = env;
  const sub = phase.steps.reduce((sum, s) => sum + stepMean(s), 0);
  const subtotal = phase.steps.some((s) => s.estimate) ? chip(t.phaseTotal(withUnit(sub, plan.unit, lang))) : "";
  return `<div class="nsx-phase" id="${escAttr(phase.id)}">
      <div class="nsx-meta">${chip(phase.id, "info")}<h3 class="nsx-phasetitle">${escHtml(phase.title)}</h3>${subtotal}</div>
      ${phase.goal ? `<p class="nsx-muted">${wrapText(env, phase.goal)}</p>` : ""}
      <ol class="nsx-steps">${phase.steps.map((s) => stepRow(env, phase, s, critical)).join("")}</ol>
    </div>`;
}

function graphModel(env: Env, critical: Set<string>): GraphModel {
  const { plan, lang } = env;
  const nodes: NonNullable<GraphModel["nodes"]> = [];
  const edges: NonNullable<GraphModel["edges"]> = [];
  for (const phase of plan.phases) {
    for (const s of phase.steps) {
      const first = s.files[0] ? splitPathLine(s.files[0]) : null;
      nodes.push({
        id: s.id,
        label: `${s.id} ${s.title}`,
        kind: phase.title,
        change: critical.has(s.id) ? "modified" : "same",
        ...(s.verify ? { desc: s.verify } : {}),
        ...(first ? { path: first.path, ...(first.line != null ? { line: first.line } : {}) } : {}),
      });
      env.labels.push(`${s.id} ${s.title}`);
      for (const d of s.dependsOn) {
        edges.push({ id: `${d}->${s.id}`, source: d, target: s.id, change: "same" });
      }
    }
  }
  const flows = plan.phases
    .filter((p) => p.steps.length > 0)
    .map((p) => ({ id: p.id, title: `${p.id} ${p.title}`, steps: p.steps.map((s) => ({ target: s.id, note: s.title })) }));
  return { lang, nodes, edges, flows };
}

export function planSection(env: Env): Sec {
  const { plan, t, lang } = env;
  const schedule = scheduleSteps(plan);
  let inner = plan.phases.map((p) => phaseBlock(env, p, schedule.critical)).join("");

  const steps = allSteps(plan);
  if (steps.length > 0) {
    const model = graphModel(env, schedule.critical);
    inner += `<h3 class="nsx-sub">${escHtml(t.graphTitle)}</h3>
      <div class="lens-diagram"${field("phases")}><script class="graph-model" type="application/json">${escJson(model)}</script></div>`;

    const phaseOf = new Map(plan.phases.flatMap((p) => p.steps.map((s) => [s.id, p] as const)));
    const bars = steps
      .filter((s) => s.estimate)
      .map((s) => ({
        id: s.id,
        label: s.title,
        start: schedule.start[s.id],
        end: schedule.end[s.id],
        critical: schedule.critical.has(s.id),
        group: `${phaseOf.get(s.id)!.id} ${phaseOf.get(s.id)!.title}`,
        state: s.state,
      }));
    if (bars.length > 0) {
      const missing = steps.filter((s) => !s.estimate);
      const note = missing.length
        ? `<p class="nsx-muted">${escHtml(t.noEstimate)}: ${missing.map((s) => escHtml(s.id)).join(", ")}</p>`
        : "";
      inner += `<h3 class="nsx-sub">${escHtml(t.scheduleTitle)}</h3><figure class="nsx-figure">${ganttSvg(bars, { unit: plan.unit, lang })}</figure>${note}`;
      const effort = plan.phases
        .filter((p) => p.steps.some((s) => s.estimate))
        .map((p) => ({ x: `${p.id} ${p.title}`, v: Math.round(p.steps.reduce((sum, s) => sum + stepMean(s), 0) * 100) / 100 }));
      inner += `<h3 class="nsx-sub">${escHtml(t.effortTitle)}</h3><figure class="nsx-figure">${chartSvg(
        {
          kind: "bar",
          title: t.effortTitle,
          unit: plan.unit,
          x: effort.map((e) => e.x),
          series: [{ name: t.effortSeries, values: effort.map((e) => e.v) }],
        },
        { lang },
      )}</figure>`;
    }
  }
  return section("plan", t.planTitle, inner);
}

// ---- 8. risks ----

function band(score: number): Tone {
  return score >= 15 ? "bad" : score >= 10 ? "warn" : score >= 5 ? "info" : "ok";
}

export function risksSection(env: Env): Sec | null {
  const { plan, t, lang } = env;
  if (plan.risks.length === 0 && plan.rabbitHoles.length === 0) return null;
  let inner = "";
  if (plan.risks.length > 0) {
    inner += `<figure class="nsx-figure nsx-risk">${riskMatrixSvg(
      plan.risks.map((r) => ({ id: r.id, label: r.text, likelihood: r.likelihood, impact: r.impact })),
      { lang },
    )}</figure>`;
    const sorted = [...plan.risks].sort((a, b) => riskScore(b) - riskScore(a));
    const rows = sorted.map((r) => {
      const score = riskScore(r);
      return `<tr id="${escAttr(r.id)}"${field(`risks[${r.id}]`)}><td>${chip(r.id, "info")}</td><td>${wrapText(env, r.text)}</td><td>${chip(`${r.likelihood} × ${r.impact} = ${score}`, band(score))}</td><td>${wrapText(env, r.mitigation)}</td><td>${r.steps.map((s) => linkChip(s)).join("")}</td></tr>`;
    });
    inner += table(
      [escHtml(t.riskId), escHtml(t.riskText), escHtml(t.riskScore), escHtml(t.riskMitigation), escHtml(t.riskSteps)],
      rows,
    );
  }
  if (plan.rabbitHoles.length > 0) {
    inner += `<div${field("rabbitHoles")}><h3 class="nsx-sub">${escHtml(t.rabbitHoles)}</h3>${list(plan.rabbitHoles.map((h) => wrapText(env, h)))}</div>`;
  }
  return section("risks", t.risksTitle, inner);
}
