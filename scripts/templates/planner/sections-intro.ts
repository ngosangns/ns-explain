// Planner page sections 0-5: status strip, revision, request, starting point, goals, research.

import { escAttr, escHtml } from "../../core/html.ts";
import { refSpan } from "../../core/refs.ts";
import type { RevisionChange } from "../../core/revision.ts";
import { allSteps, scheduleSteps } from "./model.ts";
import type { Finding, Goal, Source, SourceKind } from "./model.ts";
import {
  baseName, chip, field, linkChip, list, section, sourceChips, stepMean, table, withUnit, wrapHtml, wrapText,
} from "./ui.ts";
import type { Env, Sec, Tone } from "./ui.ts";

const KIND_ORDER: SourceKind[] = ["web", "code", "command", "doc", "user", "history"];
const REVISION_CAP = 40;
const OUTPUT_FOLD = 8;

// ---- 0. status strip ----

const STATUS_TONE: Record<string, Tone> = { draft: "info", approved: "ok", "in-progress": "primary", done: "ok" };

export function statusStrip(env: Env): string {
  const { plan, t, lang } = env;
  const steps = allSteps(plan);
  const blocking = plan.questions.filter((q) => q.blocking && !q.answer).length;
  const chips = [
    chip(t.status[plan.status], STATUS_TONE[plan.status] ?? "", "nsx-status"),
    chip(t.chipSteps(steps.length)),
    chip(t.chipSources(plan.sources.length)),
    chip(t.chipFindings(plan.findings.length)),
  ];
  if (blocking > 0) chips.push(chip(t.chipBlocking(blocking), "warn"));
  const total = steps.reduce((sum, s) => sum + stepMean(s), 0);
  if (steps.some((s) => s.estimate)) chips.push(chip(t.chipEstimate(withUnit(total, plan.unit, lang))));
  const critical = scheduleSteps(plan).total;
  if (critical > 0) chips.push(chip(t.chipCritical(withUnit(critical, plan.unit, lang))));
  return `<section class="nsx-strip rounded-box bg-base-100 p-4 shadow-sm"${field("status")}><div class="nsx-chips">${chips.join("")}</div></section>`;
}

// ---- 1. revision ----

export function revisionSection(env: Env, changes: RevisionChange[]): Sec | null {
  if (changes.length === 0) return null;
  const { t } = env;
  const tone: Record<RevisionChange["kind"], Tone> = { added: "ok", removed: "bad", changed: "warn" };
  const show = (v: string | undefined) => (v === undefined ? "" : v === "" ? escHtml(t.revisionEmpty) : escHtml(v));
  const rows = changes.slice(0, REVISION_CAP).map((c) => {
    let change = "";
    if (c.before !== undefined) change += `<del class="nsx-before">${show(c.before)}</del>`;
    if (c.before !== undefined && c.after !== undefined) change += ` <span aria-hidden="true">→</span> `;
    if (c.after !== undefined) change += `<ins class="nsx-after">${show(c.after)}</ins>`;
    return `<li><code class="nsx-path">${escHtml(c.path)}</code> ${chip(t.revisionKind[c.kind], tone[c.kind])}<div class="nsx-diff">${change}</div></li>`;
  });
  const more = changes.length > REVISION_CAP ? `<p class="nsx-muted">${escHtml(t.revisionMore(changes.length - REVISION_CAP))}</p>` : "";
  return section("revision", t.revisionTitle, `<ul class="nsx-list nsx-revision">${rows.join("")}</ul>${more}`, field("revision"));
}

// ---- 2. request ----

export function requestSection(env: Env): Sec {
  const { plan, t } = env;
  const r = plan.request;
  let inner = `<details class="nsx-original"><summary>${escHtml(t.original)}</summary><blockquote class="nsx-quote nsx-pre">${escHtml(r.original)}</blockquote></details>`;
  if (r.summary) inner += `<p>${wrapText(env, r.summary)}</p>`;
  if (r.constraints.length) {
    inner += `<h3 class="nsx-sub">${escHtml(t.constraints)}</h3>${list(r.constraints.map((c) => wrapText(env, c)))}`;
  }
  if (r.clarifications.length) {
    const rows = r.clarifications.map((c, i) => {
      const by = c.by === "user" ? chip(t.byUser, "ok") : chip(t.byAssumed, "warn");
      return `<tr data-nsx-field="request.clarifications[${i}]"><td>${wrapText(env, c.q)}</td><td>${wrapText(env, c.a)} ${by}</td></tr>`;
    });
    inner += `<h3 class="nsx-sub">${escHtml(t.clarifications)}</h3>${table([escHtml(t.clarifyQ), escHtml(t.clarifyA)], rows)}`;
  }
  return section("request", t.requestTitle, inner, field("request"));
}

