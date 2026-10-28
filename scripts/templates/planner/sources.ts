// check-sources: HEAD each web source URL and report the HTTP status. Never throws.
import type { Source } from "./model.ts";

export interface SourceCheck {
  id: string;
  url: string;
  status: number | "error";
  message?: string;
}

export interface CheckSourcesOptions {
  timeoutMs: number;
  /** Injected for tests. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

const CONCURRENCY = 4;
/** Servers that refuse HEAD answer with one of these. A GET then gives the real status. */
const RETRY_WITH_GET = new Set([403, 405, 501]);

async function request(doFetch: typeof fetch, url: string, method: "HEAD" | "GET", timeoutMs: number): Promise<number> {
  const ctl = new AbortController();
  let reject: (reason: Error) => void = () => undefined;
  const timeout = new Promise<never>((_, rej) => {
    reject = rej;
  });
  // Race the timeout so a fetch that ignores the abort signal cannot hang the run.
  const timer = setTimeout(() => {
    ctl.abort();
    reject(new Error(`timeout after ${timeoutMs} ms`));
  }, timeoutMs);
  try {
    const res = await Promise.race([doFetch(url, { method, redirect: "follow", signal: ctl.signal }), timeout]);
    void res.body?.cancel().catch(() => undefined);
    return res.status;
  } finally {
    clearTimeout(timer);
  }
}

async function checkOne(doFetch: typeof fetch, id: string, url: string, timeoutMs: number): Promise<SourceCheck> {
  try {
    if (!/^https?:\/\//i.test(url)) throw new Error("only http and https URLs can be checked");
    let status = await request(doFetch, url, "HEAD", timeoutMs);
    if (RETRY_WITH_GET.has(status)) status = await request(doFetch, url, "GET", timeoutMs);
    return { id, url, status };
  } catch (e) {
    return { id, url, status: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

/** Check the web sources (kind "web" with a url). Other kinds are skipped. Results keep the input order. */
export async function checkSources(sources: Pick<Source, "id" | "kind" | "url">[], opts: CheckSourcesOptions): Promise<SourceCheck[]> {
  const doFetch = opts.fetch ?? fetch;
  const web = sources.filter((s): s is typeof s & { url: string } => s.kind === "web" && !!s.url);
  const results: SourceCheck[] = new Array(web.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < web.length) {
      const i = next++;
      results[i] = await checkOne(doFetch, web[i].id, web[i].url, opts.timeoutMs);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, web.length) }, worker));
  return results;
}
