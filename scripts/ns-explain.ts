#!/usr/bin/env node
// ns-explain artifact renderer — the HTML shell is fixed (core/shell.html); the
// agent writes only a JSON manifest and this CLI injects it. Each report kind is a
// template (templates/<id>/): reviewer explains a change, planner plans work. On
// render the CLI builds the TypeScript viewer and page runtime and packs that bundle
// into the HTML, so the export is one file.
//
// Usage:
//   node ns-explain.ts                          terse index
//   node ns-explain.ts playbook                 list templates
//   node ns-explain.ts playbook <template>      glossary + shared rules + that template's playbook
//   node ns-explain.ts templates                list templates
//   node ns-explain.ts glossary                 terms to keep untranslated (user + repo files)
//   node ns-explain.ts render <file.json> [--check-sources]   -> .ns-explain/<name>.html
//   node ns-explain.ts serve <file.html>        serve + open (same as serve.ts)
//   node ns-explain.ts tasks <file.json>        planner only: steps in dependency order

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname, join, basename } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { formatGlossary, loadGlossary } from "./glossary.ts";
import { conceptIsPresent, normalizeConcepts } from "./core/concepts.ts";
import { checkRefs } from "./core/refs.ts";
import { renderShell } from "./core/shell.ts";
import { getTemplate, importIfPresent, listTemplates, templateIds } from "./core/template.ts";
import type { Lang } from "./core/template.ts";

const DIR = dirname(fileURLToPath(import.meta.url)); // scripts/
const SELF = join(DIR, "ns-explain.ts");
const cmd = process.argv[2];
const rest = process.argv.slice(3);

const HELP = `ns-explain artifact renderer — fixed HTML shell, manifest-driven, one template per report kind.

commands:
  playbook                 list templates and when to use each
  playbook <template>      glossary + shared rules + that template's playbook (read before writing a manifest)
  templates                list templates
  glossary                 terms the agent must keep untranslated (~/.ns-explain/glossary.json + .ns-explain/glossary.json)
  render <manifest.json>   build the viewer and pack it into .ns-explain/<name>.html (--check-sources: planner also checks source URLs)
  serve <file.html>        serve the file's dir over HTTP and open the browser
  tasks <manifest.json>    planner only: steps in dependency order, one per line, for a todo list
  help                     this index

common manifest fields:
  template     "reviewer" (default) | "planner" — picks the report kind
  name         kebab-case output name (default: manifest filename stem)
  lang         "vi" (default) | "en" — drives section labels + diagram legend
  theme        "system" (default) or a daisyui theme name
  extraHead    optional HTML for <head> — project fonts, tokens
  concepts     [{term, explain}] — plain popovers on words the user asked about
  files        extra repo-relative paths to embed beyond auto-detected refs

reviewer manifest[11]{field,required}:
  title*       document title
  oneLiner*    one-sentence summary (HTML fragment, may hold .ref spans)
  graph*       lens-diagram JSON DSL (labels, nodes, edges, flows)
  featureTree  nested [{label, children, changes:[{kind, text|old, new, hunks:[{path, line, diff, explain}]}]}] — see playbook
  plainTerms   HTML paragraphs (features only, no identifiers)
  lenses       {creational, structural, behavioral} — HTML fragments
  pseudocode   [{title, code}] — one per flow; code is plain text
  testResults  {command, scope: full|package|related, scopeNote, passed, total, skipped, failed:[{name, message}], earlier:[run], files:[{path, line, tests:[{kind: added|modified, name, behavior}]}]} | {notRun: "reason", files} — LAST section; only when the change added or edited tests; numbers from a run that really happened
  plan         repo-relative path to the planner manifest this change implements
  (plus the common fields above)

planner: for a plan, not a change — run \`playbook planner\`.

* required. workflow: playbook <template> -> write .ns-explain/<name>.json -> render -> serve (background)`;

const QUOTE = (s: string) => JSON.stringify(s);

function printTemplates(): void {
  for (const info of listTemplates()) {
    console.log(`${info.id}`);
    console.log(`  vi: ${info.summary.vi}`);
    console.log(`  en: ${info.summary.en}`);
    console.log(`  playbook: node ${QUOTE(SELF)} playbook ${info.id}`);
  }
}

async function glossaryBlock(): Promise<string> {
  // Pinned terms go first so they are read before the rules. An empty glossary adds nothing here;
  // the playbook itself says where to configure one.
  const glossary = await loadGlossary();
  for (const w of glossary.warnings) console.error(`warning: ${w}`);
  return glossary.terms.length ? `${formatGlossary(glossary)}\n---\n\n` : "";
}