// ---- 3. starting point ----

export function startingSection(env: Env): Sec | null {
  const { plan, t } = env;
  const s = plan.starting;
  if (!s.summary && s.facts.length === 0) return null;
  let inner = "";
  if (s.summary) inner += `<div class="nsx-html">${wrapHtml(env, s.summary)}</div>`;
  if (s.facts.length) {
    inner += `<ul class="nsx-list nsx-facts">${s.facts
      .map(
        (f, i) =>
          `<li${field(`starting.facts[${i}]`)}><div class="nsx-html">${wrapHtml(env, f.text)}</div>${f.sources.length ? `<div class="nsx-chips">${sourceChips(f.sources)}</div>` : ""}</li>`,
      )
      .join("")}</ul>`;
  }
  return section("starting", t.startingTitle, inner, field("starting"));
}

// ---- 4. goals ----

const EARS_RE = /\b(THE SYSTEM SHALL|WHEN|IF|WHILE|WHERE|THEN)\b/g;

function goalCard(env: Env, g: Goal): string {
  const { plan, t } = env;
  const covering = allSteps(plan).filter((s) => s.goals.includes(g.id));
  const coverage = covering.length
    ? `${chip(t.goalSteps(covering.length), "ok")}${covering.map((s) => linkChip(s.id)).join("")}`
    : chip(t.goalNoSteps, "warn");
  const acceptance = g.acceptance.length
    ? `<ul class="nsx-list nsx-ears">${g.acceptance.map((a) => `<li>${escHtml(a).replace(EARS_RE, "<strong>$1</strong>")}</li>`).join("")}</ul>`
    : "";
  return `<article class="nsx-card" id="${escAttr(g.id)}"${field(`goals[${g.id}]`)}>
      <div class="nsx-meta">${chip(g.id, "info")}${coverage}</div>
      <p class="nsx-lead">${wrapText(env, g.text)}</p>
      ${acceptance}
    </article>`;
}

export function goalsSection(env: Env): Sec | null {
  const { plan, t } = env;
  if (plan.goals.length === 0 && plan.nonGoals.length === 0) return null;
  let inner = plan.goals.map((g) => goalCard(env, g)).join("");
  if (plan.nonGoals.length) {
    inner += `<div${field("nonGoals")}><h3 class="nsx-sub">${escHtml(t.nonGoals)}</h3>${list(plan.nonGoals.map((n) => wrapText(env, n)))}</div>`;
  }
  return section("goals", t.goalsTitle, inner);
}

// ---- 5. research ----

const CONFIDENCE_TONE: Record<string, Tone> = { high: "ok", medium: "warn", low: "bad" };

function kindsOf(env: Env, ids: string[]): string[] {
  const byId = new Map(env.plan.sources.map((s) => [s.id, s.kind as string]));
  return [...new Set(ids.map((id) => byId.get(id)).filter((k): k is string => !!k))];
}

function findingCard(env: Env, f: Finding): string {
  const { t } = env;
  const kinds = kindsOf(env, f.sources).join(" ");
  const inference = f.status === "inference";
  return `<article class="nsx-card nsx-finding${inference ? " nsx-dashed" : ""}" id="${escAttr(f.id)}" data-kinds="${escAttr(kinds)}"${field(`findings[${f.id}]`)}>
      <div class="nsx-meta">${chip(f.id, "info")}${chip(t.confidenceChip(t.confidence[f.confidence]), CONFIDENCE_TONE[f.confidence])}${chip(inference ? t.inference : t.verified, inference ? "warn" : "ok")}</div>
      <div class="nsx-html">${wrapHtml(env, f.text)}</div>
      ${f.sources.length ? `<div class="nsx-chips">${sourceChips(f.sources)}</div>` : ""}
    </article>`;
}

function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.hostname : null;
  } catch {
    return null;
  }
}

