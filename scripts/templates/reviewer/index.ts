// Reviewer template: explains a code change. Feature tree, plain terms, three lenses, diagram, flows, tests.

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { GraphModel } from "../../src/types.ts";
import { escHtml, escJson, stripTags } from "../../core/html.ts";
import { inertTerms, wrapConcepts } from "../../core/concepts.ts";
import type { Concept } from "../../core/concepts.ts";
import { REF_RE, checkBareCode, refSpan } from "../../core/refs.ts";
import { validateGraph } from "../../core/graph.ts";
import type { RenderContext, Template, TemplateResult } from "../../core/template.ts";
import { L10N } from "./l10n.ts";
import type { Copy, PlanCopy, TestCopy } from "./l10n.ts";
import { normalizePlan } from "../planner/model.ts";
import type { Plan, Step } from "../planner/model.ts";

interface TestFailure { name?: string; message?: string }
interface TestRun {
  label?: string; cause?: string;
  passed?: number; total?: number; skipped?: number; failed?: TestFailure[];
}
interface TestCase { kind?: string; name?: string; line?: number; behavior?: string }
interface TestFile { path?: string; line?: number; desc?: string; tests?: TestCase[] }
interface TestResults extends TestRun {
  notRun?: string; command?: string; scope?: string; scopeNote?: string;
  environment?: string; earlier?: TestRun[]; files?: TestFile[];
}
interface FeatureHunk { path: string; line?: number; diff: string; explain: string }
interface FeatureChange { kind?: string; text?: string; old?: string; new?: string; hunks: FeatureHunk[] }
interface FeatureNode { label: string; children: FeatureNode[]; changes: FeatureChange[] }
interface LegacyGroup { group?: string; items?: unknown[] }

const FT_CLASS: Record<string, string> = { added: "ft-added", modified: "ft-modified", removed: "ft-removed" };
const FT_KINDS = new Set(["added", "modified", "removed"]);

function cleanHunk(raw: unknown, where: string, warnings: string[]): FeatureHunk | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    warnings.push(`featureTree: ${where} hunk is not an object`);
    return null;
  }
  const rec = raw as { path?: unknown; line?: unknown; diff?: unknown; explain?: unknown };
  const path = String(rec.path ?? "").trim();
  const diff = rec.diff == null ? "" : String(rec.diff).replace(/\n$/, "");
  if (!path || !diff) {
    warnings.push(`featureTree: ${where} hunk needs a path and a diff`);
    return null;
  }
  let line: number | undefined;
  if (rec.line != null && rec.line !== "") {
    const n = Number(rec.line);
    if (!Number.isInteger(n) || n < 1)
      warnings.push(`featureTree: ${where} hunk line "${rec.line}" is not a line number`);
    else line = n;
  }
  const explain = String(rec.explain ?? "").replace(/\s+/g, " ").trim();
  if (!explain)
    warnings.push(
      `featureTree: ${where} hunk has no plain explanation — say what this diff does in a sentence a reader understands`,
    );
  return { path, line, diff, explain };
}

function cleanHunks(raw: unknown, where: string, warnings: string[]): FeatureHunk[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    warnings.push(
      `featureTree: ${where} change has no source hunks — put the diff lines that implement it in hunks`,
    );
    return [];
  }
  const hunks = raw
    .map((hunk, i) => cleanHunk(hunk, `${where} hunks[${i}]`, warnings))
    .filter((hunk): hunk is FeatureHunk => hunk != null);
  if (!hunks.length)
    warnings.push(
      `featureTree: ${where} change has no source hunks — put the diff lines that implement it in hunks`,
    );
  return hunks;
}

