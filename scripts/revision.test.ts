// Tests for the revision diff: what a re-render shows as changed since the last version, and the
// saved copy of the previous manifest. Run with `bun test`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diffManifests, loadPrevious, savePrevious } from "./core/revision.ts";

const plan = (verify: string, extra: unknown[] = []) => ({
  title: "T",
  phases: [{ id: "P1", steps: [{ id: "T1.1", verify }, ...extra] }],
});

describe("diffManifests", () => {
  test("equal manifests give no changes", () => {
    expect(diffManifests(plan("a"), plan("a"))).toEqual([]);
  });

  test("a changed string uses an id path", () => {
    expect(diffManifests(plan("bun test"), plan("bun run check"))).toEqual([
      { path: "phases[P1].steps[T1.1].verify", kind: "changed", before: "bun test", after: "bun run check" },
    ]);
  });

  test("added and removed items are matched by id, not by position", () => {
    const prev = plan("v", [{ id: "T1.2", verify: "x" }]);
    const next = { title: "T", phases: [{ id: "P1", steps: [{ id: "T1.0", verify: "n" }, { id: "T1.1", verify: "v" }] }] };
    const changes = diffManifests(prev, next);
    expect(changes).toContainEqual({ path: "phases[P1].steps[T1.0]", kind: "added", after: '{"id":"T1.0","verify":"n"}' });
    expect(changes).toContainEqual({ path: "phases[P1].steps[T1.2]", kind: "removed", before: '{"id":"T1.2","verify":"x"}' });
    // T1.1 moved from index 0 to index 1 but did not change.
    expect(changes.some((c) => c.path.includes("T1.1"))).toBe(false);
    expect(changes).toHaveLength(2);
  });

  test("arrays without ids are matched by index", () => {
    const changes = diffManifests({ nonGoals: ["a", "b"] }, { nonGoals: ["a", "c", "d"] });
    expect(changes).toEqual([
      { path: "nonGoals[1]", kind: "changed", before: "b", after: "c" },
      { path: "nonGoals[2]", kind: "added", after: "d" },
    ]);
  });

  test("a removed top-level field and a status change are reported", () => {
    const changes = diffManifests({ status: "draft", rabbitHoles: ["x"] }, { status: "approved" });
    expect(changes).toContainEqual({ path: "status", kind: "changed", before: "draft", after: "approved" });
    expect(changes).toContainEqual({ path: "rabbitHoles", kind: "removed", before: '["x"]' });
  });

  test("long strings are shortened to 160 characters", () => {
    const long = "x".repeat(500);
    const [c] = diffManifests({ oneLiner: long }, { oneLiner: "short" });
    expect(c.before?.length).toBe(160);
    expect(c.before?.endsWith("…")).toBe(true);
    expect(c.after).toBe("short");
  });

  test("a value that changes type is a change", () => {
    const [c] = diffManifests({ a: "x" }, { a: { b: 1 } });
    expect(c).toEqual({ path: "a", kind: "changed", before: "x", after: '{"b":1}' });
  });

  test("a previous manifest of null or another shape does not throw", () => {
    expect(diffManifests(null, { a: 1 })).toEqual([{ path: "", kind: "changed", before: "null", after: '{"a":1}' }]);
  });
});

describe("loadPrevious and savePrevious", () => {
  let dir = "";
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "nsx-rev-"));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("nothing saved yet gives null", async () => {
    expect(await loadPrevious(join(dir, ".ns-explain"), "none")).toBeNull();
  });

  test("save creates .history and load returns the same manifest", async () => {
    const out = join(dir, ".ns-explain");
    await savePrevious(out, "my-plan", { title: "T", n: [1, 2] });
    expect(existsSync(join(out, ".history", "my-plan.prev.json"))).toBe(true);
    expect(await loadPrevious(out, "my-plan")).toEqual({ title: "T", n: [1, 2] });
  });

  test("a second save replaces the first", async () => {
    const out = join(dir, ".ns-explain");
    await savePrevious(out, "again", { v: 1 });
    await savePrevious(out, "again", { v: 2 });
    expect(await loadPrevious(out, "again")).toEqual({ v: 2 });
  });
});