function sourceBody(env: Env, s: Source): string {
  const { t } = env;
  const quote = (text: string, code = false) =>
    code
      ? `<blockquote class="nsx-quote"><pre class="nsx-snippet"><code>${escHtml(text)}</code></pre></blockquote>`
      : `<blockquote class="nsx-quote">${escHtml(text)}</blockquote>`;
  switch (s.kind) {
    case "web": {
      const host = s.url ? hostOf(s.url) : null;
      const link = host
        ? `<a href="${escAttr(s.url!)}" target="_blank" rel="noopener noreferrer">${escHtml(host)}</a>`
        : `<span>${escHtml(s.url ?? "")}</span>`;
      const date = s.retrieved ? ` <span class="nsx-muted">${escHtml(t.retrieved)} ${escHtml(s.retrieved)}</span>` : "";
      return `<div class="nsx-srcline">${s.title ? `<strong>${escHtml(s.title)}</strong> ` : ""}${link}${date}</div>${s.quote ? quote(s.quote) : ""}`;
    }
    case "code":
    case "doc": {
      let ref = "";
      if (s.path) {
        const label = baseName(s.path);
        env.embed.add(s.path);
        env.labels.push(label);
        ref = `${refSpan(s.path, s.line, s.title || s.path, label)} <span class="nsx-muted nsx-mono">${escHtml(s.path)}${s.line != null ? `:${s.line}` : ""}</span>`;
      }
      return `<div class="nsx-srcline">${s.title ? `<strong>${escHtml(s.title)}</strong> ` : ""}${ref}</div>${s.quote ? quote(s.quote, s.kind === "code") : ""}`;
    }
    case "command": {
      const out = s.output ?? "";
      const lines = out ? out.replace(/\n+$/, "").split("\n").length : 0;
      const pre = out ? `<pre class="nsx-snippet"><code>${escHtml(out)}</code></pre>` : "";
      const outBlock = lines > OUTPUT_FOLD ? `<details><summary>${escHtml(t.showOutput(lines))}</summary>${pre}</details>` : pre;
      return `<div class="nsx-srcline">${s.title ? `<strong>${escHtml(s.title)}</strong> ` : ""}<code class="nsx-cmd">${escHtml(s.command ?? "")}</code></div>${outBlock}`;
    }
    case "history":
      return `<div class="nsx-srcline">${s.title ? `<strong>${escHtml(s.title)}</strong> ` : ""}${s.ref ? `<span class="nsx-muted">${escHtml(t.historyRef)}</span> <code class="nsx-cmd">${escHtml(s.ref)}</code>` : ""}</div>${s.quote ? quote(s.quote) : ""}`;
    default:
      return `${s.title ? `<div class="nsx-srcline"><strong>${escHtml(s.title)}</strong></div>` : ""}${s.quote ? quote(s.quote) : ""}`;
  }
}

function sourceItem(env: Env, s: Source): string {
  return `<li class="nsx-card nsx-source" id="src-${escAttr(s.id)}" data-kinds="${s.kind}"${field(`sources[${s.id}]`)}>
      <div class="nsx-meta">${chip(s.id, "info")}${chip(s.kind, "", "nsx-kind")}</div>
      ${sourceBody(env, s)}
    </li>`;
}

function tally(items: string[], order: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of order) {
    const n = items.filter((i) => i === k).length;
    if (n > 0) out[k] = n;
  }
  return out;
}

const countText = (counts: Record<string, number>, label: (k: string) => string) =>
  Object.entries(counts).map(([k, n]) => `${label(k)} ${n}`).join(", ");

export function researchSection(env: Env): Sec | null {
  const { plan, t } = env;
  if (plan.sources.length === 0 && plan.findings.length === 0) return null;
  const kinds = KIND_ORDER.filter((k) => plan.sources.some((s) => s.kind === k));
  const kindCounts = tally(plan.sources.map((s) => s.kind), kinds);
  const confCounts = tally(plan.findings.map((f) => f.confidence), ["high", "medium", "low"]);
  const summary = `<p class="nsx-muted">${escHtml(
    t.researchSummary(countText(kindCounts, (k) => k), countText(confCounts, (k) => t.confidence[k as keyof typeof t.confidence])),
  )}</p>`;
  const radio = (value: string, label: string, checked = false) =>
    `<label class="nsx-pill"><input type="radio" name="nsx-kind" class="nsx-kf" value="${escAttr(value)}"${checked ? " checked" : ""}> <span>${escHtml(label)}</span></label>`;
  const filter =
    kinds.length > 1
      ? `<fieldset class="nsx-filter"><legend class="nsx-sr">${escHtml(t.filterLabel)}</legend>${radio("all", t.filterAll, true)}${kinds.map((k) => radio(k, `${k} ${kindCounts[k]}`)).join("")}</fieldset>`
      : "";
  let inner = summary + filter;
  if (plan.findings.length) {
    inner += `<h3 class="nsx-sub">${escHtml(t.findingsTitle)}</h3><div class="nsx-stack">${plan.findings.map((f) => findingCard(env, f)).join("")}</div>`;
  }
  if (plan.sources.length) {
    inner += `<h3 class="nsx-sub">${escHtml(t.sourcesTitle)}</h3><ul class="nsx-stack nsx-sources">${plan.sources.map((s) => sourceItem(env, s)).join("")}</ul>`;
  }
  return section("research", t.researchTitle, inner);
}
