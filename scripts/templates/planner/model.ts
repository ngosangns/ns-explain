// Pure planner model: manifest types, normalization with warnings/errors, PERT schedule, weighted
// decision totals, sensitivity, risk score, and the `tasks` lines. No I/O.
// Errors (hard failures) make `render` exit 2. Warnings never stop a render.

export type Lang = "vi" | "en";
export type Confidence = "high" | "medium" | "low";
export type FindingStatus = "verified" | "inference";
export type PlanStatus = "draft" | "approved" | "in-progress" | "done";
export type SourceKind = "web" | "code" | "command" | "doc" | "user" | "history";
export type Owner = "agent" | "user";
export type StepState = "todo" | "doing" | "done" | "blocked";
export type Tone = "good" | "bad" | "neutral";
export type ClarificationBy = "user" | "assumed";

export interface Clarification { q: string; a: string; by: ClarificationBy }
export interface PlanRequest {
  original: string;
  summary: string;
  constraints: string[];
  clarifications: Clarification[];
}
export interface Fact { text: string; sources: string[] }
export interface Starting { summary: string; facts: Fact[] }
export interface Goal { id: string; text: string; acceptance: string[] }
export interface Source {
  id: string;
  kind: SourceKind;
  title: string;
  url?: string;
  retrieved?: string;
  path?: string;
  line?: number;
  command?: string;
  output?: string;
  quote?: string;
  ref?: string;
}
export interface Finding {
  id: string;
  text: string;
  sources: string[];
  confidence: Confidence;
  status: FindingStatus;
}
export interface PlanOption {
  id: string;
  title: string;
  summary: string;
  pros: string[];
  cons: string[];
  rejectedBecause?: string;
}
export interface Criterion { id: string; label: string; weight: number }
export interface Consequence { text: string; tone: Tone }
export interface Decision {
  chosen: string;
  because: string;
  drivers: string[];
  consequences: Consequence[];
}
export interface Estimate { o: number; m: number; p: number }
export interface Step {
  id: string;
  title: string;
  detail: string;
  files: string[];
  dependsOn: string[];
  estimate: Estimate | null;
  unit: string;
  verify: string;
  owner: Owner;
  state: StepState;
  goals: string[];
}
export interface Phase { id: string; title: string; goal: string; steps: Step[] }
export interface Risk {
  id: string;
  text: string;
  likelihood: number;
  impact: number;
  mitigation: string;
  steps: string[];
}
export interface Question {
  id: string;
  text: string;
  blocking: boolean;
  default?: string;
  answer?: string;
  options: string[];
}
export interface Assumption { id: string; text: string; checkBy: string }
/** Raw chart object (validated later by `validateChart`); `id` is always set, `source` is a known source id or absent. */
export type PlanChart = { id: string; [key: string]: unknown };

export interface Plan {
  title: string;
  oneLiner: string;
  status: PlanStatus;
  request: PlanRequest;
  starting: Starting;
  goals: Goal[];
  nonGoals: string[];
  sources: Source[];
  findings: Finding[];
  options: PlanOption[];
  criteria: Criterion[];
  /** option id -> criterion id -> score (1-5) */
  scores: Record<string, Record<string, number>>;
  decision: Decision | null;
  phases: Phase[];
  risks: Risk[];
  rabbitHoles: string[];
  questions: Question[];
  assumptions: Assumption[];
  charts: PlanChart[];
  /** Unit of the estimates: the unit of the first estimated step, "h" if none. */
  unit: string;
}

const CONFIDENCES: readonly Confidence[] = ["high", "medium", "low"];
const FINDING_STATUSES: readonly FindingStatus[] = ["verified", "inference"];
const PLAN_STATUSES: readonly PlanStatus[] = ["draft", "approved", "in-progress", "done"];
const SOURCE_KINDS: readonly SourceKind[] = ["web", "code", "command", "doc", "user", "history"];
const OWNERS: readonly Owner[] = ["agent", "user"];
const STATES: readonly StepState[] = ["todo", "doing", "done", "blocked"];
const TONES: readonly Tone[] = ["good", "bad", "neutral"];
const CLARIFICATION_BY: readonly ClarificationBy[] = ["user", "assumed"];
const DEFAULT_UNIT = "h";
const EPS = 1e-9;

type Rec = Record<string, unknown>;
type Sink = (path: string, message: string) => void;