function cleanChange(raw: unknown, where: string, warnings: string[]): FeatureChange | null {
  if (!raw || typeof raw !== "object") {
    warnings.push(`featureTree: ${where} change is not an object`);
    return null;
  }
  const rec = raw as { kind?: unknown; text?: unknown; old?: unknown; new?: unknown; hunks?: unknown };
  const text = rec.text != null ? String(rec.text) : undefined;
  const old = rec.old != null ? String(rec.old) : undefined;
  const neu = rec.new != null ? String(rec.new) : undefined;
  let kind = String(rec.kind ?? "").trim();
  if (!kind && (old != null || neu != null)) kind = "modified";
  if (!FT_KINDS.has(kind)) {
    warnings.push(`featureTree: ${where} change needs kind added, modified, or removed`);
    return null;
  }
  if (kind === "modified" && (old == null || neu == null)) {
    warnings.push(`featureTree: ${where} modified change needs old and new`);
    return null;
  }
  if (kind !== "modified" && text == null && old == null && neu == null) {
    warnings.push(`featureTree: ${where} change needs text`);
    return null;
  }
  return { kind, text, old, new: neu, hunks: cleanHunks(rec.hunks, where, warnings) };
}

function normalizeNode(raw: unknown, warnings: string[], path: string): FeatureNode | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    warnings.push(`featureTree: ${path} is not a {label, children, changes} node`);
    return null;
  }
  const rec = raw as FeatureNode & LegacyGroup & { items?: unknown };
  const label = String(rec.label ?? "").trim();
  if (!label) {
    warnings.push(`featureTree: ${path} is missing a label`);
    return null;
  }
  const children = (Array.isArray(rec.children) ? rec.children : [])
    .map((child, i) => normalizeNode(child, warnings, `${path}.children[${i}]`))
    .filter((child): child is FeatureNode => child != null);
  const changes = (Array.isArray(rec.changes) ? rec.changes : [])
    .map((change, i) => cleanChange(change, `${path} "${label}"`, warnings))
    .filter((change): change is FeatureChange => change != null);
  return { label, children, changes };
}

function legacyNode(group: LegacyGroup, t: Copy, warnings: string[]): FeatureNode | null {
  const kind = String(group.group ?? "").trim();
  const label = t.groups[kind] ?? kind;
  if (!label) return null;
  const children = (group.items ?? []).map((item, i): FeatureNode | null => {
    const path = `featureTree ${label}[${i}]`;
    if (typeof item === "string") {
      const change = cleanChange({ kind, text: item }, path, warnings);
      return { label: item, children: [], changes: change ? [change] : [] };
    }
    if (item && typeof item === "object") {
      const rec = item as FeatureChange;
      if (rec.old != null || rec.new != null) {
        const change = cleanChange({ kind: "modified", old: rec.old, new: rec.new }, path, warnings);
        const face = String(rec.new ?? rec.old ?? "").trim();
        return { label: face || label, children: [], changes: change ? [change] : [] };
      }
    }
    warnings.push(`featureTree: ${path} is not a feature string or {old, new}`);
    return null;
  }).filter((node): node is FeatureNode => node != null && node.label.trim() !== "");
  return { label, children, changes: [] };
}

function isLegacyTree(raw: unknown[]): boolean {
  return raw.length > 0 && raw.every((node) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return false;
    const rec = node as LegacyGroup & { label?: unknown; children?: unknown };
    return "group" in rec && "items" in rec && rec.label == null && rec.children == null;
  });
}

function normalizeTree(raw: unknown, t: Copy, warnings: string[]): { nodes: FeatureNode[]; legacy: boolean } {
  if (raw == null) return { nodes: [], legacy: false };
  if (!Array.isArray(raw)) {
    warnings.push("featureTree: expected a list of nested features");
    return { nodes: [], legacy: false };
  }
  if (isLegacyTree(raw)) {
    const nodes = raw
      .map((group) => legacyNode(group as LegacyGroup, t, warnings))
      .filter((node): node is FeatureNode => node != null && node.children.length > 0);
    return { nodes, legacy: true };
  }
  const nodes = raw
    .map((node, i) => normalizeNode(node, warnings, `featureTree[${i}]`))
    .filter((node): node is FeatureNode => node != null);
  return { nodes, legacy: false };
}

interface ShownHunk extends FeatureHunk { where: string }

