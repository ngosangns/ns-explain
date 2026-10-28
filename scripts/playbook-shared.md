# ns-explain artifact playbook

Fetched on demand by `ns-explain.ts playbook <template>` — read it fully before
writing a manifest. This file holds the rules every template shares. The
template's own playbook follows it. The exported HTML document comes from a
**fixed template** (`scripts/core/shell.html` plus the section code of the
template named in the manifest field `template`, default `reviewer`): the
renderer injects a JSON manifest you write; you never author the HTML shell, its
CSS, or its wiring. The diagram viewer and the page runtime are TypeScript.
`render` builds them and packs the bundle into the HTML, so the export is one
file. This is what keeps every export structurally identical — only the content
varies.

Templates: run `ns-explain.ts templates` to list them. `reviewer` explains a
code change. `planner` plans work.

## Workflow

1. Write `.ns-explain/<short-kebab-name>.json` under the current working
   directory (schema in the template playbook below). Set `"template"` to the
   template id; leave it out for `reviewer`. For a reviewer report, reuse the
   chat content — one-liner, feature tree, plain terms, the three lenses, the
   pseudocode flows, the graph model. Do not re-derive it from the diff.
2. `node <this skill's dir>/scripts/ns-explain.ts render .ns-explain/<name>.json`
   — builds the TypeScript viewer, writes one `.ns-explain/<name>.html` with
   that bundle inlined, and embeds every referenced file's body into the file
   store. Read its stderr and re-render until it is clean: `warning:` lines
   cover broken graph references (duplicate ids, dangling edge/flow targets),
   `.ref` contract violations (missing `data-desc`, non-numeric `data-line`, a
   label that looks like a path), a bare `<code>identifier</code>` that should
   be a `.ref`, and the checks of the template (the reviewer warns on
   identifier leaks into features-only fields); `missing file` lines mean a
   referenced file could not be read. A missing required field, an unknown
   `template`, or a template that is not available stops `render` with exit
   code 2.
   Render needs `bun` on PATH to build the viewer. `render` also keeps the
   previous manifest of the same name in `.ns-explain/.history/` so a template
   can show what changed since the last render.
3. `node <this skill's dir>/scripts/ns-explain.ts serve .ns-explain/<name>.html`
   as a background process — serves the directory and opens the browser. Give
   the user the URL it prints. Stop it when the session ends. No polling.
4. When the user pastes review comments back (see "Review comments"), apply
   each to the manifest and run step 2 again.

## Terms to keep untranslated — the glossary

Some words must stay as written whatever the report language: product, editor
and domain names such as `toolbar`, `composer` or `word document`. Pin them in a
glossary instead of repeating the rule in each chat:

- `~/.ns-explain/glossary.json` applies to every repo on this machine.
- `.ns-explain/glossary.json` applies to the repo you run in (the working
  directory, next to the manifests).
- Format: `{"keep": ["toolbar", "word document", "InteractiveEditor"]}`. A term
  can hold several words. Both files are read and the lists are added together;
  a term that appears twice (any letter case) is kept once, with the spelling of
  the user file.

`ns-explain.ts glossary` prints the merged list and which files it came from;
`playbook` prints the same list before this text. When the list is not empty,
keep every term exactly as written in the `title`, `oneLiner`, feature tree,
plain terms, lenses, pseudocode comments, graph labels and notes, and `concepts`.

**If the user asks you to stop translating a word, add it to the glossary.**
Use the repo file for a project term and the user file for a general one. Create
the file and the `.ns-explain` folder if they are missing, keep the terms that
are already there, and tell the user which file you changed. Do not leave the
rule only in the chat or in a manifest: the next report would translate the
word again. A broken file is skipped with a `warning:` line on stderr, so run
`glossary` after you edit it.

## Review comments

Every export includes a comment layer; it needs no manifest field. The reader
hovers a block (or selects text) and clicks the comment icon, writes a note, and
copies all notes with the bottom-right button. Comments can also be made inside a
feature's diff popover, a reference popover, and the "View file" dialog. Some
templates add inputs to the page (a planner answer box, a decision with a
verdict). The copy button also works when the reader has only answers or a
verdict and no comment. The pasted block looks like:

