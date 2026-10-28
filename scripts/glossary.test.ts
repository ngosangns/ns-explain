// Tests for the glossary: terms the agent must keep untranslated. They run the real CLI with a fake home
// directory and a scratch repo, so the two layers (~/.ns-explain and ./.ns-explain) are exercised as they
// are in use. Run with `bun test`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "ns-explain.ts");

let work = "";
let n = 0;

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "nsx-glossary-"));
});
afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

interface Out {
  stdout: string;
  stderr: string;
  exitCode: number;
  warnings: string[];
  /** The `- term` lines, in order. */
  terms: string[];
}

/** `user` and `repo` are file bodies; leave one out to leave that file missing. */
function run(cmd: string, files: { user?: string; repo?: string } = {}, cwdIsHome = false): Out {
  const dir = join(work, `case-${++n}`);
  const home = join(dir, "home");
  const repo = join(dir, "repo");
  mkdirSync(join(home, ".ns-explain"), { recursive: true });
  mkdirSync(join(repo, ".ns-explain"), { recursive: true });
  if (files.user != null) writeFileSync(join(home, ".ns-explain", "glossary.json"), files.user);
  if (files.repo != null) writeFileSync(join(repo, ".ns-explain", "glossary.json"), files.repo);
  const r = Bun.spawnSync(["bun", CLI, ...cmd.split(" ")], {
    cwd: cwdIsHome ? home : repo,
    // os.homedir() reads HOME on POSIX and USERPROFILE on Windows.
    env: { ...process.env, HOME: home, USERPROFILE: home },
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = r.stdout.toString();
  const stderr = r.stderr.toString();
  return {
    stdout,
    stderr,
    exitCode: r.exitCode ?? -1,
    warnings: stderr.split(/\r?\n/).filter((l) => l.startsWith("warning: ")),
    // The glossary block is the text before the first `---` rule (or all of it, for the glossary command).
    // `playbook` output carries its own bullet lines after that, which are not terms.
    terms: stdout.split(/\r?\n---\r?\n/)[0].split(/\r?\n/).filter((l) => l.startsWith("- ")).map((l) => l.slice(2)),
  };
}

const keep = (...t: string[]) => JSON.stringify({ keep: t });

describe("glossary command", () => {
  test("reads the repo file", () => {
    expect(run("glossary", { repo: keep("toolbar", "composer") }).terms).toEqual(["toolbar", "composer"]);
  });

  test("reads the user file when the repo has none", () => {
    expect(run("glossary", { user: keep("tool") }).terms).toEqual(["tool"]);
  });

  test("adds the two layers together, user first", () => {
    const out = run("glossary", { user: keep("tool", "template"), repo: keep("composer") });
    expect(out.terms).toEqual(["tool", "template", "composer"]);
  });

  test("keeps a term that appears in both layers once, with the user spelling", () => {
    const out = run("glossary", { user: keep("Toolbar"), repo: keep("toolbar", "document") });
    expect(out.terms).toEqual(["Toolbar", "document"]);
  });

  test("keeps a term of several words as one term", () => {
    expect(run("glossary", { repo: keep("word document", "interactive editor") }).terms).toEqual([
      "word document",
      "interactive editor",
    ]);
  });

  test("collapses runs of spaces inside a term and trims it", () => {
    expect(run("glossary", { repo: keep("  math   editor ") }).terms).toEqual(["math editor"]);
  });

  test("names the files the terms came from and how many each gave", () => {
    const out = run("glossary", { user: keep("a"), repo: keep("b", "c") });
    expect(out.stdout).toMatch(/From: user .*glossary\.json \(1\), repo .*glossary\.json \(2\)/);
  });

  test("with no file, says no term is pinned and where to create one", () => {
    const out = run("glossary");
    expect(out.exitCode).toBe(0);
    expect(out.terms).toEqual([]);
    expect(out.stdout).toContain("empty");
    expect(out.stdout).toContain(join(".ns-explain", "glossary.json"));
    expect(out.stdout).toContain('{"keep"');
  });

  test("an empty keep list counts as empty", () => {
    expect(run("glossary", { repo: keep() }).stdout).toContain("empty");
  });

  test("run from the home directory, the one file is read once", () => {
    const out = run("glossary", { user: keep("tool") }, true);
    expect(out.terms).toEqual(["tool"]);
    expect(out.stdout).not.toMatch(/user .*, repo/);
  });
});

describe("a broken glossary file", () => {
  test("invalid JSON is skipped with a warning, the other layer still counts", () => {
    const out = run("glossary", { user: "{ not json", repo: keep("composer") });
    expect(out.exitCode).toBe(0);
    expect(out.terms).toEqual(["composer"]);
    expect(out.warnings.join("\n")).toContain("not valid JSON");
  });

  test("a file without a keep list is skipped with a warning", () => {
    const out = run("glossary", { repo: JSON.stringify({ terms: ["x"] }) });
    expect(out.terms).toEqual([]);
    expect(out.warnings.join("\n")).toContain('expected {"keep"');
  });

  test("an entry that is not a string is dropped with a warning, the others stay", () => {
    const out = run("glossary", { repo: JSON.stringify({ keep: ["toolbar", 7, "", "  "] }) });
    expect(out.terms).toEqual(["toolbar"]);
    expect(out.warnings.join("\n")).toContain("non-empty string");
  });

  test("a byte order mark in front of the JSON is accepted", () => {
    expect(run("glossary", { repo: "\uFEFF" + keep("toolbar") }).terms).toEqual(["toolbar"]);
  });
});

describe("playbook", () => {
  test("prints the pinned terms before the schema", () => {
    const out = run("playbook reviewer", { repo: keep("toolbar") });
    expect(out.terms).toEqual(["toolbar"]);
    const terms = out.stdout.indexOf("- toolbar");
    const schema = out.stdout.indexOf("# ns-explain artifact playbook");
    expect(terms).toBeGreaterThan(-1);
    expect(schema).toBeGreaterThan(terms);
  });

  test("starts with the plain playbook when nothing is pinned", () => {
    const out = run("playbook reviewer");
    expect(out.stdout.startsWith("# ns-explain artifact playbook")).toBe(true);
  });

  test("tells the agent where to add a term", () => {
    const out = run("playbook reviewer");
    expect(out.stdout).toContain("If the user asks you to stop translating a word, add it to the glossary");
    expect(out.stdout).toContain("~/.ns-explain/glossary.json");
    expect(out.stdout).toContain(".ns-explain/glossary.json");
  });

  test("a broken glossary file does not stop the playbook", () => {
    const out = run("playbook reviewer", { repo: "oops" });
    expect(out.exitCode).toBe(0);
    expect(out.stdout).toContain("# ns-explain artifact playbook");
    expect(out.warnings.join("\n")).toContain("not valid JSON");
  });
});

describe("help", () => {
  test("lists the glossary command", () => {
    expect(run("help").stdout).toContain("glossary");
  });
});