function sourceHunks(node: FeatureNode, prefix: string): ShownHunk[] {
  const own = node.changes.flatMap((change) =>
    change.hunks.map((hunk) => ({ ...hunk, where: prefix })));
  const nested = node.children.flatMap((child) =>
    sourceHunks(child, prefix ? `${prefix} / ${child.label}` : child.label));
  return [...own, ...nested];
}

// The row already shows this node's own description. The popover lists the
// source hunks that implement it and the features under it.
function relativeHunks(node: FeatureNode): ShownHunk[] {
  const own = node.changes.flatMap((change) =>
    change.hunks.map((hunk) => ({ ...hunk, where: "" })));
  const nested = node.children.flatMap((child) => sourceHunks(child, child.label));
  return [...own, ...nested];
}

function nestedKinds(node: FeatureNode): string[] {
  return node.children.flatMap((child) => [
    ...child.changes.map((change) => change.kind ?? ""),
    ...nestedKinds(child),
  ]);
}

function renderTree(raw: unknown, t: Copy, concepts: Concept[], warnings: string[]): string {
  const { nodes, legacy } = normalizeTree(raw, t, warnings);
  if (!nodes.length) return "";
  if (legacy)
    warnings.push(
      "featureTree: grouped by added/modified/removed — nest by what the user sees, and split each feature down to the smallest behavior",
    );
  else if (nodes.length > 1 && nodes.every((node) => node.children.length === 0))
    warnings.push(
      "featureTree: flat list — nest features under what the user sees and split each one down to the smallest behavior",
    );
  const bare: string[] = [];
  const findBare = (list: FeatureNode[]) => {
    for (const node of list) {
      if (!node.children.length && !node.changes.length) bare.push(node.label);
      else findBare(node.children);
    }
  };
  findBare(nodes);
  for (const label of bare)
    warnings.push(
      `featureTree: "${label}" has no changes — put the added, modified, or removed behavior on the smallest node`,
    );

  const textOf = (value: string) => wrapConcepts(escHtml(value), concepts);
  let seq = 0;
  const hunkBody = (change: FeatureChange) => {
    if (change.old != null || change.new != null) {
      const old = change.old != null ? `<del class="ft-old">${textOf(change.old)}</del>` : "";
      const sep = old && change.new != null ? `<span class="ft-sep"> → </span>` : "";
      const neu = change.new != null ? `<span class="ft-new">${textOf(change.new)}</span>` : "";
      return `${old}${sep}${neu}`;
    }
    const text = textOf(change.text ?? "");
    if (change.kind === "removed") return `<del>${text}</del>`;
    if (change.kind === "added") return `<span class="ft-new">${text}</span>`;
    return text;
  };
  const diffHtml = (diff: string) =>
    diff.replaceAll("\r\n", "\n").split("\n").map((line) => {
      const cls = line.startsWith("+") && !line.startsWith("+++")
        ? "ft-add"
        : line.startsWith("-") && !line.startsWith("---")
          ? "ft-del"
          : "ft-ctx";
      return `<span class="${cls}">${escHtml(line)}</span>`;
    }).join("\n");
  const hunkHtml = (hunk: ShownHunk) => {
    const where = hunk.where ? `<p class="ft-where">${textOf(hunk.where)}</p>` : "";
    const explain = hunk.explain ? `<p class="ft-explain">${textOf(hunk.explain)}</p>` : "";
    const at = hunk.line != null ? `${hunk.path}:${hunk.line}` : hunk.path;
    return `<li class="ft-hunk">${where}${explain}<p class="ft-path">${escHtml(at)}</p><pre class="ft-diff">${diffHtml(hunk.diff)}</pre></li>`;
  };
  const renderNode = (node: FeatureNode): string => {
    const hunks = relativeHunks(node);
    const kids = node.children.length
      ? `<ul>${node.children.map(renderNode).join("")}</ul>`
      : "";
    const toneSource = node.changes.length
      ? node.changes.map((change) => change.kind ?? "")
      : nestedKinds(node);
    const kinds = new Set(toneSource.filter(Boolean));
    const tone = kinds.size === 1 ? (FT_CLASS[[...kinds][0] ?? ""] ?? "") : "";
    const desc = node.changes.map(hunkBody).join(" ");
    const face = desc ? `${textOf(node.label)} ${desc}` : textOf(node.label);
    if (!hunks.length)
      return `<li class="ft-item"><div class="ft-row"><span class="${["ft-label", tone].filter(Boolean).join(" ")}">${inertTerms(face)}</span></div>${kids}</li>`;
    const n = ++seq;
    return `<li class="ft-item"><div class="ft-row">` +
      `<button type="button" class="${["ft-trigger", tone].filter(Boolean).join(" ")}" id="ftb-${n}" popovertarget="ftc-${n}" aria-expanded="false" aria-controls="ftc-${n}">${inertTerms(face)}</button>` +
      `<div id="ftc-${n}" class="ft-changes" popover aria-labelledby="ftb-${n}"><ul>${hunks.map(hunkHtml).join("")}</ul></div>` +
      `</div>${kids}</li>`;
  };
  return `<div class="ftree-scroll"><ul class="ftree">${nodes.map(renderNode).join("")}</ul></div>`;
}