function isRec(v: unknown): v is Rec {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function finite(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function oneOf<T extends string>(v: unknown, set: readonly T[], def: T, path: string, warn: Sink): T {
  if (v === undefined) return def;
  if (typeof v === "string" && (set as readonly string[]).includes(v)) return v as T;
  warn(path, `"${String(v)}" is not one of ${set.join(" | ")}; using "${def}"`);
  return def;
}

function strList(v: unknown, path: string, warn: Sink): string[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) {
    warn(path, "expected a list of strings; ignored");
    return [];
  }
  const out: string[] = [];
  v.forEach((x, i) => {
    if (typeof x === "string" && x.trim()) out.push(x);
    else warn(`${path}[${i}]`, "expected a non-empty string; dropped");
  });
  return out;
}

/** Parse a list of `{id, ...}` objects. Items without an id, non-objects, and parse failures are dropped. */
function collect<T extends { id: string }>(
  value: unknown,
  field: string,
  warn: Sink,
  error: Sink,
  parse: (rec: Rec, path: string, id: string) => T | null,
  seen: Set<string> = new Set(),
): T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    warn(field, "expected a list; ignored");
    return [];
  }
  const out: T[] = [];
  value.forEach((raw, i) => {
    if (!isRec(raw)) {
      warn(`${field}[${i}]`, "not an object; dropped");
      return;
    }
    const id = str(raw.id).trim();
    if (!id) {
      warn(`${field}[${i}]`, "missing id; dropped");
      return;
    }
    const path = `${field}[${id}]`;
    if (seen.has(id)) {
      error(path, "duplicate id");
      return;
    }
    seen.add(id);
    const item = parse(raw, path, id);
    if (item) out.push(item);
  });
  return out;
}

/** Keep only ids in `known`; warn for the rest. */
function resolveIds(ids: string[], known: Set<string>, kind: string, path: string, warn: Sink): string[] {
  const out: string[] = [];
  for (const id of ids) {
    if (!known.has(id)) warn(path, `unknown ${kind} id "${id}"; dropped`);
    else if (!out.includes(id)) out.push(id);
  }
  return out;
}

function rating(v: unknown, path: string, warn: Sink): number {
  const n = finite(v);
  if (n === undefined) {
    warn(path, "needs a whole number from 1 to 5; using 3");
    return 3;
  }
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    const fixed = Math.min(5, Math.max(1, Math.round(n)));
    warn(path, `${n} is not a whole number from 1 to 5; using ${fixed}`);
    return fixed;
  }
  return n;
}

function parseEstimate(v: unknown, path: string, warn: Sink): Estimate | null {
  if (v === undefined) return null;
  const rec = isRec(v) ? v : null;
  const o = rec ? finite(rec.o) : undefined;
  const m = rec ? finite(rec.m) : undefined;
  const p = rec ? finite(rec.p) : undefined;
  if (o === undefined || m === undefined || p === undefined) {
    warn(path, "estimate needs numbers o, m, p; ignored");
    return null;
  }
  if (o <= 0 || m <= 0 || p <= 0) warn(path, `estimate o=${o}, m=${m}, p=${p} must be positive`);
  if (!(o <= m && m <= p)) warn(path, `estimate o=${o}, m=${m}, p=${p} must satisfy o <= m <= p`);
  return { o, m, p };
}

/** Find dependency cycles; each cycle is a list of ids that starts and ends with the same id. */
function findCycles(steps: Step[]): string[][] {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const color = new Map<string, 1 | 2>(); // 1 = on the DFS stack, 2 = done
  const stack: string[] = [];
  const cycles: string[][] = [];
  const visit = (id: string): void => {
    color.set(id, 1);
    stack.push(id);
    for (const dep of byId.get(id)?.dependsOn ?? []) {
      const c = color.get(dep);
      if (c === 1) cycles.push([...stack.slice(stack.indexOf(dep)), dep]);
      else if (c === undefined) visit(dep);
    }
    stack.pop();
    color.set(id, 2);
  };
  for (const s of steps) if (!color.has(s.id)) visit(s.id);
  return cycles;
}

