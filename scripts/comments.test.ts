import { describe, expect, test } from "bun:test";
import { buildReportText, countLine, type ReportInput } from "./src/comments-report.ts";

const base: ReportInput = {
  title: "Plan",
  name: "plan",
  comments: [],
  answers: [],
  decision: { verdict: "", note: "" },
};
const comment = {
  where: "Findings › Item 1",
  field: "findings[F2]",
  excerpt: "Cache is stale",
  quote: "",
  files: [],
  text: "Check this.\nTwice.",
};

describe("buildReportText", () => {
  test("returns null when nothing was written", () => {
    expect(buildReportText(base)).toBeNull();
    expect(buildReportText({ ...base, answers: [{ label: "Q", field: "questions[Q1]", value: "  " }] })).toBeNull();
  });

  test("prints Field after Block and keeps the location text", () => {
    const out = buildReportText({ ...base, comments: [comment] }) ?? "";
    expect(out).toContain("## 1. Findings › Item 1\nBlock: \"Cache is stale\"\nField: findings[F2]\nComment: Check this.\n  Twice.");
    expect(out).toContain("1 comment. Apply each one");
  });

  test("leaves out the Field line when the block has no field", () => {
    const out = buildReportText({ ...base, comments: [{ ...comment, field: "" }] }) ?? "";
    expect(out).not.toContain("Field:");
  });

  test("works with answers only and skips empty answers", () => {
    const out = buildReportText({
      ...base,
      answers: [
        { label: "Which DB?", field: "questions[Q1]", value: "Postgres" },
        { label: "Skip", field: "questions[Q2]", value: "" },
      ],
    }) ?? "";
    expect(out).toContain("1 answer. Apply each one");
    expect(out).toContain("## Answers\n### 1. Which DB?\nField: questions[Q1]\nAnswer: Postgres");
    expect(out).not.toContain("Q2");
    expect(out).not.toContain("## Decision");
  });

  test("lists comments, answers and decision in one count line", () => {
    const out = buildReportText({
      ...base,
      comments: [comment, comment],
      answers: [1, 2, 3].map((n) => ({ label: `Q${n}`, field: `questions[Q${n}]`, value: "x" })),
      decision: { verdict: "request-changes", note: "Fix step 2" },
    }) ?? "";
    expect(out).toContain("2 comments, 3 answers, decision: request changes. Apply each one to the manifest, then render again.");
    expect(out).toContain("## Decision\nVerdict: request-changes\nNote: Fix step 2");
    expect(out.indexOf("## Answers")).toBeGreaterThan(out.indexOf("## 2."));
    expect(out.indexOf("## Decision")).toBeGreaterThan(out.indexOf("## Answers"));
  });

  test("a note without a verdict still reports a decision", () => {
    const out = buildReportText({ ...base, decision: { verdict: "", note: "Later" } }) ?? "";
    expect(out).toContain("decision: note only.");
    expect(out).toContain("## Decision\nNote: Later");
    expect(out).not.toContain("Verdict:");
  });
});

describe("countLine", () => {
  test("handles singular and absent parts", () => {
    expect(countLine(1, 0, { verdict: "approve", note: "" })).toBe("1 comment, decision: approve");
    expect(countLine(0, 2, { verdict: "", note: "" })).toBe("2 answers");
  });
});