// Tokens that mean "code", not "what the user sees" — features-only fields
// (featureTree, plainTerms) must describe behavior, never name identifiers.
const IDENT_LIKE = [
  { re: /[\w-]+\.(ts|tsx|js|jsx|mjs|cjs|go|rs|py|java|kt|kts|swift|rb|php|cs|cpp|c|h|vue|svelte|proto|sql|css|scss|less|ya?ml|toml|sh|md)\b/, why: "file name" },
  { re: /\b[\w-]+\/[\w-]+\/[\w/-]+/, why: "path" },
  { re: /\b\w+\(\)/, why: "call" },
  { re: /\b[a-z]{2,}[A-Z][A-Za-z]*[a-z]\b/, why: "camelCase identifier" },
  { re: /\b[a-z]+_[a-z0-9_]+\b/, why: "snake_case identifier" },
  { re: /\b[a-z]+(-[a-z0-9]+){2,}\b/, why: "kebab-case identifier" },
];

function checkFeaturesOnly(field: string, texts: unknown[], warnings: string[]) {
  for (const text of texts.filter(Boolean)) {
    for (const { re, why } of IDENT_LIKE) {
      const m = String(text).match(re);
      if (m)
        warnings.push(
          `${field}: "${m[0]}" looks like a ${why} — features-only prose names no identifiers/paths`,
        );
    }
  }
}

function treeTexts(nodes: unknown): unknown[] {
  const out: unknown[] = [];
  const walk = (value: unknown) => {
    if (typeof value === "string") { out.push(value); return; }
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(walk); return; }
    const rec = value as Record<string, unknown>;
    for (const key of ["label", "text", "old", "new", "explain"]) if (key in rec) out.push(rec[key]);
    if (Array.isArray(rec.items)) rec.items.forEach(walk);
    if (Array.isArray(rec.children)) rec.children.forEach(walk);
    if (Array.isArray(rec.changes)) rec.changes.forEach(walk);
    if (Array.isArray(rec.hunks)) rec.hunks.forEach(walk);
  };
  walk(nodes);
  return out;
}

const TR_SCOPES = new Set(["full", "package", "related"]);
const TR_KINDS = new Set(["added", "modified"]);
const isCount = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;

function testFiles(tr: TestResults | undefined): TestFile[] {
  return Array.isArray(tr?.files) ? tr.files : [];
}

function checkTestRun(run: TestRun, where: string, warnings: string[]) {
  const failed = Array.isArray(run.failed) ? run.failed : [];
  if (!isCount(run.passed) || !isCount(run.total)) {
    warnings.push(`${where}: needs integer passed and total counts`);
    return;
  }
  if (run.skipped != null && !isCount(run.skipped))
    warnings.push(`${where}: skipped "${run.skipped}" is not a count`);
  if (run.passed > run.total)
    warnings.push(`${where}: passed (${run.passed}) is more than total (${run.total})`);
  if (failed.length && run.passed + (run.skipped ?? 0) >= run.total)
    warnings.push(`${where}: lists ${failed.length} failed test(s) but the counts say every test passed`);
  for (const f of failed)
    if (!String(f?.name ?? "").trim() || !String(f?.message ?? "").trim())
      warnings.push(`${where}: every failed test needs a name and its failure message`);
}

