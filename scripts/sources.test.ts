// Tests for check-sources: what the user sees for a good link, a dead link, a server that refuses HEAD,
// and a server that hangs. A fake fetch stands in for the network. Run with `bun test`.
import { describe, expect, test } from "bun:test";
import { checkSources } from "./templates/planner/sources.ts";

const web = (id: string, url: string) => ({ id, kind: "web" as const, url });

type Call = { url: string; method: string };

/** Build a fake fetch from a table: url -> status per method. */
function fake(table: Record<string, Partial<Record<"HEAD" | "GET", number>>>, calls: Call[] = []): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET") as "HEAD" | "GET";
    calls.push({ url, method });
    const status = table[url]?.[method];
    if (status === undefined) throw new TypeError("fetch failed");
    return new Response(null, { status });
  }) as typeof fetch;
}

describe("checkSources", () => {
  test("200 and 404 are reported by status", async () => {
    const out = await checkSources([web("S1", "https://a.test"), web("S2", "https://b.test")], {
      timeoutMs: 1000,
      fetch: fake({ "https://a.test": { HEAD: 200 }, "https://b.test": { HEAD: 404 } }),
    });
    expect(out).toEqual([
      { id: "S1", url: "https://a.test", status: 200 },
      { id: "S2", url: "https://b.test", status: 404 },
    ]);
  });

  test("405 on HEAD is retried with GET", async () => {
    const calls: Call[] = [];
    const out = await checkSources([web("S1", "https://a.test")], {
      timeoutMs: 1000,
      fetch: fake({ "https://a.test": { HEAD: 405, GET: 200 } }, calls),
    });
    expect(out[0].status).toBe(200);
    expect(calls.map((c) => c.method)).toEqual(["HEAD", "GET"]);
  });

  test("403 and 501 on HEAD are also retried with GET", async () => {
    const out = await checkSources([web("S1", "https://a.test"), web("S2", "https://b.test")], {
      timeoutMs: 1000,
      fetch: fake({ "https://a.test": { HEAD: 403, GET: 200 }, "https://b.test": { HEAD: 501, GET: 404 } }),
    });
    expect(out.map((r) => r.status)).toEqual([200, 404]);
  });

  test("a server that hangs gives status error with a timeout message", async () => {
    const hang = (() => new Promise<Response>(() => {})) as typeof fetch;
    const started = Date.now();
    const out = await checkSources([web("S1", "https://slow.test")], { timeoutMs: 30, fetch: hang });
    expect(out[0].status).toBe("error");
    expect(out[0].message).toContain("timeout");
    expect(Date.now() - started).toBeLessThan(2000);
  });

  test("a network failure gives status error and never throws", async () => {
    const out = await checkSources([web("S1", "https://down.test")], { timeoutMs: 1000, fetch: fake({}) });
    expect(out).toEqual([{ id: "S1", url: "https://down.test", status: "error", message: "fetch failed" }]);
  });

  test("only web sources with a url are checked", async () => {
    const calls: Call[] = [];
    const out = await checkSources(
      [{ id: "S1", kind: "code" }, { id: "S2", kind: "web" }, { id: "S3", kind: "user" }, web("S4", "https://a.test")],
      { timeoutMs: 1000, fetch: fake({ "https://a.test": { HEAD: 200 } }, calls) },
    );
    expect(out.map((r) => r.id)).toEqual(["S4"]);
    expect(calls).toHaveLength(1);
  });

  test("a URL that is not http(s) is an error and is not fetched", async () => {
    const calls: Call[] = [];
    const out = await checkSources([web("S1", "file:///etc/passwd")], { timeoutMs: 1000, fetch: fake({}, calls) });
    expect(out[0].status).toBe("error");
    expect(calls).toHaveLength(0);
  });

  test("no web sources gives an empty list", async () => {
    expect(await checkSources([], { timeoutMs: 1000, fetch: fake({}) })).toEqual([]);
  });

  test("at most 4 requests run at once and results keep input order", async () => {
    let active = 0;
    let peak = 0;
    const slow = (async () => {
      active++;
      peak = Math.max(peak, active);
      // One microtask turn: the four workers all start before any request finishes.
      await Promise.resolve();
      active--;
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    const sources = Array.from({ length: 10 }, (_, i) => web(`S${i + 1}`, `https://h${i}.test`));
    const out = await checkSources(sources, { timeoutMs: 1000, fetch: slow });
    expect(peak).toBe(4);
    expect(out.map((r) => r.id)).toEqual(sources.map((s) => s.id));
  });
});
