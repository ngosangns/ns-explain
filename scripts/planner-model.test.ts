// Tests for the planner model: what normalizePlan reports, the PERT schedule, decision totals and
// sensitivity, and the `tasks` lines. Pure functions, so no CLI is needed. Run with `bun test`.
import { describe, expect, test } from "bun:test";
import {
  decisionSensitivity,
  normalizePlan,
  pertMean,
  riskScore,
  scheduleSteps,
  taskLines,
  weightedTotals,
} from "./templates/planner/model.ts";
import type { Plan } from "./templates/planner/model.ts";

type Raw = Record<string, any>;

/** A plan that normalizes with no warnings and no errors. Tests mutate a clone. */
function base(): Raw {
  return {
    title: "Add search",
    oneLiner: "Add full-text search to the docs site.",
    status: "draft",
    request: { original: "Add search", summary: "Add search", constraints: ["no new service"] },
    starting: { summary: "No search today.", facts: [{ text: "Docs are static.", sources: ["S2"] }] },
    goals: [{ id: "G1", text: "Users find pages", acceptance: ["WHEN a user types a word THE SYSTEM SHALL list pages"] }],
    sources: [
      { id: "S1", kind: "web", title: "Lunr docs", url: "https://lunrjs.com" },
      { id: "S2", kind: "code", title: "Build script", path: "build.ts", line: 3 },
    ],
    findings: [{ id: "F1", text: "Lunr runs in the browser.", sources: ["S1"], confidence: "high", status: "verified" }],
    options: [
      { id: "O1", title: "Lunr", summary: "Client index" },
      { id: "O2", title: "Algolia", summary: "Hosted", rejectedBecause: "Needs a new service" },
    ],
    criteria: [
      { id: "C1", label: "Cost", weight: 2 },
      { id: "C2", label: "Quality", weight: 1 },
    ],
    scores: { O1: { C1: 5, C2: 1 }, O2: { C1: 2, C2: 5 } },
    decision: { chosen: "O1", because: "No new service", drivers: ["F1"], consequences: [{ text: "Index grows", tone: "bad" }] },
    phases: [
      {
        id: "P1",
        title: "Build",
        steps: [
          { id: "T1.1", title: "Index pages", dependsOn: [], estimate: { o: 1, m: 2, p: 3 }, verify: "bun test", goals: ["G1"] },
          { id: "T1.2", title: "Add UI", dependsOn: ["T1.1"], estimate: { o: 1, m: 2, p: 3 }, verify: "open the page", goals: ["G1"] },
        ],
      },
    ],
    risks: [{ id: "R1", text: "Index too big", likelihood: 2, impact: 3, mitigation: "Split", steps: ["T1.1"] }],
    questions: [{ id: "Q1", text: "Which pages?", blocking: true, default: "All" }],
  };
}

function run(mutate?: (m: Raw) => void): { plan: Plan; warnings: string[]; errors: string[] } {
  const m = base();
  mutate?.(m);
  const warnings: string[] = [];
  const errors: string[] = [];
  const plan = normalizePlan(m, warnings, errors);
  return { plan, warnings, errors };
}

const has = (list: string[], ...parts: string[]): boolean => list.some((l) => parts.every((p) => l.includes(p)));

describe("normalizePlan: clean input", () => {
  test("a complete plan gives no warnings and no errors", () => {
    const { plan, warnings, errors } = run();
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(plan.phases[0].steps).toHaveLength(2);
    expect(plan.unit).toBe("h");
  });

  test("defaults: owner agent, state todo, confidence medium, status inference", () => {
    const { plan } = run((m) => {
      m.findings[0].confidence = undefined;
      m.findings[0].status = undefined;
    });
    expect(plan.phases[0].steps[0].owner).toBe("agent");
    expect(plan.phases[0].steps[0].state).toBe("todo");
    expect(plan.findings[0].confidence).toBe("medium");
    expect(plan.findings[0].status).toBe("inference");
  });
});