function checkTestResults(tr: TestResults | undefined, warnings: string[]) {
  if (tr == null) return;
  if (typeof tr !== "object" || Array.isArray(tr)) {
    warnings.push("testResults: expected an object");
    return;
  }
  if (tr.notRun != null) {
    if (!String(tr.notRun).trim()) warnings.push("testResults: notRun needs a reason");
  } else {
    if (!String(tr.command ?? "").trim())
      warnings.push("testResults: missing command — show the exact command that ran");
    if (!TR_SCOPES.has(String(tr.scope)))
      warnings.push(`testResults: scope must be full, package, or related (got "${tr.scope ?? ""}")`);
    if (!String(tr.scopeNote ?? "").trim())
      warnings.push("testResults: missing scopeNote — say in plain words what the run covered");
    checkTestRun(tr, "testResults", warnings);
    (Array.isArray(tr.earlier) ? tr.earlier : []).forEach((run, i) =>
      checkTestRun(run, `testResults.earlier[${i}]`, warnings));
  }
  for (const [i, file] of testFiles(tr).entries()) {
    const at = `testResults.files[${i}] "${file?.path ?? "?"}"`;
    if (!String(file?.path ?? "").trim()) warnings.push(`${at}: missing path`);
    if (file?.line != null && !(Number.isInteger(file.line) && file.line >= 1))
      warnings.push(`${at}: line "${file.line}" is not a line number`);
    if (!Array.isArray(file?.tests) || !file.tests.length)
      warnings.push(`${at}: lists no tests`);
    for (const test of file?.tests ?? []) {
      const name = String(test?.name ?? "").trim();
      if (!name) warnings.push(`${at}: a test has no name`);
      if (!TR_KINDS.has(String(test?.kind)))
        warnings.push(`${at}: test "${name}" needs kind added or modified`);
      if (!String(test?.behavior ?? "").trim())
        warnings.push(`${at}: test "${name}" has no behavior — say what it checks in a sentence, not a restatement of the name`);
      if (test?.line != null && !(Number.isInteger(test.line) && test.line >= 1))
        warnings.push(`${at}: test "${name}" line "${test.line}" is not a line number`);
    }
  }
}