export function normalizePlan(raw: unknown, warnings: string[], errors: string[]): Plan {
  const warn: Sink = (path, message) => void warnings.push(`${path}: ${message}`);
  const error: Sink = (path, message) => void errors.push(`${path}: ${message}`);
  const r: Rec = isRec(raw) ? raw : {};
  if (!isRec(raw)) errors.push("manifest: expected a JSON object");

  // ---- request ----
  const request: PlanRequest = { original: "", summary: "", constraints: [], clarifications: [] };
  if (!isRec(r.request)) {
    error("request", "required (an object with the original user request)");
  } else {
    request.original = str(r.request.original);
    request.summary = str(r.request.summary);
    request.constraints = strList(r.request.constraints, "request.constraints", warn);
    if (r.request.clarifications !== undefined && !Array.isArray(r.request.clarifications)) {
      warn("request.clarifications", "expected a list; ignored");
    } else {
      (r.request.clarifications as unknown[] | undefined)?.forEach((c, i) => {
        const path = `request.clarifications[${i}]`;
        if (!isRec(c) || !str(c.q) || !str(c.a)) {
          warn(path, "needs q and a; dropped");
          return;
        }
        request.clarifications.push({
          q: c.q as string,
          a: c.a as string,
          by: oneOf(c.by, CLARIFICATION_BY, "assumed", `${path}.by`, warn),
        });
      });
    }
  }

  // ---- sources ----
  const sources = collect<Source>(r.sources, "sources", warn, error, (rec, path, id) => {
    const kind = str(rec.kind);
    if (!(SOURCE_KINDS as readonly string[]).includes(kind)) {
      warn(path, `kind "${kind}" is not one of ${SOURCE_KINDS.join(" | ")}; dropped`);
      return null;
    }
    const s: Source = { id, kind: kind as SourceKind, title: str(rec.title) };
    for (const key of ["url", "retrieved", "path", "command", "output", "quote", "ref"] as const) {
      const v = str(rec[key]);
      if (v) s[key] = v;
    }
    if (rec.line !== undefined) {
      const line = finite(rec.line);
      if (line !== undefined && Number.isInteger(line) && line > 0) s.line = line;
      else warn(`${path}.line`, "expected a positive whole number; ignored");
    }
    if (s.kind === "web" && !s.url) error(path, "web source needs a url");
    if ((s.kind === "code" || s.kind === "doc") && !s.path) warn(path, `${s.kind} source needs a path`);
    if (s.kind === "command" && !s.command) warn(path, "command source needs a command");
    return s;
  });
  const sourceIds = new Set(sources.map((s) => s.id));
  const cited = new Set<string>();

  // ---- starting ----
  const starting: Starting = { summary: "", facts: [] };
  if (r.starting !== undefined) {
    if (!isRec(r.starting)) {
      warn("starting", "expected an object; ignored");
    } else {
      starting.summary = str(r.starting.summary);
      const facts = r.starting.facts;
      if (facts !== undefined && !Array.isArray(facts)) warn("starting.facts", "expected a list; ignored");
      else {
        (facts as unknown[] | undefined)?.forEach((f, i) => {
          const path = `starting.facts[${i}]`;
          if (!isRec(f) || !str(f.text)) {
            warn(path, "needs text; dropped");
            return;
          }
          const ids = resolveIds(strList(f.sources, `${path}.sources`, warn), sourceIds, "source", `${path}.sources`, warn);
          ids.forEach((id) => cited.add(id));
          starting.facts.push({ text: f.text as string, sources: ids });
        });
      }
    }
  }

  // ---- goals ----
  const goals = collect<Goal>(r.goals, "goals", warn, error, (rec, path, id) => {
    const text = str(rec.text);
    if (!text) {
      warn(path, "missing text; dropped");
      return null;
    }
    const acceptance = strList(rec.acceptance, `${path}.acceptance`, warn);
    if (acceptance.length === 0) warn(path, "no acceptance criteria");
    return { id, text, acceptance };
  });
  const goalIds = new Set(goals.map((g) => g.id));
  const nonGoals = strList(r.nonGoals, "nonGoals", warn);

  // ---- findings ----
  const findings = collect<Finding>(r.findings, "findings", warn, error, (rec, path, id) => {
    const text = str(rec.text);
    if (!text) {
      warn(path, "missing text; dropped");
      return null;
    }
    const raw = strList(rec.sources, `${path}.sources`, warn);
    if (raw.length === 0) warn(path, "no sources");
    const ids = resolveIds(raw, sourceIds, "source", `${path}.sources`, warn);
    ids.forEach((s) => cited.add(s));
    return {
      id,
      text,
      sources: ids,
      confidence: oneOf(rec.confidence, CONFIDENCES, "medium", `${path}.confidence`, warn),
      status: oneOf(rec.status, FINDING_STATUSES, "inference", `${path}.status`, warn),
    };
  });
  const findingIds = new Set(findings.map((f) => f.id));

  // ---- options, criteria, scores ----
  const options = collect<PlanOption>(r.options, "options", warn, error, (rec, path, id) => {
    const title = str(rec.title);
    if (!title) {
      warn(path, "missing title; dropped");
      return null;
    }
    const o: PlanOption = {
      id,
      title,
      summary: str(rec.summary),
      pros: strList(rec.pros, `${path}.pros`, warn),
      cons: strList(rec.cons, `${path}.cons`, warn),
    };
    const why = str(rec.rejectedBecause).trim();
    if (why) o.rejectedBecause = why;
    return o;
  });
  const optionIds = new Set(options.map((o) => o.id));

  const criteria = collect<Criterion>(r.criteria, "criteria", warn, error, (rec, path, id) => {
    const label = str(rec.label);
    if (!label) {
      warn(path, "missing label; dropped");
      return null;
    }
    let weight = finite(rec.weight);
    if (weight === undefined) {
      warn(path, "needs a numeric weight; using 1");
      weight = 1;
    } else if (weight <= 0) {
      warn(path, `weight ${weight} must be greater than 0; using 1`);
      weight = 1;
    }
    return { id, label, weight };
  });
  const criterionIds = new Set(criteria.map((c) => c.id));

  const scores: Record<string, Record<string, number>> = {};
  const badScore = new Set<string>();
  if (r.scores !== undefined) {
    if (!isRec(r.scores)) warn("scores", "expected an object of option id -> criterion id -> score; ignored");
    else {
      for (const [oid, row] of Object.entries(r.scores)) {
        if (!optionIds.has(oid)) {
          warn(`scores[${oid}]`, "unknown option id; dropped");
          continue;
        }
        if (!isRec(row)) {
          warn(`scores[${oid}]`, "expected an object of criterion id -> score; dropped");
          continue;
        }
        const out: Record<string, number> = {};
        for (const [cid, v] of Object.entries(row)) {
          const path = `scores[${oid}][${cid}]`;
          if (!criterionIds.has(cid)) {
            warn(path, "unknown criterion id; dropped");
            continue;
          }
          const n = finite(v);
          if (n === undefined) {
            warn(path, "not a number; ignored");
            badScore.add(`${oid}\0${cid}`);
            continue;
          }
          if (n < 1 || n > 5) {
            const fixed = Math.min(5, Math.max(1, n));
            warn(path, `score ${n} is outside 1-5; using ${fixed}`);
            out[cid] = fixed;
          } else out[cid] = n;
        }
        scores[oid] = out;
      }
    }
  }
  if (options.length > 0 && criteria.length > 0) {
    for (const o of options) {
      for (const c of criteria) {
        if (scores[o.id]?.[c.id] === undefined && !badScore.has(`${o.id}\0${c.id}`)) {
          warn(`scores[${o.id}][${c.id}]`, "missing score");
        }
      }
    }
  }

  // ---- decision ----
  let decision: Decision | null = null;
  if (r.decision !== undefined) {
    if (!isRec(r.decision)) {
      warn("decision", "expected an object; ignored");
    } else {
      const d = r.decision;
      const chosen = str(d.chosen).trim();
      if (!chosen) warn("decision.chosen", "missing; name the chosen option id");
      else if (!optionIds.has(chosen)) error("decision.chosen", `"${chosen}" is not an option id`);
      const rawDrivers = strList(d.drivers, "decision.drivers", warn);
      if (rawDrivers.length === 0) warn("decision.drivers", "empty; name the findings behind the choice");
      const drivers = resolveIds(rawDrivers, findingIds, "finding", "decision.drivers", warn);
      const consequences: Consequence[] = [];
      if (d.consequences !== undefined && !Array.isArray(d.consequences)) {
        warn("decision.consequences", "expected a list; ignored");
      } else {
        (d.consequences as unknown[] | undefined)?.forEach((c, i) => {
          const path = `decision.consequences[${i}]`;
          if (!isRec(c) || !str(c.text)) {
            warn(path, "needs text; dropped");
            return;
          }
          consequences.push({ text: c.text as string, tone: oneOf(c.tone, TONES, "neutral", `${path}.tone`, warn) });
        });
      }
      decision = { chosen, because: str(d.because), drivers, consequences };
      if (optionIds.has(chosen)) {
        for (const o of options) {
          if (o.id !== chosen && !o.rejectedBecause) warn(`options[${o.id}]`, "rejected option needs rejectedBecause");
        }
      }
    }
  }

  // ---- phases and steps ----
  const rawPhases = r.phases;
  if (!Array.isArray(rawPhases)) error("phases", "required (a list of phases with steps)");
  const stepSeen = new Set<string>();
  const phases = collect<Phase>(
    Array.isArray(rawPhases) ? rawPhases : undefined,
    "phases",
    warn,
    error,
    (rec, path, id) => {
      const title = str(rec.title);
      if (!title) {
        warn(path, "missing title; dropped");
        return null;
      }
      const steps = collect<Step>(
        rec.steps,
        `${path}.steps`,
        warn,
        error,
        (s, spath, sid) => {
          const stitle = str(s.title);
          if (!stitle) {
            warn(spath, "missing title; dropped");
            return null;
          }
          const estimate = parseEstimate(s.estimate, `${spath}.estimate`, warn);
          const verify = str(s.verify).trim();
          if (!verify) warn(spath, "missing verify (how to check the step is done)");
          return {
            id: sid,
            title: stitle,
            detail: str(s.detail),
            files: strList(s.files, `${spath}.files`, warn),
            dependsOn: strList(s.dependsOn, `${spath}.dependsOn`, warn),
            estimate,
            unit: str(s.unit).trim() || DEFAULT_UNIT,
            verify,
            owner: oneOf(s.owner, OWNERS, "agent", `${spath}.owner`, warn),
            state: oneOf(s.state, STATES, "todo", `${spath}.state`, warn),
            goals: strList(s.goals, `${spath}.goals`, warn),
          };
        },
        stepSeen,
      );
      return { id, title, goal: str(rec.goal), steps };
    },
  );

  // Resolve step references now that every step id is known.
  const steps = phases.flatMap((p) => p.steps.map((s) => ({ s, path: `phases[${p.id}].steps[${s.id}]` })));
  const stepIds = new Set(steps.map((x) => x.s.id));
  for (const { s, path } of steps) {
    const deps: string[] = [];
    for (const d of s.dependsOn) {
      if (!stepIds.has(d)) error(`${path}.dependsOn`, `unknown step "${d}"`);
      else if (!deps.includes(d)) deps.push(d);
    }
    s.dependsOn = deps;
    s.goals = resolveIds(s.goals, goalIds, "goal", `${path}.goals`, warn);
  }
  for (const cycle of findCycles(steps.map((x) => x.s))) error("phases", `dependency cycle ${cycle.join(" -> ")}`);

  const estimated = steps.filter((x) => x.s.estimate);
  const units = [...new Set(estimated.map((x) => x.s.unit))];
  if (units.length > 1) warn("phases", `estimates use mixed units (${units.join(", ")}); use one unit`);
  const unit = estimated[0]?.s.unit ?? DEFAULT_UNIT;

  if (steps.length > 0) {
    const covered = new Set(steps.flatMap((x) => x.s.goals));
    for (const g of goals) if (!covered.has(g.id)) warn(`goals[${g.id}]`, "no step covers this goal");
  }

  // ---- risks ----
  const risks = collect<Risk>(r.risks, "risks", warn, error, (rec, path, id) => {
    const text = str(rec.text);
    if (!text) {
      warn(path, "missing text; dropped");
      return null;
    }
    return {
      id,
      text,
      likelihood: rating(rec.likelihood, `${path}.likelihood`, warn),
      impact: rating(rec.impact, `${path}.impact`, warn),
      mitigation: str(rec.mitigation),
      steps: resolveIds(strList(rec.steps, `${path}.steps`, warn), stepIds, "step", `${path}.steps`, warn),
    };
  });

  // ---- questions, assumptions ----
  const questions = collect<Question>(r.questions, "questions", warn, error, (rec, path, id) => {
    const text = str(rec.text);
    if (!text) {
      warn(path, "missing text; dropped");
      return null;
    }
    if (rec.blocking !== undefined && typeof rec.blocking !== "boolean") warn(`${path}.blocking`, "expected true or false; using false");
    const q: Question = { id, text, blocking: rec.blocking === true, options: strList(rec.options, `${path}.options`, warn) };
    const def = str(rec.default).trim();
    const answer = str(rec.answer).trim();
    if (def) q.default = def;
    if (answer) q.answer = answer;
    if (q.blocking && !def) warn(path, "blocking question needs a default");
    return q;
  });
  const assumptions = collect<Assumption>(r.assumptions, "assumptions", warn, error, (rec, path, id) => {
    const text = str(rec.text);
    if (!text) {
      warn(path, "missing text; dropped");
      return null;
    }
    return { id, text, checkBy: str(rec.checkBy) };
  });

  // ---- charts (kept raw; `validateChart` checks the shape at render) ----
  let chartN = 0;
  const chartIds = new Set<string>();
  const charts: PlanChart[] = [];
  if (r.charts !== undefined && !Array.isArray(r.charts)) warn("charts", "expected a list; ignored");
  else {
    (r.charts as unknown[] | undefined)?.forEach((c, i) => {
      chartN++;
      if (!isRec(c)) {
        warn(`charts[${i}]`, "not an object; dropped");
        return;
      }
      const id = str(c.id).trim() || `CH${chartN}`;
      const path = `charts[${id}]`;
      if (chartIds.has(id)) {
        error(path, "duplicate id");
        return;
      }
      chartIds.add(id);
      const chart: PlanChart = { ...c, id };
      if (chart.source !== undefined) {
        const src = str(chart.source);
        if (sourceIds.has(src)) cited.add(src);
        else {
          warn(`${path}.source`, `unknown source id "${String(chart.source)}"; dropped`);
          delete chart.source;
        }
      }
      charts.push(chart);
    });
  }

  for (const s of sources) if (!cited.has(s.id)) warn(`sources[${s.id}]`, "never cited by a finding, fact, or chart");

  // ---- plan status against questions and steps ----
  const status = oneOf(r.status, PLAN_STATUSES, "draft", "status", warn);
  if (status !== "draft") {
    for (const q of questions) {
      if (q.blocking && !q.answer) warn("status", `"${status}" while blocking question ${q.id} has no answer`);
    }
  }
  if (status === "done") {
    const open = steps.filter((x) => x.s.state !== "done").map((x) => x.s.id);
    if (open.length > 0) warn("status", `"done" but steps are not done: ${open.join(", ")}`);
  }

  return {
    title: str(r.title),
    oneLiner: str(r.oneLiner),
    status,
    request,
    starting,
    goals,
    nonGoals,
    sources,
    findings,
    options,
    criteria,
    scores,
    decision,
    phases,
    risks,
    rabbitHoles: strList(r.rabbitHoles, "rabbitHoles", warn),
    questions,
    assumptions,
    charts,
    unit,
  };
}

