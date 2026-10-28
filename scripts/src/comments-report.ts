// Pure builder for the copied review report. No DOM: comments.ts gathers the parts.

export type Verdict = "" | "approve" | "request-changes";

export interface ReportComment {
  /** Location text: section › where. */
  where: string;
  /** Manifest path from `data-nsx-field`, empty when the block has none. */
  field: string;
  excerpt: string;
  quote: string;
  files: string[];
  text: string;
}

export interface ReportAnswer {
  label: string;
  field: string;
  value: string;
}

export interface ReportDecision {
  verdict: Verdict;
  note: string;
}

export interface ReportInput {
  title: string;
  /** Report name; adds the manifest line when set. */
  name?: string;
  comments: ReportComment[];
  /** Only non-empty answers are listed; empty ones are dropped here too. */
  answers: ReportAnswer[];
  decision: ReportDecision;
}

const indent = (s: string) => s.replace(/\n/g, "\n  ");

export function nonEmptyAnswers(answers: ReportAnswer[]): ReportAnswer[] {
  return answers.filter((a) => a.value.trim() !== "");
}

export function hasDecision(d: ReportDecision): boolean {
  return d.verdict !== "" || d.note.trim() !== "";
}

/** "2 comments, 3 answers, decision: request changes." Parts that are absent are left out. */
export function countLine(commentCount: number, answerCount: number, decision: ReportDecision): string {
  const parts: string[] = [];
  if (commentCount) parts.push(`${commentCount} comment${commentCount === 1 ? "" : "s"}`);
  if (answerCount) parts.push(`${answerCount} answer${answerCount === 1 ? "" : "s"}`);
  if (hasDecision(decision)) {
    parts.push(`decision: ${decision.verdict ? decision.verdict.replace(/-/g, " ") : "note only"}`);
  }
  return parts.join(", ");
}

/** The text to copy, or null when there is nothing to report. */
export function buildReportText(input: ReportInput): string | null {
  const answers = nonEmptyAnswers(input.answers);
  const { comments, decision } = input;
  if (!comments.length && !answers.length && !hasDecision(decision)) return null;

  const lines = [`# Review comments on "${input.title}"`];
  if (input.name) {
    lines.push(`Report: .ns-explain/${input.name}.html (manifest: .ns-explain/${input.name}.json)`);
  }
  lines.push(
    `${countLine(comments.length, answers.length, decision)}. Apply each one to the manifest, then render again.`,
    "",
  );

  comments.forEach((c, i) => {
    lines.push(`## ${i + 1}. ${c.where}`);
    lines.push(`Block: "${c.excerpt}"`);
    if (c.field) lines.push(`Field: ${c.field}`);
    if (c.quote) lines.push(`Selected: "${c.quote}"`);
    if (c.files.length) lines.push(`Files: ${c.files.join(", ")}`);
    lines.push(`Comment: ${indent(c.text)}`, "");
  });

  if (answers.length) {
    lines.push("## Answers");
    answers.forEach((a, i) => {
      lines.push(`### ${i + 1}. ${a.label || a.field}`);
      if (a.field) lines.push(`Field: ${a.field}`);
      lines.push(`Answer: ${indent(a.value.trim())}`, "");
    });
  }

  if (hasDecision(decision)) {
    lines.push("## Decision");
    if (decision.verdict) lines.push(`Verdict: ${decision.verdict}`);
    if (decision.note.trim()) lines.push(`Note: ${indent(decision.note.trim())}`);
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}
