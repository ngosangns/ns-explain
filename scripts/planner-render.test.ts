// Tests for the planner page. Each case runs the real `ns-explain.ts render` in a scratch directory, the same
// way render.test.ts does. Run with `bun test`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "ns-explain.ts");

let work = "";
let n = 0;

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "nsx-plan-test-"));
});
afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

interface Rendered {
  warnings: string[];
  stderr: string;
  html: string;
  exitCode: number;
  dir: string;
}

type Plan = Record<string, unknown>;

/** A small plan that renders with no warnings. Tests change or add fields. */
function plan(extra: Plan = {}): Plan {
  return {
    template: "planner",
    name: "p",
    title: "Plan",
    oneLiner: "Change one thing.",
    request: { original: "Please change one thing.", summary: "Change one thing." },
    sources: [{ id: "S1", kind: "user", quote: "Please change one thing." }],
    findings: [{ id: "F1", text: "The thing exists.", sources: ["S1"], confidence: "high", status: "verified" }],
    phases: [
      {
        id: "P1",
        title: "Do it",
        steps: [
          {
            id: "T1.1",
            title: "Change it",
            estimate: { o: 1, m: 2, p: 3 },
            verify: "The thing changed",
          },
        ],
      },
    ],
    ...extra,
  };
}

function run(m: Plan, flags: string[] = [], dir = join(work, `case-${++n}`)): Rendered {
  mkdirSync(join(dir, ".ns-explain"), { recursive: true });
  writeFileSync(join(dir, ".ns-explain", "p.json"), JSON.stringify(m));
  const r = Bun.spawnSync(["bun", CLI, "render", ".ns-explain/p.json", ...flags], { cwd: dir, stderr: "pipe", stdout: "pipe" });
  const stderr = r.stderr.toString();
  const out = join(dir, ".ns-explain", "p.html");
  return {
    warnings: stderr.split(/\r?\n/).filter((l) => l.startsWith("warning: ")).map((l) => l.slice("warning: ".length)),
    stderr,
    html: r.exitCode === 0 && existsSync(out) ? readFileSync(out, "utf8") : "",
    exitCode: r.exitCode ?? -1,
    dir,
  };
}

/** The page body (without the bundle and file store, which hold their own markup). */
function bodyOf(html: string): string {
  const start = html.indexOf("<main");
  return html.slice(start, html.indexOf("</main>", start));
}

/** Markup of the element with this `id`, up to its closing tag. */
function articleOf(html: string, id: string): string {
  const m = new RegExp(`<article [^>]*id="${id}"[\\s\\S]*?</article>`).exec(html);
  return m ? m[0] : "";
}