/** Every step in phase order, then step order. */
export function allSteps(plan: Plan): Step[] {
  return plan.phases.flatMap((p) => p.steps);
}

export function pertMean(e: { o: number; m: number; p: number }): number {
  return (e.o + 4 * e.m + e.p) / 6;
}

export interface Schedule {
  order: string[];
  start: Record<string, number>;
  end: Record<string, number>;
  critical: Set<string>;
  total: number;
  /** Steps without an estimate. They count as 0. */
  unestimated: string[];
}

/**
 * Earliest-start schedule on the dependency graph with PERT means.
 * Order is a stable topological order: the lowest (phase, step) position among ready steps goes first.
 * Critical steps have zero slack. If every duration is 0, no step is critical.
 * A cyclic plan does not hang: steps of a cycle are placed in declaration order and ignore the back edge.
 */
export function scheduleSteps(plan: Plan): Schedule {
  const steps = allSteps(plan);
  const pos = new Map(steps.map((s, i) => [s.id, i]));
  const dur = new Map(steps.map((s) => [s.id, s.estimate ? pertMean(s.estimate) : 0]));
  const unestimated = steps.filter((s) => !s.estimate).map((s) => s.id);

  const order: string[] = [];
  const placed = new Set<string>();
  const start: Record<string, number> = {};
  const end: Record<string, number> = {};
  while (order.length < steps.length) {
    const open = steps.filter((s) => !placed.has(s.id));
    const next = open.find((s) => s.dependsOn.every((d) => placed.has(d) || !pos.has(d))) ?? open[0];
    let from = 0;
    for (const d of next.dependsOn) if (placed.has(d)) from = Math.max(from, end[d]);
    start[next.id] = from;
    end[next.id] = from + (dur.get(next.id) ?? 0);
    placed.add(next.id);
    order.push(next.id);
  }

  const total = order.reduce((t, id) => Math.max(t, end[id]), 0);

  // Backward pass: latest start that keeps the total unchanged.
  const rank = new Map(order.map((id, i) => [id, i]));
  const successors = new Map<string, string[]>(order.map((id) => [id, []]));
  for (const s of steps) {
    for (const d of s.dependsOn) if (rank.has(d) && rank.get(d)! < rank.get(s.id)!) successors.get(d)!.push(s.id);
  }
  const latestStart = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const finish = Math.min(total, ...successors.get(id)!.map((n) => latestStart.get(n)!));
    latestStart.set(id, finish - (dur.get(id) ?? 0));
  }
  const critical = new Set<string>();
  if (total > EPS) {
    for (const id of order) if (Math.abs(latestStart.get(id)! - start[id]) < EPS) critical.add(id);
  }
  return { order, start, end, critical, total, unestimated };
}