```
# Review comments on "<title>"
Report: .ns-explain/<name>.html (manifest: .ns-explain/<name>.json)
2 comments. Apply each one to the manifest, then render again.

## 1. <section> › <position>
Field: <manifest path>
Block: "<excerpt of the block>"
Selected: "<quoted text, when the comment was made on a selection>"
Files: <path:line, ...>
Comment: <the reader's note>

## Answers
### 1. <question text>
Field: questions[Q1]
Answer: <value>

## Decision
Verdict: approve | request-changes
Note: <text>
```

- `Field:` names the manifest path of the block (`oneLiner`, `featureTree`,
  `lenses.creational`, `pseudocode[0]`, `questions[Q1]`, `phases[P1].steps[T1.2]`).
  The line is there when the page knows the field. Change that field in the
  manifest. When there is no `Field:` line, find the field from the section name
  (the template playbook has a field mapping) and match the paragraph by its
  `Block` excerpt, since `Paragraph N` counts only the commentable paragraphs in
  that section.
- `## Answers` lists the answers the reader typed on the page. Apply each one to
  the manifest: set `questions[].answer` for the question named by `Field:`. Then
  render again.
- `## Decision` holds the verdict. `approve` means the reader accepts the
  document. `request-changes` means it needs work: treat its `Note:` like a
  comment and change the manifest to match it. Do not treat the verdict as an
  answer to a question.

Comments made inside a box are marked by their position text:

- `<feature path> › <file>:<line>` is one hunk of that feature's popover. Change
  that `hunks[].diff` or `hunks[].explain` in `featureTree`.
- `Giải thích chi tiết: <name>` / `Detail popover: <name>` is the popover of a
  component. Change the `data-desc` of that `.ref` span, or the `desc` of that
  graph node or edge.
- `Xem file › <path>:<line>` / `File view › <path>:<line>` is a line of the
  embedded source. The file is not part of the manifest: the comment is about
  the code itself, or about which line a `.ref` should point at (`data-line`).

Do not edit the rendered HTML; change the manifest and render again.

## Naming components in prose — the `.ref` contract

In fragment fields (reviewer: `oneLiner`, `lenses.*`; planner: the HTML fields), **every named component — variable,
function, class, interface, constant, field, parameter — is a `.ref` span**,
never a bare `<code>` (the renderer warns on `<code>identifier</code>`). The
path stays out of the sentence:

```html
<span class="ref" tabindex="0"
      data-path="internal/orders/filter.go"
      data-line="42"
      data-desc="Quyết định đơn hàng nào khớp bộ lọc; dùng ở mọi nơi liệt kê đơn.">OrderFilter</span>
```

- `data-path` — path relative to the repo root (the cwd `render` runs in).
  **Required on every `.ref`** — every popover shows path + description + View
  file. Platform APIs and built-ins (`AbortController`, `setTimeout`, pdf.js
  objects) point at the closest repo call site, and `data-desc` says they are
  platform APIs.
- `data-line` — the line where the symbol is defined; set it whenever the span
  names a symbol.
