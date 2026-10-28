# ns-explain

Explain a code change in plain language, or plan work with sourced research,
then export one HTML file. This repository is both the user-level skill and the
`ns-explain` package.

The skill (`SKILL.md`) tells an agent how to read a commit, branch, or diff and
answer through three lenses (creational, structural, behavioral), or how to
research a request and write a plan. When the user also asks for a file, the
agent writes a JSON manifest and this CLI renders it into a fixed HTML page. The
agent never writes the HTML itself. The manifest field `template` picks the page
type: `reviewer` (default) or `planner`.

## Install the skill

```bash
synca skills install https://github.com/ngosangns/ns-explain
```

That copies the skill to `~/.agents/skills/ns-explain` and links it into each
agent.

Requirements:

- Node 22.18 or newer. It runs the TypeScript directly, no build step.
- `bun` on `PATH` for `render`. It bundles the diagram viewer into the page.
- Internet access when you open an export. The page loads Tailwind, DaisyUI,
  highlight.js, Cytoscape, and dagre from `cdn.jsdelivr.net`.

## Commands

The repository root is the package; its `bin` is `scripts/ns-explain.ts`. From a
checkout:

```bash
node scripts/ns-explain.ts templates
node scripts/ns-explain.ts playbook planner
node scripts/ns-explain.ts render .ns-explain/<name>.json
node scripts/ns-explain.ts serve .ns-explain/<name>.html
```

| Command | What it does |
| --- | --- |
| `help` (or no command) | Prints the command and manifest-field index. An unknown command prints the same index and exits with code 2. |
| `templates` | Lists the templates, with one line on when to use each. |
| `playbook [template]` | Without a template: lists the templates. With a template: prints the glossary, the shared rules (`scripts/playbook-shared.md`), and that template's `playbook.md` (manifest schema, authoring rules). Read it before writing a manifest. |
| `render <manifest.json> [--check-sources]` | Validates the manifest, bundles the viewer with `bun build`, and writes one self-contained HTML file. `--check-sources` also requests every `web` source URL of a planner manifest and warns about failures. |
| `tasks <manifest.json>` | Planner only. Prints the steps in dependency order, one per line, for a todo list. |
| `serve <file.html> [--port <n>] [--no-open]` | Serves the file's directory over HTTP and opens the browser. |
| `glossary` | Prints the terms to keep untranslated, merged from `~/.ns-explain/glossary.json` and `.ns-explain/glossary.json`, and the files they came from. |

### glossary

Pin terms that the agent must not translate, such as product or editor names:

```json
{ "keep": ["toolbar", "composer", "word document", "InteractiveEditor"] }
```

- `~/.ns-explain/glossary.json` applies to every repo on this machine.
  `.ns-explain/glossary.json` applies to the repo you run in. Both are read and
  added together; a term that appears twice (any letter case) is kept once.
- `playbook <template>` prints the list before the schema, and `SKILL.md` tells the agent to
  run `glossary` before it writes. When you ask the agent to stop translating a
  word, it adds the word to one of these files.
- A file that is missing is skipped. A file that is not valid JSON, or has no
  `keep` list, is skipped with a `warning:` line on stderr.
- The list is guidance for the agent. `render` does not check the manifest
  against it.

### render

- Output: `.ns-explain/<name>.html`, under the **current working directory**.
  `<name>` is the manifest's `name`, or the manifest filename without its
  extension, lowercased and reduced to `a-z0-9` and `-`.
- Every file referenced by a `data-path` in the prose fragments, a graph node or
  edge `path`, or the `files` list is read relative to the working directory
  and embedded in the page, so "View file" works offline from the file. Files
  that cannot be read are reported as `missing file` on stderr.
- stdout is one JSON line: `{"html": "...", "filesEmbedded": N, "serve": "..."}`.
- Problems are printed to stderr as `warning:` lines (dangling graph ids,
  `.ref` spans without `data-desc`, bare `<code>` identifiers, identifiers in
  features-only fields, concepts that never appear in the prose). The file is
  still written; fix the warnings and render again.
- A missing `title`, `oneLiner`, or `graph` exits with code 2.

### serve

- Binds to `127.0.0.1` only. The port is random unless you pass `--port`.
- The web root is the HTML file's directory; paths outside it return 403.
- Prints `serving <dir>` and the URL. Responses send `cache-control: no-store`,
  so a re-render shows up on reload.
- Opens the URL with `open` (macOS), `xdg-open` (Linux), or `start` (Windows)
  unless `--no-open` is set. Runs until you stop it (Ctrl-C or SIGTERM).
- There is no authentication; it is a local preview server.

## Manifest

`render` takes a JSON file, conventionally `.ns-explain/<name>.json`. Fields
marked `*` are required.