function renderTestResults(tr: TestResults | undefined, t: TestCopy): string {
  if (tr == null || typeof tr !== "object" || Array.isArray(tr)) return "";
  const chip = (tone: string, text: string) => `<span class="tr-chip tr-${tone}">${escHtml(text)}</span>`;
  const failList = (failed: TestFailure[] | undefined) => {
    const items = (Array.isArray(failed) ? failed : []).map((f) =>
      `<li><span class="tr-name">${escHtml(f?.name ?? "")}</span> <span class="tr-msg">${escHtml(f?.message ?? "")}</span></li>`);
    return items.length ? `<ul class="tr-list">${items.join("")}</ul>` : "";
  };
  const counts = (run: TestRun) => {
    const passed = Number(run.passed), total = Number(run.total);
    const failed = Array.isArray(run.failed) ? run.failed.length : 0;
    const skipped = Number(run.skipped ?? 0);
    const bad = failed > 0 || passed + skipped < total;
    return chip(bad ? "fail" : "pass", `${passed}/${total} ${t.passed}`) +
      (skipped > 0 ? chip("warn", `${skipped} ${t.skipped}`) : "");
  };

  const parts: string[] = [];
  if (tr.notRun != null) {
    parts.push(`<p>${chip("info", t.notRun)} ${escHtml(tr.notRun)}</p>`);
  } else {
    const scope = String(tr.scope);
    parts.push(`<p>${counts(tr)}</p>`);
    parts.push(
      `<p><span class="tr-sub">${t.scope}:</span> ${chip(scope === "full" ? "pass" : "info", t.scopes[scope] ?? scope)} ${escHtml(tr.scopeNote ?? "")}</p>`,
    );
    const env = tr.environment ? ` <span class="opacity-70">(${escHtml(tr.environment)})</span>` : "";
    parts.push(`<p><span class="tr-sub">${t.command}:</span> <code class="tr-cmd">${escHtml(tr.command ?? "")}</code>${env}</p>`);
    const failures = failList(tr.failed);
    parts.push(failures ? `<p class="tr-sub">${t.failedHead}</p>${failures}` : `<p>${t.failedNone}</p>`);
    for (const run of Array.isArray(tr.earlier) ? tr.earlier : []) {
      parts.push(
        `<p><span class="tr-sub">${t.earlier}:</span> ${counts(run)} ${escHtml(run.label ?? "")}</p>` +
        (run.cause ? `<p><span class="tr-sub">${t.cause}:</span> ${escHtml(run.cause)}</p>` : "") +
        failList(run.failed),
      );
    }
  }

  const files = testFiles(tr).filter((f) => f?.path && Array.isArray(f.tests) && f.tests.length);
  if (files.length) {
    parts.push(`<p class="tr-sub">${t.changesHead}</p>`);
    for (const file of files) {
      const path = String(file.path);
      parts.push(`<p class="tr-file">${refSpan(path, file.line, file.desc || t.specDesc, path)}</p>`);
      const items = (file.tests ?? []).map((test) => {
        const kind = TR_KINDS.has(String(test.kind)) ? String(test.kind) : "modified";
        const name = test.line != null
          ? refSpan(path, test.line, test.behavior ?? "", test.name ?? "")
          : escHtml(test.name ?? "");
        return `<li><span class="ftree-badge ft-${kind}">${t.kinds[kind]}</span> <span class="tr-name">${name}</span> ${escHtml(test.behavior ?? "")}</li>`;
      });
      parts.push(`<ul class="tr-list">${items.join("")}</ul>`);
    }
  }
  return `<section class="rounded-box bg-base-100 p-6 shadow-sm space-y-2" data-nsx-field="testResults"><h2 class="text-xl font-semibold mb-3">${t.title}</h2>${parts.join("")}</section>`;
}

interface Manifest {
  title?: string;
  oneLiner?: string;
  featureTree?: unknown[];
  plainTerms?: string;
  lenses?: { creational?: string; structural?: string; behavioral?: string };
  pseudocode?: { title?: string; code?: string }[];
  graph?: GraphModel;
  testResults?: TestResults;
  /** Repo-relative path to a planner manifest this change implements. */
  plan?: string;
  files?: string[];
}


// Normalize indentation: tabs → 2 spaces, strip the common leading indent.
function dedent(code: string): string {
  const lines = String(code).replace(/\t/g, "  ").split("\n");
  const indents = lines
    .filter((l) => l.trim())
    .map((l) => l.match(/^ */)?.[0].length ?? 0);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(min)).join("\n").trim();
}

async function readable(path: string): Promise<boolean> {
  try {
    await readFile(resolve(path), "utf8");
    return true;
  } catch {
    return false;
  }
}

// Paths of hunks anywhere in the raw feature tree (new and legacy shapes).
function hunkPaths(raw: unknown, into: Set<string>) {
  if (Array.isArray(raw)) {
    for (const item of raw) hunkPaths(item, into);
  } else if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.hunks))
      for (const h of o.hunks) {
        const p = (h as { path?: unknown } | null)?.path;
        if (typeof p === "string" && p) into.add(p);
      }
    for (const v of Object.values(o)) if (v && typeof v === "object") hunkPaths(v, into);
  }
}