describe("normalizePlan: hard errors", () => {
  test("duplicate step id", () => {
    const { errors } = run((m) => m.phases[0].steps.push({ id: "T1.1", title: "Again", verify: "x" }));
    expect(has(errors, "T1.1", "duplicate")).toBe(true);
  });

  test("duplicate id within another kind (findings)", () => {
    const { errors } = run((m) => m.findings.push({ ...m.findings[0] }));
    expect(has(errors, "findings[F1]", "duplicate")).toBe(true);
  });

  test("dependsOn an unknown step", () => {
    const { errors } = run((m) => (m.phases[0].steps[1].dependsOn = ["T9.9"]));
    expect(has(errors, "phases[P1].steps[T1.2]", "T9.9")).toBe(true);
  });

  test("dependency cycle names the path", () => {
    const { errors } = run((m) => (m.phases[0].steps[0].dependsOn = ["T1.2"]));
    expect(errors.some((e) => e.includes("T1.1 -> T1.2 -> T1.1"))).toBe(true);
  });

  test("a self-dependency is a cycle", () => {
    const { errors } = run((m) => (m.phases[0].steps[0].dependsOn = ["T1.1"]));
    expect(errors.some((e) => e.includes("T1.1 -> T1.1"))).toBe(true);
  });

  test("decision.chosen is not an option id", () => {
    const { errors } = run((m) => (m.decision.chosen = "O7"));
    expect(has(errors, "decision.chosen", "O7")).toBe(true);
  });

  test("web source without a url", () => {
    const { errors } = run((m) => delete m.sources[0].url);
    expect(has(errors, "sources[S1]", "url")).toBe(true);
  });

  test("missing request", () => {
    const { errors } = run((m) => delete m.request);
    expect(has(errors, "request")).toBe(true);
  });

  test("missing phases", () => {
    const { errors } = run((m) => delete m.phases);
    expect(has(errors, "phases")).toBe(true);
  });

  test("a non-object manifest is an error, not a crash", () => {
    const errors: string[] = [];
    normalizePlan("nope", [], errors);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("normalizePlan: warnings", () => {
  test("finding without sources", () => {
    const { warnings } = run((m) => (m.findings[0].sources = []));
    expect(has(warnings, "findings[F1]", "no sources")).toBe(true);
  });

  test("finding with an unknown source id drops it and warns with the path", () => {
    const { plan, warnings } = run((m) => (m.findings[0].sources = ["S1", "S9"]));
    expect(has(warnings, "findings[F1].sources", "S9")).toBe(true);
    expect(plan.findings[0].sources).toEqual(["S1"]);
  });

  test("a source that nothing cites", () => {
    const { warnings } = run((m) => m.sources.push({ id: "S3", kind: "user", quote: "hi" }));
    expect(has(warnings, "sources[S3]", "never cited")).toBe(true);
  });

  test("a chart source counts as a citation; an unknown chart source is dropped", () => {
    const ok = run((m) => {
      m.sources.push({ id: "S3", kind: "command", title: "t", command: "bun test" });
      m.charts = [{ kind: "bar", x: ["a"], series: [], source: "S3" }];
    });
    expect(ok.warnings).toEqual([]);
    expect(ok.plan.charts[0].id).toBe("CH1");
    const bad = run((m) => (m.charts = [{ id: "CH1", source: "S8" }]));
    expect(has(bad.warnings, "charts[CH1].source", "S8")).toBe(true);
    expect(bad.plan.charts[0].source).toBeUndefined();
  });

  test("step without verify", () => {
    const { warnings } = run((m) => delete m.phases[0].steps[0].verify);
    expect(has(warnings, "phases[P1].steps[T1.1]", "verify")).toBe(true);
  });

  test("estimate out of order or not positive", () => {
    const order = run((m) => (m.phases[0].steps[0].estimate = { o: 3, m: 2, p: 1 }));
    expect(has(order.warnings, "steps[T1.1].estimate", "o <= m <= p")).toBe(true);
    const neg = run((m) => (m.phases[0].steps[0].estimate = { o: 0, m: 1, p: 2 }));
    expect(has(neg.warnings, "steps[T1.1].estimate", "positive")).toBe(true);
  });

  test("mixed units", () => {
    const { warnings } = run((m) => (m.phases[0].steps[1].unit = "d"));
    expect(has(warnings, "mixed units")).toBe(true);
  });

  test("rejected option without rejectedBecause (every option except the chosen)", () => {
    const { warnings } = run((m) => delete m.options[1].rejectedBecause);
    expect(has(warnings, "options[O2]", "rejectedBecause")).toBe(true);
    expect(has(warnings, "options[O1]")).toBe(false);
  });

  test("decision.drivers empty or unknown", () => {
    const empty = run((m) => (m.decision.drivers = []));
    expect(has(empty.warnings, "decision.drivers", "empty")).toBe(true);
    const unknown = run((m) => (m.decision.drivers = ["F1", "F4"]));
    expect(has(unknown.warnings, "decision.drivers", "F4")).toBe(true);
  });

  test("score outside 1-5 is clamped; a missing score is reported", () => {
    const { plan, warnings } = run((m) => {
      m.scores.O1.C1 = 9;
      delete m.scores.O2.C2;
    });
    expect(has(warnings, "scores[O1][C1]", "outside 1-5")).toBe(true);
    expect(plan.scores.O1.C1).toBe(5);
    expect(has(warnings, "scores[O2][C2]", "missing")).toBe(true);
  });

  test("weight <= 0", () => {
    const { plan, warnings } = run((m) => (m.criteria[0].weight = 0));
    expect(has(warnings, "criteria[C1]", "weight")).toBe(true);
    expect(plan.criteria[0].weight).toBeGreaterThan(0);
  });

  test("risk likelihood and impact must be whole numbers 1-5", () => {
    const { warnings } = run((m) => {
      m.risks[0].likelihood = 6;
      m.risks[0].impact = 2.5;
    });
    expect(has(warnings, "risks[R1].likelihood")).toBe(true);
    expect(has(warnings, "risks[R1].impact")).toBe(true);
  });

  test("risk.steps with an unknown step", () => {
    const { plan, warnings } = run((m) => (m.risks[0].steps = ["T1.1", "T8.8"]));
    expect(has(warnings, "risks[R1].steps", "T8.8")).toBe(true);
    expect(plan.risks[0].steps).toEqual(["T1.1"]);
  });

  test("goal without acceptance", () => {
    const { warnings } = run((m) => (m.goals[0].acceptance = []));
    expect(has(warnings, "goals[G1]", "acceptance")).toBe(true);
  });

  test("step.goals with an unknown goal id", () => {
    const { warnings } = run((m) => (m.phases[0].steps[0].goals = ["G1", "G5"]));
    expect(has(warnings, "steps[T1.1].goals", "G5")).toBe(true);
  });

  test("goal that no step covers", () => {
    const { warnings } = run((m) => m.goals.push({ id: "G2", text: "Fast", acceptance: ["x"] }));
    expect(has(warnings, "goals[G2]", "no step")).toBe(true);
  });

  test("approved while a blocking question has no answer", () => {
    const { warnings } = run((m) => (m.status = "approved"));
    expect(has(warnings, "status", "Q1")).toBe(true);
    const answered = run((m) => {
      m.status = "approved";
      m.questions[0].answer = "All pages";
    });
    expect(has(answered.warnings, "status")).toBe(false);
  });

  test("a draft with an open blocking question is fine", () => {
    expect(has(run().warnings, "status")).toBe(false);
  });

  test("blocking question without default", () => {
    const { warnings } = run((m) => delete m.questions[0].default);
    expect(has(warnings, "questions[Q1]", "default")).toBe(true);
  });

  test("status done with steps not done", () => {
    const { warnings } = run((m) => {
      m.status = "done";
      m.questions[0].answer = "x";
      m.phases[0].steps[0].state = "done";
    });
    expect(has(warnings, "status", "T1.2")).toBe(true);
    expect(has(warnings, "status", "T1.1,")).toBe(false);
  });

  test("values outside their sets fall back to defaults and warn", () => {
    const { plan, warnings } = run((m) => {
      m.findings[0].confidence = "certain";
      m.findings[0].status = "guess";
      m.status = "finished";
      m.phases[0].steps[0].owner = "robot";
      m.phases[0].steps[0].state = "stuck";
      m.decision.consequences[0].tone = "awful";
      m.sources[1].kind = "web";
    });
    expect(plan.findings[0].confidence).toBe("medium");
    expect(plan.findings[0].status).toBe("inference");
    expect(plan.status).toBe("draft");
    expect(plan.phases[0].steps[0].owner).toBe("agent");
    expect(plan.phases[0].steps[0].state).toBe("todo");
    expect(plan.decision?.consequences[0].tone).toBe("neutral");
    for (const p of ["confidence", "findings[F1].status", "status:", "owner", "state", "tone"]) {
      expect(warnings.some((w) => w.includes(p))).toBe(true);
    }
  });

  test("unknown or invalid items are dropped with a path", () => {
    const { plan, warnings } = run((m) => {
      m.phases[0].steps.push({ id: "T1.3", verify: "x" }, "oops");
      m.sources.push({ id: "S3", kind: "telepathy" });
    });
    expect(plan.phases[0].steps.map((s) => s.id)).toEqual(["T1.1", "T1.2"]);
    expect(has(warnings, "phases[P1].steps[T1.3]", "title")).toBe(true);
    expect(has(warnings, "phases[P1].steps[3]", "not an object")).toBe(true);
    expect(plan.sources.map((s) => s.id)).toEqual(["S1", "S2"]);
    expect(has(warnings, "sources[S3]", "telepathy")).toBe(true);
  });
});

/** Diamond: A(2) -> B(3), C(1) -> D(2). Critical path A, B, D = 7. */
function diamond(): Plan {
  const fixed = (n: number) => ({ o: n, m: n, p: n });
  const { plan, errors } = run((m) => {
    m.phases = [
      {
        id: "P1",
        title: "One",
        steps: [
          { id: "A", title: "A", estimate: fixed(2), verify: "v" },
          { id: "C", title: "C", dependsOn: ["A"], estimate: fixed(1), verify: "v" },
          { id: "B", title: "B", dependsOn: ["A"], estimate: fixed(3), verify: "v" },
        ],
      },
      { id: "P2", title: "Two", steps: [{ id: "D", title: "D", dependsOn: ["B", "C"], estimate: fixed(2), verify: "v" }] },
    ];
    m.risks = [];
  });
  expect(errors).toEqual([]);
  return plan;
}

describe("pertMean and scheduleSteps", () => {
  test("pert mean is (o + 4m + p) / 6", () => {
    expect(pertMean({ o: 1, m: 2, p: 9 })).toBe(3);
  });

  test("diamond DAG: start, end, critical, total", () => {
    const s = scheduleSteps(diamond());
    expect(s.start).toEqual({ A: 0, C: 2, B: 2, D: 5 });
    expect(s.end).toEqual({ A: 2, C: 3, B: 5, D: 7 });
    expect(s.total).toBe(7);
    expect([...s.critical].sort()).toEqual(["A", "B", "D"]);
    expect(s.unestimated).toEqual([]);
  });

  test("order is topological and stable: phase order, then step order", () => {
    expect(scheduleSteps(diamond()).order).toEqual(["A", "C", "B", "D"]);
  });

  test("a step listed before its dependency still runs after it", () => {
    const { plan } = run((m) => {
      m.phases[0].steps = [
        { id: "X", title: "X", dependsOn: ["Y"], estimate: { o: 1, m: 1, p: 1 }, verify: "v" },
        { id: "Y", title: "Y", estimate: { o: 2, m: 2, p: 2 }, verify: "v" },
      ];
    });
    const s = scheduleSteps(plan);
    expect(s.order).toEqual(["Y", "X"]);
    expect(s.start.X).toBe(2);
    expect(s.total).toBe(3);
  });

  test("steps without an estimate count as 0 and are reported", () => {
    const { plan } = run((m) => {
      m.phases[0].steps[1].estimate = undefined;
    });
    const s = scheduleSteps(plan);
    expect(s.unestimated).toEqual(["T1.2"]);
    expect(s.end["T1.2"]).toBe(s.start["T1.2"]);
    expect(s.total).toBe(2);
  });

  test("a plan with no estimates has total 0 and no critical steps", () => {
    const { plan } = run((m) => m.phases[0].steps.forEach((s: Raw) => delete s.estimate));
    const s = scheduleSteps(plan);
    expect(s.total).toBe(0);
    expect(s.critical.size).toBe(0);
  });

  test("a cyclic plan still returns every step (no hang)", () => {
    const { plan } = run((m) => (m.phases[0].steps[0].dependsOn = ["T1.2"]));
    expect(scheduleSteps(plan).order.sort()).toEqual(["T1.1", "T1.2"]);
  });
});

describe("weightedTotals, decisionSensitivity, riskScore", () => {
  test("totals are the sum of weight * score", () => {
    // O1: 2*5 + 1*1 = 11; O2: 2*2 + 1*5 = 9
    expect(weightedTotals(run().plan)).toEqual({ O1: 11, O2: 9 });
  });

  test("sensitivity: smallest single-weight change that flips the winner", () => {
    // C1 weight 2: O1 = 5w + 1, O2 = 2w + 5. O2 wins when w < 4/3, so w = 1 is the nearest step.
    // C2 weight 1: O1 = 10 + w, O2 = 4 + 5w. A tie at w = 1.5 does not count, so w = 2.
    expect(decisionSensitivity(run().plan)).toEqual([
      { criterion: "C1", flipsTo: "O2", atWeight: 1 },
      { criterion: "C2", flipsTo: "O2", atWeight: 2 },
    ]);
  });

  test("criteria that never flip the winner are omitted", () => {
    const { plan } = run((m) => {
      m.scores = { O1: { C1: 5, C2: 5 }, O2: { C1: 1, C2: 1 } };
    });
    expect(decisionSensitivity(plan)).toEqual([]);
  });

  test("sensitivity needs two options", () => {
    const { plan } = run((m) => {
      m.options = [m.options[0]];
      m.decision = undefined;
    });
    expect(decisionSensitivity(plan)).toEqual([]);
  });

  test("risk score is likelihood * impact", () => {
    expect(riskScore(run().plan.risks[0])).toBe(6);
  });
});

describe("taskLines", () => {
  test("vi format", () => {
    expect(taskLines(run().plan, "vi")).toEqual([
      "[ ] T1.1 Index pages (P1; kiểm tra: bun test)",
      "[ ] T1.2 Add UI (P1, sau: T1.1; kiểm tra: open the page)",
    ]);
  });

  test("en format and done steps", () => {
    const { plan } = run((m) => (m.phases[0].steps[0].state = "done"));
    expect(taskLines(plan, "en")).toEqual([
      "[x] T1.1 Index pages (P1; verify: bun test)",
      "[ ] T1.2 Add UI (P1, after: T1.1; verify: open the page)",
    ]);
  });

  test("lines follow schedule order, not declaration order", () => {
    const { plan } = run((m) => {
      m.phases[0].steps = [
        { id: "X", title: "Second", dependsOn: ["Y"], verify: "v" },
        { id: "Y", title: "First", verify: "v" },
      ];
    });
    expect(taskLines(plan, "en").map((l) => l.split(" ")[2])).toEqual(["Y", "X"]);
  });

  test("a step without verify has no verify part", () => {
    const { plan } = run((m) => delete m.phases[0].steps[0].verify);
    expect(taskLines(plan, "en")[0]).toBe("[ ] T1.1 Index pages (P1)");
  });
});