| Field | Meaning |
| --- | --- |
| `name` | Output file name. Defaults to the manifest filename stem. |
| `lang` | `"vi"` (default) or `"en"`. Sets section labels and the diagram legend. |
| `title`* | Document title. |
| `oneLiner`* | One-sentence summary. HTML fragment; may contain `.ref` spans. |
| `featureTree` | Nested `[{label, children, changes}]`. Each `changes` entry is `{kind: "added" \| "modified" \| "removed", text \| old + new, hunks: [{path, line, diff, explain}]}`. Features only, no identifiers. |
| `plainTerms` | HTML paragraphs in plain language. Features only. |
| `lenses` | `{creational, structural, behavioral}` HTML fragments. Components are named with `<span class="ref" data-path data-line data-desc>`. |
| `pseudocode` | `[{title, code}]`, one per flow. `code` is plain text. |
| `concepts` | `[{term, explain}]`. `render` wraps each term in the prose with a click popover. |
| `graph`* | The diagram, see below. |
| `theme` | `"system"` (default, follows the OS) or a DaisyUI theme name. |
| `extraHead` | Raw HTML appended to `<head>`, for project fonts or tokens. |
| `files` | Extra repo-relative paths to embed besides the auto-detected ones. |
| `testResults` | Optional, adds a last "Test results" section. Shape: `{command, environment?, scope: "full" \| "package" \| "related", scopeNote, passed, total, skipped?, failed: [{name, message}], earlier?: [{label, passed, total, failed, cause?}], files: [{path, line?, desc?, tests: [{kind: "added" \| "modified", name, line?, behavior}]}]}`. Use `{notRun: "reason", files}` when nothing was run. Counts must come from a run that really happened. `render` warns on `passed > total`, failures with all-pass counts, a test with no `behavior`, and an unreadable spec path. |

The diagram is a single graph; types are in `scripts/src/types.ts`:

- `nodes`: `{id, label, kind?, parent?, change?, desc?, path?, line?}`. `parent`
  groups nodes into a package container.
- `edges`: `{id, source, target, label?, decides?, path?, line?, change?}`.
- `flows`: `{id, title, steps: [{target, note}]}`. `target` is a node or edge
  id; steps replay as a highlight in the full-screen view.
- `change` is `added`, `modified`, `removed`, or `same` and sets the colour.
- `labels` overrides legend text.

The full contract lives in `scripts/playbook-shared.md` and
`scripts/templates/reviewer/playbook.md` (`ns-explain.ts playbook reviewer`).
The table above is the `reviewer` template. The planner fields are below.

## Templates

Each template is a page type with its own manifest schema, sections, and
playbook. Run `node scripts/ns-explain.ts templates` to list them.

### Reviewer

Explains a code change. Sections: summary, feature tree, plain terms, the three
lenses, interactive diagram, pseudocode flows, and test results. A manifest
without `template` is a reviewer manifest. The optional `plan` field holds the
path of a planner manifest that the change implements.

### Planner

Plans work before code exists. The agent researches the code base, docs, web,
and history, and records every source it reads. The page then shows the
evidence, the options, the decision, and the steps. Sections, in order:

1. Status strip (status, counts, total estimate, critical path).
2. Changes since the last render (only on a re-render).
3. Original request, with the clarifying questions and answers.
4. Starting point, with sourced facts.
5. Goals and non-goals, with acceptance criteria and step coverage.
6. Research: findings and sources, filtered by source kind.
7. Options and decision: score matrix, weighted totals, sensitivity.
8. Plan: phases, steps, estimates, critical path, dependency graph.
9. Risks: matrix, table, rabbit holes.
10. Charts, and the research coverage chart.
11. Open questions and assumptions.
12. Your decision: Approve or Request changes.

A trimmed manifest (the playbook has every field and the validation rules):

```json
{
  "template": "planner",
  "name": "order-page-size-plan",
  "lang": "vi",
  "title": "Kế hoạch tăng số dòng mỗi trang",
  "oneLiner": "Tăng giới hạn từ 10 lên 50 trong hai bước.",
  "status": "draft",
  "request": { "original": "Tăng số đơn hàng mỗi trang lên 50.", "summary": "Đổi giới hạn phân trang." },
  "sources": [
    { "id": "S1", "kind": "code", "title": "Giới hạn hiện tại", "path": "orders/list.ts", "line": 7, "quote": "const PAGE_SIZE = 10" }
  ],
  "findings": [
    { "id": "F1", "text": "Một hằng số quyết định số dòng.", "sources": ["S1"], "confidence": "high", "status": "verified" }
  ],
  "options": [
    { "id": "O1", "title": "Đổi hằng số", "summary": "Sửa một dòng.", "pros": ["Nhanh"], "cons": ["Không cấu hình được"] }
  ],
  "criteria": [{ "id": "C1", "label": "Công sức", "weight": 3 }],
  "scores": { "O1": { "C1": 5 } },
  "decision": { "chosen": "O1", "because": "Ít thay đổi nhất.", "drivers": ["F1"] },
  "phases": [
    { "id": "P1", "title": "Thay đổi", "goal": "Trang hiện 50 dòng.", "steps": [
      { "id": "T1.1", "title": "Đổi hằng số", "estimate": { "o": 1, "m": 1, "p": 2 }, "unit": "h", "verify": "bun test", "dependsOn": [] }
    ] }
  ],
  "questions": [
    { "id": "Q1", "text": "Có cần cấu hình theo người dùng không?", "blocking": true, "default": "Không", "options": ["Có", "Không"] }
  ]
}
```

