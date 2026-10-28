// Previous-render diff: compares two manifests and lists what changed, so a re-render can show a
// "what changed since the last version" panel. Arrays of objects that all carry a string `id` are
// matched by id (path `phases[P1].steps[T1.2].verify`); every other array is matched by index.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface RevisionChange {
  path: string;
  kind: "added" | "removed" | "changed";
  before?: string;
  after?: string;
}

const MAX_TEXT = 160;
const HISTORY_DIR = ".history";

type Rec = Record<string, unknown>;

function isRec(v: unknown): v is Rec {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function shorten(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > MAX_TEXT ? `${flat.slice(0, MAX_TEXT - 1)}…` : flat;
}

function show(v: unknown): string {
  return shorten(typeof v === "string" ? v : (JSON.stringify(v) ?? String(v)));
}

/** True when every item is an object with a non-empty string id. */
function hasIds(list: unknown[]): list is Rec[] {
  return list.length > 0 && list.every((x) => isRec(x) && typeof x.id === "string" && x.id !== "");
}

/** Pair up the children of an object or array: [key label, path suffix, prev, next]. */
function children(prev: unknown, next: unknown): { key: string; seg: string; a: unknown; b: unknown; hasA: boolean; hasB: boolean }[] {
  if (Array.isArray(prev) && Array.isArray(next)) {
    if (hasIds(prev) && hasIds(next)) {
      const a = new Map(prev.map((x) => [x.id as string, x]));
      const b = new Map(next.map((x) => [x.id as string, x]));
      const ids = [...b.keys(), ...[...a.keys()].filter((id) => !b.has(id))];
      return ids.map((id) => ({ key: id, seg: `[${id}]`, a: a.get(id), b: b.get(id), hasA: a.has(id), hasB: b.has(id) }));
    }
    const n = Math.max(prev.length, next.length);
    return Array.from({ length: n }, (_, i) => ({ key: String(i), seg: `[${i}]`, a: prev[i], b: next[i], hasA: i < prev.length, hasB: i < next.length }));
  }
  const a = prev as Rec;
  const b = next as Rec;
  const keys = [...Object.keys(b), ...Object.keys(a).filter((k) => !(k in b))];
  return keys.map((k) => ({ key: k, seg: `.${k}`, a: a[k], b: b[k], hasA: k in a, hasB: k in b }));
}

function walk(prev: unknown, next: unknown, path: string, out: RevisionChange[]): void {
  const bothObjects = isRec(prev) && isRec(next);
  const bothArrays = Array.isArray(prev) && Array.isArray(next);
  if (!bothObjects && !bothArrays) {
    if (JSON.stringify(prev) !== JSON.stringify(next)) out.push({ path, kind: "changed", before: show(prev), after: show(next) });
    return;
  }
  for (const c of children(prev, next)) {
    const childPath = path === "" ? (c.seg.startsWith(".") ? c.seg.slice(1) : c.seg) : `${path}${c.seg}`;
    if (c.hasA && !c.hasB) out.push({ path: childPath, kind: "removed", before: show(c.a) });
    else if (!c.hasA && c.hasB) out.push({ path: childPath, kind: "added", after: show(c.b) });
    else walk(c.a, c.b, childPath, out);
  }
}

/** List the differences between two manifests. Equal manifests give an empty list. */
export function diffManifests(prev: unknown, next: unknown): RevisionChange[] {
  const out: RevisionChange[] = [];
  walk(prev, next, "", out);
  return out;
}

function previousPath(outDir: string, name: string): string {
  return join(outDir, HISTORY_DIR, `${name}.prev.json`);
}

/** Read the manifest saved by the last render. Returns null when there is none or it is not valid JSON. */
export async function loadPrevious(outDir: string, name: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(previousPath(outDir, name), "utf8")) as unknown;
  } catch {
    return null;
  }
}

/** Save the manifest to `<outDir>/.history/<name>.prev.json`. `outDir` is the `.ns-explain` directory. */
export async function savePrevious(outDir: string, name: string, manifest: unknown): Promise<void> {
  const file = previousPath(outDir, name);
  await mkdir(join(outDir, HISTORY_DIR), { recursive: true });
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`);
}
