// The fixed page shell: head, header, file store, popovers, comment layer bundle. A template supplies only
// the sections between the header and the stores.

import { readFile, mkdtemp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { escHtml, escJson } from "./html.ts";
import type { Concept } from "./concepts.ts";
import { SHARED_COPY } from "./l10n.ts";
import type { Lang } from "./template.ts";

const CORE_DIR = dirname(fileURLToPath(import.meta.url)); // scripts/core/

const SYSTEM_THEME_SCRIPT = `<script>
  const themeQuery = matchMedia("(prefers-color-scheme: dark)");
  const applySystemTheme = () =>
    (document.documentElement.dataset.theme = themeQuery.matches ? "dark" : "light");
  applySystemTheme();
  themeQuery.addEventListener("change", applySystemTheme);
</script>`;

export interface ShellInput {
  lang: Lang;
  /** Report name, used by the comment layer in the copied report. */
  name: string;
  title: string;
  /** Concept-wrapped HTML for the header summary. */
  oneLiner: string;
  /** Every <section> after the header. */
  sections: string;
  /** Repo-relative path -> file body. */
  store: Record<string, string>;
  concepts: Concept[];
  theme?: string;
  extraHead?: string;
  /** Extra CSS, put in a <style> after the base styles. */
  css?: string;
  /** Merged into the #nsx-ui JSON. name, title and comments always come from the shell; `comments` is merged over the shared strings. */
  ui?: Record<string, unknown>;
}

// Build src/main.ts (diagram viewer + page runtime) to one IIFE and make it
// safe to drop inside <script>.
export async function clientBundle(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "nsx-"));
  const outfile = join(dir, "viewer.js");
  const built = spawnSync("bun", [
    "build",
    join(CORE_DIR, "..", "src/main.ts"),
    "--format=iife",
    "--target=browser",
    `--outfile=${outfile}`,
  ], { encoding: "utf8" });
  if (built.status !== 0) {
    const detail = (built.stderr || built.stdout || "bun build failed").trim();
    throw new Error(`could not build the viewer (bun is required): ${detail}`);
  }
  try {
    const js = await readFile(outfile, "utf8");
    return js.replace(/<\/(script)/gi, "<\\/$1");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** The finished HTML document: shell + sections + stores + bundle. */
export async function renderShell(input: ShellInput): Promise<string> {
  const shared = SHARED_COPY[input.lang];
  const fixedTheme = input.theme && input.theme !== "system";
  const map: Record<string, string> = {
    LANG: input.lang,
    TITLE: input.title,
    ONELINER: input.oneLiner,
    THEME_ATTR: fixedTheme ? ` data-theme="${escHtml(input.theme)}"` : "",
    THEME_SCRIPT: fixedTheme ? "" : SYSTEM_THEME_SCRIPT,
    EXTRA_HEAD: input.extraHead || "",
    CSS: input.css ? `\n<style>\n${input.css}\n</style>` : "",
    SECTIONS: input.sections,
    FILE_STORE: escJson(input.store),
    CONCEPTS: escJson(input.concepts),
    UI: escJson({
      viewFile: shared.viewFile,
      ...input.ui,
      name: input.name,
      title: input.title,
      comments: { ...shared.comments, ...(input.ui?.comments as Record<string, string> | undefined) },
    }),
  };

  const bundle = await clientBundle();
  // Split the raw shell at the bundle marker first. An embedded file (the renderer's own source, say) can
  // carry the same marker text, so a later search for it could hit the file store instead of this spot.
  // The bundle is joined in last, so a minified `@@` or `$&` inside it is never read as a token or pattern.
  const raw = await readFile(join(CORE_DIR, "shell.html"), "utf8");
  const at = raw.indexOf("@@NSX_BUNDLE@@");
  if (at < 0) throw new Error("shell.html has no @@NSX_BUNDLE@@ marker");
  const fill = (part: string) =>
    part.replace(/@@NSX_([A-Z_]+)@@/g, (_token: string, k: string) => map[k] ?? "");
  return fill(raw.slice(0, at)) + `<script>\n${bundle}\n</script>` + fill(raw.slice(at + "@@NSX_BUNDLE@@".length));
}