function totalsFor(plan: Plan, weight: (c: Criterion) => number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const o of plan.options) {
    out[o.id] = plan.criteria.reduce((sum, c) => sum + weight(c) * (plan.scores[o.id]?.[c.id] ?? 0), 0);
  }
  return out;
}

/** Option id -> sum of weight * score. A missing score counts as 0. */
export function weightedTotals(plan: Plan): Record<string, number> {
  return totalsFor(plan, (c) => c.weight);
}

/** First option with the highest total (option order breaks ties). */
function leader(plan: Plan, totals: Record<string, number>): string | null {
  let best: string | null = null;
  for (const o of plan.options) if (best === null || totals[o.id] > totals[best] + EPS) best = o.id;
  return best;
}

/**
 * For each criterion: the smallest change of that one weight that makes another option win.
 * Searches weights 0, 0.5, 1, ... up to 3x the largest weight. The new winner must beat the old winner
 * strictly (a tie does not count). On equal distance, the lower weight wins.
 * Criteria that never flip the winner are omitted.
 */
export function decisionSensitivity(plan: Plan): { criterion: string; flipsTo: string; atWeight: number }[] {
  if (plan.options.length < 2 || plan.criteria.length === 0) return [];
  const winner = leader(plan, weightedTotals(plan));
  if (winner === null) return [];
  const maxWeight = Math.max(...plan.criteria.map((c) => c.weight));
  const steps = Math.floor((3 * maxWeight) / 0.5);
  const out: { criterion: string; flipsTo: string; atWeight: number }[] = [];
  for (const c of plan.criteria) {
    let best: { flipsTo: string; atWeight: number } | null = null;
    for (let k = 0; k <= steps; k++) {
      const w = k * 0.5;
      if (Math.abs(w - c.weight) < EPS) continue;
      const totals = totalsFor(plan, (x) => (x.id === c.id ? w : x.weight));
      const top = leader(plan, totals);
      if (top === null || top === winner || totals[top] <= totals[winner] + EPS) continue;
      if (best === null || Math.abs(w - c.weight) < Math.abs(best.atWeight - c.weight) - EPS) best = { flipsTo: top, atWeight: w };
    }
    if (best) out.push({ criterion: c.id, ...best });
  }
  return out;
}

export function riskScore(r: Risk): number {
  return r.likelihood * r.impact;
}

const TASK_WORDS: Record<Lang, { after: string; verify: string }> = {
  vi: { after: "sau", verify: "kiểm tra" },
  en: { after: "after", verify: "verify" },
};

/** One line per step in schedule order: `[ ] T1.1 Title (P1, sau: T0.1; kiểm tra: …)`. */
export function taskLines(plan: Plan, lang: Lang): string[] {
  const words = TASK_WORDS[lang] ?? TASK_WORDS.vi;
  const byId = new Map<string, { step: Step; phase: string }>();
  for (const p of plan.phases) for (const s of p.steps) byId.set(s.id, { step: s, phase: p.id });
  const flat = (t: string): string => t.replace(/\s+/g, " ").trim();
  return scheduleSteps(plan).order.map((id) => {
    const { step, phase } = byId.get(id)!;
    let meta = phase;
    if (step.dependsOn.length > 0) meta += `, ${words.after}: ${step.dependsOn.join(", ")}`;
    if (step.verify) meta += `; ${words.verify}: ${flat(step.verify)}`;
    return `[${step.state === "done" ? "x" : " "}] ${step.id} ${flat(step.title)} (${meta})`;
  });
}