- `data-desc` — the component's general job, not just its role in this change.
- The span's visible text is the component's display name **only** — never
  `file.ts:71` or `pkg/foo`. Two same-named components keep the same label
  (`withTimeout` … `withTimeout`); the popover's path disambiguates them, and
  you may name the area in plain prose outside the span ("phía portal", "phía
  renderer pdf"). A `.ref` that names a *file* itself (a spec file) keeps its
  filename as the label — that is the file's name, not a location leak.
  `render` warns when a label looks like a path.
- Click shows the popover (path + desc + "View file"). Hover does not. "View
  file" opens the file dialog syntax-highlighted, scrolled to `data-line`.
- The renderer reads every file a `data-path` or graph `path` points at and
  embeds it — write the span, never the file body.

## Concepts the user asked about — `concepts`

Only when the user asked what a word or idea means. Each `explain` is the
Concepts reply text, not a second definition. Do not hand-write popover
spans; `render` wraps the words. `render` warns on a hand-written `.term`.

```json
"concepts": [
  { "term": "timeout", "explain": "Một cái đồng hồ đếm ngược. Hết giờ mà chưa xong thì dừng." }
]
```

- `term` — the word as it should be found in the prose. Matching is
  case-insensitive and whole-word, so `timeout` also wraps `Timeout` and does
  not wrap `setTimeout`. A longer term wins over a shorter one inside it
  (`page size` before `page`).
- `explain` — plain text, one short paragraph. No file names.
- `render` wraps each match in the prose of the template (reviewer: the
  one-liner, the feature tree, the plain terms, and the three lenses). It does
  not wrap inside a `.ref`, a `.term`, `<code>`, or `<pre>`, so pseudocode stays
  plain.
- Click opens the popover with that explanation. Hover does not. Closing
  matches `.ref`: click the word again, click outside, or press Escape.
- A `.ref` or a diagram node or edge whose label is exactly that word keeps
  its own popover and adds this explanation under it.
- `render` warns when an entry lacks `term` or `explain`, is listed twice, or
  never appears. A code name that is already a `.ref` or diagram label counts
  as appearing — do not push it into the prose just to host the popover.

## `graph` — the interactive diagram DSL

Exactly one graph models the whole change; the viewer's built-in lens switcher
moves between structural, creational, and behavioral views of the *same*
elements. Never several diagrams, never Mermaid/SVG/images.

```json
{
  "labels": { "structural": "Structural", "creational": "Creational", "behavioral": "Behavioral" },
  "nodes": [
    { "id": "orderFilter", "label": "OrderFilter", "kind": "class",
      "parent": "pkgOrders", "lens": ["structural", "creational"],
      "change": "modified", "desc": "Quyết định đơn nào khớp bộ lọc.",
      "path": "internal/orders/filter.go", "line": 42 },
    { "id": "pkgOrders", "label": "internal/orders", "kind": "package" }
  ],
  "edges": [
    { "id": "e1", "source": "handler", "target": "orderFilter",
      "label": "gọi", "decides": "nhận hay bỏ đơn",
      "lens": ["structural", "behavioral"], "change": "added" }
  ],
  "flows": [
    { "id": "happy", "title": "Lọc thành công",
      "steps": [
        { "target": "e1", "note": "HTTP nhận request" },
        { "target": "orderFilter", "note": "pageSize <= 50 thì nhận" }
      ] }
  ]
}
```

- Every node is a real component, `label` is its verbatim name; `parent` groups
  nodes into package/module compounds. Compounds stay open and do not open the
  popover. `path` + `line` on a child node fill the click popover and the View
  file dialog at the symbol's definition.
- `lens` lists which lenses show the element. Structural = who talks to whom
  (edge `label` names the hop, `decides` says what it decides); creational =
  what is constructed/discarded (`kind`, creation edges like `"tạo"`/`"hủy"`);
  behavioral = one `flows` entry per outcome, `steps` replayed as an animated
  highlight with a per-step caption.
- `change` drives color: `added` green, `modified` amber, `removed` red dimmed
  + dashed (always visible — before/after in one view), `same` neutral.
- `labels`, node `desc`, edge `label`/`decides`, and flow `note`s are in the
  document language; identifiers stay verbatim. The renderer sets the legend
  language from `lang`.
- The viewer shows **one merged graph** — there is no lens switcher and no
  separate per-lens diagrams; every element is always on the canvas. (The
  `lens` field is ignored now.) A drag with the left or the wheel (middle)
  mouse button pans the graph, including one that starts on a node, edge, or
  package container. The wheel scrolls the
  page. Cmd/Ctrl + scroll zooms the graph. A fullscreen button on the canvas
  opens a dialog that fills the browser tab with this same diagram. The flow
  controls and the step list are hidden until that dialog is open, where they
  sit in a panel on the right and the graph keeps the remaining width.
  Package containers still stay open.
- Click a child node or an edge → the `.ref` popover (name, path, desc,
  **structural relations** — its incoming/outgoing hops — and View file).
  A package/module container does not open the popover. Clicking one closes
  an open popover and clears the focused node or edge: the click highlight
  and the active flow step. Hover does not open it. Click the same element
  again, or click empty canvas, to close the popover.
  A drag pans; it does not move the node. In the fullscreen dialog, the flow
  panel replays `flows` step by step.
- Child nodes and edges carry `path` + `line` so the popover is complete:
  nodes point at the symbol's definition, edges point at the **call site** —
  the source node's file/line where the hop happens. `render` warns on any
  element without one.