Planner notes:

- Ids are stable strings: `S1` sources, `F1` findings, `G1` goals, `O1`
  options, `C1` criteria, `P1` phases, `T1.1` steps, `R1` risks, `Q1` questions,
  `A1` assumptions, `CH1` charts. The page compares two renders by id.
- A finding with no source is an `inference`. Estimates are PERT numbers
  (`o`, `m`, `p`) in one unit. Every step has a `verify` check.
- `render` stops with exit code 2 and writes nothing on a hard error: no
  `request` or `phases`, a `web` source without `url`, a duplicate id, a
  `decision.chosen` that is not an option, an unknown `dependsOn` id, or a
  dependency cycle. Other problems are `warning:` lines.
- Comments, answers, and the decision. Every block of the page has a
  `data-nsx-field` attribute with its manifest path, for example
  `phases[P1].steps[T1.2]`. A comment copies a `Field:` line with that path.
  Each open question has an answer box. The last section has Approve and
  Request changes buttons and a note. `Copy comments` copies one block with the
  comments, a `## Answers` list, and a `## Decision` with the verdict. The agent
  writes the answers into `questions[].answer`, edits the named fields, sets
  `status: "approved"` after an approve verdict, and renders again. The new page
  shows `Changes since the last render`.
- After approval, `tasks` gives the ordered steps for a todo list, and the agent
  updates each step `state` while it works.

## Example

`docs/examples/page-size/` holds a small manifest and the two source files it
points at. Render it from that directory, because paths in the manifest are
relative to the working directory:

```bash
cd docs/examples/page-size
node ../../../scripts/ns-explain.ts render page-size.json
node ../../../scripts/ns-explain.ts serve .ns-explain/page-size.html
```

This writes `docs/examples/page-size/.ns-explain/page-size.html`, which is not
ignored by `.gitignore`; delete it when you are done.

## Screenshots

Rendered from the example above in Chrome at 1440 px wide.

![Exported page scrolled to the Diagram and Flows sections](docs/screenshots/diagram.png)

The exported page, scrolled to the end of the lenses, the interactive diagram
(changed nodes and edges are coloured; the legend is below it), and the Flows
section. The page above these also holds the feature tree and plain-terms text.

![Feature popover showing a diff and its explanation](docs/screenshots/feature-popover.png)

Clicking a feature opens a popover with the diff that implements it and a
plain sentence about what that diff does.

![Full-screen diagram replaying a flow step by step](docs/screenshots/flow-replay.png)

The full-screen diagram. The side panel picks a flow and steps through it; the
current hop is highlighted on the graph.

## Review comments

Every exported page carries a comment layer, so feedback does not need a second
tool:

- Hover a paragraph, list item, heading, feature row, pseudocode block or the
  diagram: a comment icon appears to its right. On a touch screen, tap the block.
- The same works inside the boxes the page opens: a hunk in a feature's diff
  popover, the popover behind a dotted or dashed underline or a diagram element,
  and a line (or a selected span of lines) in the "View file" dialog. The icon
  sits in the top-right corner of that box.
- Select any text: a comment icon appears next to the selection. The selected
  text is quoted in the comment.
- The icon opens a small box. `Ctrl+Enter` (or `Cmd+Enter`) saves, `Escape`
  cancels. Reopen a commented place to edit or delete its comments.
- A commented block gets a bar on its left edge. The row or underlined word that
  opens a commented popover gets a dot, so you can see where comments are
  without opening anything.
- Comments live in memory only. Reloading the page drops them.
- The `Comments (n)` button, bottom right, opens the list in document order. Each
  entry shows its place, an excerpt, and the note, with `Jump to`, `Edit` and
  `Delete`. `Jump to` scrolls to the block, or reopens the popover or file that
  held the comment and flashes it. `Clear all` asks for a second click.
- The `Copy comments` button, next to it, copies all comments as plain text.
  Each entry has the section, the position inside it (paragraph number, feature
  path, popover, or file and line), an excerpt, the selected text, the files the
  block refers to, and the comment. Paste it into the agent, which edits the
  manifest and renders again.

Button and dialog text follow the manifest `lang` (`vi` or `en`). The buttons
move into an open dialog or popover, because those sit above the page.

## Layout

```
SKILL.md                         skill instructions for the agent (router)
scripts/ns-explain.ts            CLI dispatch: playbook, templates, render, serve, tasks, glossary
scripts/serve.ts                 local HTTP server used by `serve`
scripts/playbook-shared.md       shared rules, printed first by `playbook <template>`
scripts/core/                    shared code: html, concepts, refs, graph, charts, revision, l10n, shell
scripts/core/shell.html          fixed HTML shell filled in by `render`
scripts/templates/reviewer/      reviewer render, copy, playbook.md
scripts/templates/planner/       planner model, source check, render, copy, playbook.md
scripts/src/                     TypeScript viewer and page runtime, bundled by bun
scripts/*.test.ts                tests (run with `bun test`)
docs/                            example manifests and screenshots
```