// The plan this change implements: which of its steps touch a file of the change.
// Returns the section HTML, or null (with a warning) when the plan cannot be used.
async function renderPlan(
  planPath: unknown, changed: Set<string>, t: PlanCopy, warnings: string[],
): Promise<string | null> {
  if (typeof planPath !== "string" || !planPath.trim()) {
    warnings.push("plan: must be a repo-relative path to a planner manifest");
    return null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(resolve(planPath), "utf8"));
  } catch (e) {
    warnings.push(e instanceof SyntaxError
      ? `plan: cannot be used — ${planPath} is not valid JSON`
      : `plan: cannot read ${planPath}`);
    return null;
  }
  const planWarnings: string[] = [];
  const errors: string[] = [];
  const plan: Plan = normalizePlan(raw, planWarnings, errors);
  if (errors.length) {
    warnings.push(`plan: cannot be used — ${errors[0]}`);
    return null;
  }
  for (const w of planWarnings) warnings.push(`plan: ${w}`);

  const steps = plan.phases.flatMap((p) => p.steps);
  const hit = steps.filter((s) =>
    s.files.some((f) => changed.has(f.split(":")[0].replace(/\\/g, "/").replace(/^\.\//, ""))));
  const status = t.status[plan.status] ?? plan.status;
  const rows = hit.map((s) => {
    const state = t.states[s.state] ?? s.state;
    const check = s.state === "done" ? ` <span class="badge badge-success badge-sm" data-plan-done>✓ ${escHtml(state)}</span>` : "";
    return `<li data-plan-step="${escHtml(s.id)}"><span class="font-mono text-sm">${escHtml(s.id)}</span> ${escHtml(s.title)} — ${escHtml(state)}${check}</li>`;
  });
  const html =
    `<section class="rounded-box bg-base-100 p-6 shadow-sm space-y-3" data-nsx-field="plan"><h2 class="text-xl font-semibold mb-3">${t.title}</h2>` +
    `<p>${refSpan(planPath, undefined, t.fileDesc, plan.title)} <span class="badge badge-outline badge-sm">${escHtml(status)}</span></p>` +
    (rows.length ? `<ul class="list-disc pl-5 space-y-1">${rows.join("")}</ul>` : "") +
    `<p class="text-sm opacity-70">${escHtml(t.touched(hit.length, steps.length))}</p></section>`;
  return html;
}

async function render(ctx: RenderContext): Promise<TemplateResult> {
  const manifest = ctx.manifest as Manifest;
  const { lang, concepts, warnings } = ctx;
  const t = L10N[lang];
  const graphModel = manifest.graph as GraphModel;

  warnings.push(...validateGraph(manifest.graph));

  // Every file a reference points at: .ref spans in fragments, graph node and edge paths, spec files.
  const fragments = [
    manifest.oneLiner, manifest.plainTerms,
    manifest.lenses?.creational, manifest.lenses?.structural,
    manifest.lenses?.behavioral,
  ].filter(Boolean);
  const paths = new Set<string>();
  for (const frag of fragments) {
    for (const m of String(frag).matchAll(/data-path=["']([^"']+)["']/g))
      paths.add(m[1]);
  }
  for (const n of graphModel.nodes || []) if (n.path) paths.add(n.path);
  for (const e of graphModel.edges || []) if (e.path) paths.add(e.path);
  for (const f of testFiles(manifest.testResults))
    if (f?.path) paths.add(String(f.path));

  for (const f of testFiles(manifest.testResults))
    if (f?.path && !(await readable(String(f.path))))
      warnings.push(`testResults: spec "${f.path}" cannot be read from the current directory — run render from the repo root`);
  checkTestResults(manifest.testResults, warnings);
  // Plan-independent change paths: every file the change names, in any field.
  const changed = new Set<string>();
  hunkPaths(manifest.featureTree, changed);
  for (const p of paths) changed.add(p);
  if (Array.isArray(manifest.files)) for (const f of manifest.files) changed.add(String(f));
  for (const p of [...changed]) changed.add(p.replace(/\\/g, "/").replace(/^\.\//, ""));
  const planSection = manifest.plan === undefined ? null : await renderPlan(manifest.plan, changed, t.plan, warnings);
  if (planSection) paths.add(manifest.plan as string);

  const graph = { lang, ...graphModel };
  const pseudocode = (manifest.pseudocode || [])
    .map(
      (f, i) =>
        `<figure class="space-y-1" data-nsx-field="pseudocode[${i}]"><figcaption class="font-medium">${escHtml(f.title ?? "")}</figcaption>` +
        `<pre class="mockup-code pcode bg-base-300 text-base-content p-4 rounded-box overflow-x-auto text-sm"><code class="language-nspseudo">${escHtml(dedent(f.code ?? ""))}</code></pre></figure>`,
    )
    .join("\n");
  const flowsSection = pseudocode
    ? `<section class="rounded-box bg-base-100 p-6 shadow-sm space-y-4"><h2 class="text-xl font-semibold mb-3">${t.flows}</h2>${pseudocode}</section>`
    : "";

  const oneLiner = wrapConcepts(manifest.oneLiner ?? "", concepts);
  const featureTree = renderTree(manifest.featureTree, t, concepts, warnings);
  const plain = wrapConcepts(manifest.plainTerms || "", concepts);
  const creational = wrapConcepts(manifest.lenses?.creational || "", concepts);
  const structural = wrapConcepts(manifest.lenses?.structural || "", concepts);
  const behavioral = wrapConcepts(manifest.lenses?.behavioral || "", concepts);
  const testsSection = renderTestResults(manifest.testResults, t.tests);

  const block = (field: string, heading: string, inner: string) =>
    `<section class="rounded-box bg-base-100 p-6 shadow-sm" data-nsx-field="${field}">\n    <h2 class="text-xl font-semibold mb-3">${heading}</h2>\n    ${inner}\n  </section>`;
  const sections = [
    block("featureTree", t.features, featureTree),
    block("plainTerms", t.plain, plain),
    block("lenses.creational", "Creational", creational),
    block("lenses.structural", "Structural", structural),
    block("lenses.behavioral", "Behavioral", behavioral),
    block("graph", t.diagram, `<div class="lens-diagram"><script class="graph-model" type="application/json">${escJson(graph)}</script></div>`),
    flowsSection,
    ...(planSection ? [planSection] : []),
    testsSection,
  ].join("\n  ");

  checkFeaturesOnly("featureTree", treeTexts(manifest.featureTree), warnings);
  checkFeaturesOnly("plainTerms", [stripTags(manifest.plainTerms || "")], warnings);
  if (/class="ref"/.test(manifest.plainTerms || ""))
    warnings.push(
      `plainTerms: .ref spans are technical naming — plain terms stay features-only; move refs to the lenses`,
    );
  if (fragments.some((frag) => /class\s*=\s*["'][^"']*\bterm\b/.test(String(frag))))
    warnings.push(
      `hand-written .term span — list the word in concepts and let render wrap it`,
    );

  const labels: string[] = [];
  for (const frag of fragments) {
    for (const m of String(frag).matchAll(REF_RE))
      labels.push(m[2].replace(/<[^>]+>/g, "").trim());
  }
  for (const n of graphModel.nodes || []) if (n.label) labels.push(n.label);
  for (const e of graphModel.edges || [])
    labels.push(e.decides ? `${e.label ?? ""} — ${e.decides}` : (e.label ?? ""));

  return {
    oneLiner,
    sections,
    embed: [...paths],
    ui: { plain: t.plain },
    prose: [oneLiner, featureTree, plain, creational, structural, behavioral],
    labels,
    refFragments: fragments,
    afterWrite: () =>
      checkBareCode(
        [
          ["oneLiner", manifest.oneLiner],
          ["lenses.creational", manifest.lenses?.creational],
          ["lenses.structural", manifest.lenses?.structural],
          ["lenses.behavioral", manifest.lenses?.behavioral],
        ],
        warnings,
      ),
  };
}

export const reviewer: Template = {
  id: "reviewer",
  required: ["title", "oneLiner", "graph"],
  summary: {
    vi: "Giải thích một change: cây tính năng, ba góc nhìn, sơ đồ, luồng chạy, kết quả test.",
    en: "Explain a code change: feature tree, three lenses, diagram, flows, test results.",
  },
  playbook: join(dirname(fileURLToPath(import.meta.url)), "playbook.md"),
  render,
};