/** Text a reader sees in a table cell or element: tags removed, spaces collapsed. */
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("planner page", () => {
  test("a planner manifest renders every core section and no warnings", () => {
    const r = run(plan());
    expect(r.exitCode).toBe(0);
    expect(r.warnings).toEqual([]);
    const body = bodyOf(r.html);
    for (const id of ["sec-request", "sec-research", "sec-plan", "sec-verdict"]) expect(body).toContain(`id="${id}"`);
    expect(body).toContain('data-nsx-field="phases[P1].steps[T1.1]"');
    expect(r.html).toContain("daisyui");
    expect(r.html).toContain(".nsx-chip");
  });

  test("the Vietnamese example fixture renders with zero warnings", () => {
    const fixture = join(import.meta.dir, "..", "docs", "examples", "page-size");
    const dir = join(work, "fixture");
    cpSync(join(fixture, "orders"), join(dir, "orders"), { recursive: true });
    cpSync(join(fixture, "page-size-plan.json"), join(dir, "page-size-plan.json"));
    const r = Bun.spawnSync(["bun", CLI, "render", "page-size-plan.json"], { cwd: dir, stderr: "pipe", stdout: "pipe" });
    const err = r.stderr.toString();
    expect(err).not.toContain("missing file");
    expect(err.split(/\r?\n/).filter((l) => l.startsWith("warning: "))).toEqual([]);
    expect(r.exitCode).toBe(0);
  });

  test("a dependency cycle exits 2 and writes no HTML", () => {
    const m = plan({
      phases: [
        {
          id: "P1",
          title: "Loop",
          steps: [
            { id: "T1.1", title: "A", dependsOn: ["T1.2"], verify: "v" },
            { id: "T1.2", title: "B", dependsOn: ["T1.1"], verify: "v" },
          ],
        },
      ],
    });
    const r = run(m);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("manifest: phases: dependency cycle");
    expect(existsSync(join(r.dir, ".ns-explain", "p.html"))).toBe(false);
  });

  test("an unanswered blocking question asks for an answer, an answered one does not", () => {
    const r = run(
      plan({
        questions: [
          { id: "Q1", text: "Which database?", blocking: true, default: "Postgres", options: ["Postgres", "SQLite"] },
          { id: "Q2", text: "Ship behind a flag?", blocking: false, answer: "Yes" },
        ],
      }),
    );
    expect(r.exitCode).toBe(0);
    const q1 = articleOf(r.html, "Q1");
    expect(q1).toContain('data-nsx-field="questions[Q1]"');
    expect(q1).toContain("data-nsx-input");
    expect(q1).toContain('type="radio"');
    expect(q1).toContain("Postgres");
    const q2 = articleOf(r.html, "Q2");
    expect(q2).toContain('data-nsx-field="questions[Q2]"');
    expect(q2).not.toContain("data-nsx-input");
    expect(text(q2)).toContain("Yes");
    // The status strip counts the open blocking question.
    expect(text(bodyOf(r.html))).toContain("1 câu hỏi chặn chưa trả lời");
  });

  test("a question without options gets a textarea", () => {
    const r = run(plan({ questions: [{ id: "Q1", text: "Why?", blocking: false }] }));
    expect(articleOf(r.html, "Q1")).toMatch(/<textarea data-nsx-input/);
  });

  test("approved status with an unanswered blocking question warns", () => {
    const r = run(plan({ status: "approved", questions: [{ id: "Q1", text: "Which?", blocking: true, default: "A" }] }));
    expect(r.exitCode).toBe(0);
    expect(r.warnings.some((w) => w.includes("approved") && w.includes("Q1"))).toBe(true);
  });

  describe("decision matrix", () => {
    // O1 = 3*5 + 1*2 = 17. O2 = 3*3 + 1*5 = 14. O1 wins.
    // Cutting the weight of Safety from 3 to 1 gives O1 = 7 and O2 = 8, so Beta wins.
    // Raising the weight of Speed from 1 to 2.5 gives O1 = 15 + 5 = 20 and O2 = 9 + 12.5 = 21.5, so Beta wins.
    const decided = (lang?: string) =>
      plan({
        ...(lang ? { lang } : {}),
        options: [
          { id: "O1", title: "Alpha", summary: "A" },
          { id: "O2", title: "Beta", summary: "B", rejectedBecause: "Too slow to build." },
        ],
        criteria: [
          { id: "C1", label: "Safety", weight: 3 },
          { id: "C2", label: "Speed", weight: 1 },
        ],
        scores: { O1: { C1: 5, C2: 2 }, O2: { C1: 3, C2: 5 } },
        decision: { chosen: "O1", because: "Safer.", drivers: ["F1"], consequences: [{ text: "Slower.", tone: "bad" }] },
      });

    test("the winner column is marked and totals are weighted sums", () => {
      const r = run(decided());
      const totalRow = /<tr class="nsx-total">[\s\S]*?<\/tr>/.exec(r.html)?.[0] ?? "";
      const cells = [...totalRow.matchAll(/<td class="nsx-num( nsx-win)?"[^>]*>([\s\S]*?)<\/td>/g)];
      expect(cells.length).toBe(2);
      expect(cells[0][1]).toBe(" nsx-win");
      expect(text(cells[0][2])).toBe("17");
      expect(cells[1][1]).toBeUndefined();
      expect(text(cells[1][2])).toBe("14");
      expect(r.html).toContain('data-winner="true"');
    });

    test("the sensitivity sentences match the hand-computed flips", () => {
      const r = run(decided("en"));
      expect(r.exitCode).toBe(0);
      const t = text(bodyOf(r.html));
      expect(t).toContain('If the weight of "Safety" falls from 3 to 1, Beta wins.');
      expect(t).toContain('If the weight of "Speed" rises from 1 to 2.5, Beta wins.');
    });

    test("Vietnamese uses a decimal comma", () => {
      const r = run(decided());
      expect(text(bodyOf(r.html))).toContain('Nếu trọng số của "Speed" tăng từ 1 lên 2,5 thì Beta thắng.');
    });

    test("a plan whose winner never changes says so", () => {
      const m = decided("en");
      m.scores = { O1: { C1: 5, C2: 5 }, O2: { C1: 1, C2: 1 } };
      const r = run(m);
      expect(text(bodyOf(r.html))).toContain("The decision does not change when one weight changes at a time.");
    });

    test("a rejected option shows why, the chosen one does not", () => {
      const r = run(decided("en"));
      expect(text(articleOf(r.html, "O2"))).toContain("Too slow to build.");
      expect(text(articleOf(r.html, "O1"))).toContain("Chosen");
      expect(text(articleOf(r.html, "O1"))).not.toContain("Why rejected");
    });
  });

  test("a chart without a source warns, and one with a source does not", () => {
    const chart = { id: "CH1", kind: "bar", title: "Pages", x: ["a", "b"], series: [{ name: "n", values: [1, 2] }] };
    const bad = run(plan({ charts: [chart] }));
    expect(bad.warnings.some((w) => w.includes("charts[CH1]") && w.includes("source"))).toBe(true);
    const good = run(plan({ charts: [{ ...chart, source: "S1" }] }));
    expect(good.warnings).toEqual([]);
    expect(good.html).toContain('data-nsx-field="charts[CH1]"');
  });

  test("HTML in a source quote and a step title is escaped", () => {
    const m = plan({
      sources: [
        { id: "S1", kind: "web", title: "T", url: "https://example.com/a", retrieved: "2026-10-28", quote: "<img src=x onerror=alert(1)>" },
      ],
      findings: [{ id: "F1", text: "Fact.", sources: ["S1"], confidence: "high", status: "verified" }],
      phases: [
        { id: "P1", title: "<b>Phase</b>", steps: [{ id: "T1.1", title: "<script>alert(2)</script>", verify: "<i>x</i>" }] },
      ],
    });
    const r = run(m);
    expect(r.exitCode).toBe(0);
    const body = bodyOf(r.html);
    expect(body).not.toContain("<img src=x");
    expect(body).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(body).not.toContain("<script>alert(2)");
    expect(body).toContain("&lt;script&gt;alert(2)&lt;/script&gt;");
    expect(body).not.toContain("<b>Phase</b>");
    // The dependency graph JSON must not hold a raw `<` either.
    for (const b of body.matchAll(/<script class="graph-model" type="application\/json">([\s\S]*?)<\/script>/g)) {
      expect(b[1]).not.toContain("<");
    }
  });

  test("a web link opens in a new tab without leaking the opener", () => {
    const r = run(
      plan({ sources: [{ id: "S1", kind: "web", title: "T", url: "https://example.com/a", retrieved: "2026-10-28", quote: "q" }] }),
    );
    expect(r.html).toMatch(/<a href="https:\/\/example\.com\/a" target="_blank" rel="noopener noreferrer">example\.com<\/a>/);
  });

  describe("revision", () => {
    test("the first render has no revision section, a changed second render lists the path", () => {
      const dir = join(work, "rev");
      const first = run(plan(), [], dir);
      expect(first.exitCode).toBe(0);
      expect(bodyOf(first.html)).not.toContain('id="sec-revision"');

      const changed = plan();
      (changed.phases as { steps: { verify: string }[] }[])[0].steps[0].verify = "A different check";
      const second = run(changed, [], dir);
      expect(second.exitCode).toBe(0);
      const body = bodyOf(second.html);
      expect(body).toContain('id="sec-revision"');
      expect(body).toContain("phases[P1].steps[T1.1].verify");
      expect(body).toContain("A different check");
    });

    test("a second render of an unchanged manifest has no revision section", () => {
      const dir = join(work, "rev-same");
      run(plan(), [], dir);
      const again = run(plan(), [], dir);
      expect(bodyOf(again.html)).not.toContain('id="sec-revision"');
    });
  });

  test("lang en switches labels", () => {
    const r = run(plan({ lang: "en" }));
    const body = bodyOf(r.html);
    expect(r.html).toContain('<html lang="en"');
    expect(text(body)).toContain("Original request");
    expect(text(body)).toContain("Your decision");
    expect(text(body)).not.toContain("Yêu cầu ban đầu");
    expect(body).toContain(">Approve<");
    // The comment layer strings come from the planner copy.
    const ui = JSON.parse(/<script id="nsx-ui" type="application\/json">([\s\S]*?)<\/script>/.exec(r.html)![1]);
    expect(ui.comments.verdictApprove).toBe("Approve");
    expect(ui.comments.copy).toBe("Copy comments");
  });

  test("Vietnamese is the default language", () => {
    const r = run(plan());
    expect(r.html).toContain('<html lang="vi"');
    expect(text(bodyOf(r.html))).toContain("Yêu cầu ban đầu");
    const ui = JSON.parse(/<script id="nsx-ui" type="application\/json">([\s\S]*?)<\/script>/.exec(r.html)![1]);
    expect(ui.comments.verdictApprove).toBe("Chấp thuận");
    // Strings the planner does not override still come from the shared copy.
    expect(ui.comments.save).toBe("Lưu");
  });

  test("a goal with no step is flagged on the page and in the warnings", () => {
    const r = run(plan({ goals: [{ id: "G1", text: "A goal.", acceptance: ["WHEN x THE SYSTEM SHALL y"] }] }));
    expect(r.warnings.some((w) => w.includes("goals[G1]"))).toBe(true);
    expect(text(articleOf(r.html, "G1"))).toContain("chưa có bước nào");
  });

  test("a [S9] typo in a fragment warns", () => {
    const r = run(plan({ starting: { summary: "<p>See [S9] for details.</p>" } }));
    expect(r.warnings.some((w) => w.includes("S9"))).toBe(true);
  });

  test("code sources and step files are embedded for the file view", () => {
    const dir = join(work, "embed");
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "a.ts"), "export const A = 1;\n");
    writeFileSync(join(dir, "src", "b.ts"), "export const B = 2;\n");
    const m = plan({
      sources: [{ id: "S1", kind: "code", title: "A", path: "src/a.ts", line: 1, quote: "export const A = 1;" }],
      phases: [{ id: "P1", title: "Do", steps: [{ id: "T1.1", title: "Edit B", files: ["src/b.ts:1"], verify: "v" }] }],
    });
    const r = run(m, [], dir);
    expect(r.exitCode).toBe(0);
    const store = JSON.parse(/<script id="file-store" type="application\/json">([\s\S]*?)<\/script>/.exec(r.html)![1]);
    expect(Object.keys(store).sort()).toEqual(["src/a.ts", "src/b.ts"]);
    expect(r.html).toContain('data-path="src/b.ts" data-line="1"');
  });

  test("--check-sources warns about an unreachable URL but still renders", () => {
    const m = plan({
      sources: [{ id: "S1", kind: "web", title: "Dead", url: "http://127.0.0.1:9/", retrieved: "2026-10-28", quote: "q" }],
    });
    const r = run(m, ["--check-sources"]);
    expect(r.exitCode).toBe(0);
    expect(r.html).not.toBe("");
    expect(r.warnings.some((w) => w.startsWith("source S1 http://127.0.0.1:9/ ->"))).toBe(true);
    expect(r.stderr).toContain("sources checked: 0 ok, 1 failed");
  });

  test("without --check-sources no network check runs", () => {
    const m = plan({
      sources: [{ id: "S1", kind: "web", title: "Dead", url: "http://127.0.0.1:9/", retrieved: "2026-10-28", quote: "q" }],
    });
    const r = run(m);
    expect(r.warnings).toEqual([]);
    expect(r.stderr).not.toContain("sources checked");
  });
});