async function playbook(id: string | undefined): Promise<void> {
  if (!id) {
    printTemplates();
    return;
  }
  const info = listTemplates().find((t) => t.id === id);
  if (!info) throw new Error(`unknown template "${id}" (valid: ${templateIds().join(", ")})`);
  let body: string;
  try {
    body = await readFile(info.playbook, "utf8");
  } catch {
    process.stdout.write("not written yet\n");
    return;
  }
  const shared = await readFile(join(DIR, "playbook-shared.md"), "utf8");
  process.stdout.write(`${await glossaryBlock()}${shared}\n---\n\n${body}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

async function readManifest(manifestPath: string): Promise<Record<string, unknown>> {
  const raw = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
  if (!isRecord(raw)) throw new Error("manifest must be a JSON object");
  return raw;
}

function templateId(manifest: Record<string, unknown>): string {
  if (manifest.template == null) return "reviewer";
  return String(manifest.template);
}

interface Revision {
  loadPrevious(outDir: string, name: string): Promise<unknown>;
  savePrevious(outDir: string, name: string, manifest: unknown): Promise<void>;
}

async function render(manifestPath: string, flags: string[]) {
  const mp = resolve(manifestPath);
  const manifest = await readManifest(mp);
  const template = await getTemplate(templateId(manifest));
  const name = (String(manifest.name || basename(mp).replace(/\.[^.]+$/, "")))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const lang: Lang = manifest.lang === "en" ? "en" : "vi";

  for (const field of template.required) {
    if (manifest[field] == null) {
      console.error(`manifest: missing required field "${field}"`);
      process.exit(2);
    }
  }

  const warnings: string[] = [];
  const concepts = normalizeConcepts(manifest.concepts, warnings);

  const outDir = resolve(".ns-explain");
  const revision = await importIfPresent<Revision>("core/revision.ts");
  const previous = revision ? await revision.loadPrevious(outDir, name) : undefined;

  const result = await template.render({
    manifest,
    manifestPath: mp,
    name,
    lang,
    concepts,
    warnings,
    options: { checkSources: flags.includes("--check-sources"), previous },
  });

  // Embed every file the template points at, plus anything listed explicitly in `files`.
  const paths = new Set<string>(
    Array.isArray(manifest.files) ? manifest.files.map(String) : [],
  );
  for (const p of result.embed) paths.add(p);
  const store: Record<string, string> = {};
  const missing: string[] = [];
  for (const p of [...paths].sort()) {
    try {
      store[p] = await readFile(resolve(p), "utf8");
    } catch {
      missing.push(p);
    }
  }

  const html = await renderShell({
    lang,
    name,
    title: String(manifest.title ?? ""),
    oneLiner: result.oneLiner,
    sections: result.sections,
    store,
    concepts,
    theme: typeof manifest.theme === "string" ? manifest.theme : undefined,
    extraHead: typeof manifest.extraHead === "string" ? manifest.extraHead : undefined,
    css: result.css,
    ui: result.ui,
  });

  await mkdir(outDir, { recursive: true });
  const out = join(outDir, `${name}.html`);
  await writeFile(out, html);
  if (revision) await revision.savePrevious(outDir, name, manifest);

  for (const concept of concepts) {
    const term = concept.term?.trim() ?? "";
    if (!term || conceptIsPresent(term, result.prose, result.labels)) continue;
    warnings.push(
      `concept "${term}": not in the prose — use the word in the one-liner, feature tree, plain terms, or a lens so the popover has a place`,
    );
  }
  checkRefs(result.refFragments, warnings);
  await result.afterWrite?.();

  for (const w of warnings) console.error(`warning: ${w}`);
  for (const p of missing)
    console.error(`missing file (referenced but unreadable): ${p}`);
  console.log(
    JSON.stringify({
      html: out,
      filesEmbedded: Object.keys(store).length,
      serve: `node ${SELF} serve ${out}`,
    }),
  );
}

interface PlannerModel {
  normalizePlan(raw: unknown, warnings: string[], errors: string[]): unknown;
  taskLines(plan: unknown, lang: Lang): string[];
}

async function tasks(manifestPath: string) {
  const manifest = await readManifest(resolve(manifestPath));
  if (templateId(manifest) !== "planner") {
    console.error("tasks: only planner manifests have steps");
    process.exit(2);
  }
  const model = await importIfPresent<PlannerModel>("templates/planner/model.ts");
  if (!model) {
    console.error("tasks: planner model is not available");
    process.exit(2);
  }
  const warnings: string[] = [];
  const errors: string[] = [];
  const plan = model.normalizePlan(manifest, warnings, errors);
  for (const w of warnings) console.error(`warning: ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`manifest: ${e}`);
    process.exit(2);
  }
  const lang: Lang = manifest.lang === "en" ? "en" : "vi";
  for (const line of model.taskLines(plan, lang)) console.log(line);
}

function serve(file: string): Promise<void> {
  const child = spawn(process.execPath, [join(DIR, "serve.ts"), file, ...rest.slice(1)], {
    stdio: "inherit",
  });
  for (const sig of ["SIGINT", "SIGTERM"])
    process.on(sig, () => child.kill(sig));
  child.on("exit", (code) => process.exit(code ?? 0));
  return new Promise(() => {});
}

try {
  if (cmd === "render") {
    const flags = rest.filter((a) => a.startsWith("--"));
    const file = rest.find((a) => !a.startsWith("--"));
    if (!file) throw new Error("usage: render <manifest.json> [--check-sources]");
    await render(file, flags);
  } else if (cmd === "serve") {
    if (!rest[0]) throw new Error("usage: serve <file.html>");
    await serve(rest[0]);
  } else if (cmd === "tasks") {
    if (!rest[0]) throw new Error("usage: tasks <manifest.json>");
    await tasks(rest[0]);
  } else if (cmd === "templates") {
    printTemplates();
  } else if (cmd === "glossary") {
    const glossary = await loadGlossary();
    for (const w of glossary.warnings) console.error(`warning: ${w}`);
    process.stdout.write(formatGlossary(glossary));
  } else if (cmd === "playbook") {
    await playbook(rest[0]);
  } else {
    console.log(HELP);
    if (cmd && cmd !== "help" && cmd !== "--help" && cmd !== "-h")
      process.exitCode = 2;
  }
} catch (e) {
  console.error(`ns-explain: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(2);
}
