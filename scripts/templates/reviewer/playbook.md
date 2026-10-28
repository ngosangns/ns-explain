# Reviewer template

Use `"template": "reviewer"` (or leave `template` out) to explain a code change.
The shared rules above (workflow, glossary, review comments, `.ref` contract,
concepts, graph DSL) apply to every field here.

## Field mapping for review comments

When a pasted comment has no `Field:` line, find the manifest field from the
section: `Tóm tắt`/`Summary` is `oneLiner`, the feature section is `featureTree`,
plain terms is `plainTerms`, the three lens sections are `lenses.*`, `Sơ đồ`/
`Diagram` is `graph`, flows are `pseudocode`, and `Kết quả test`/`Test results`
is `testResults`. The page marks these blocks with `data-nsx-field`, so a
comment normally carries the `Field:` line already.

## Manifest schema

```json
{
  "name": "order-page-size",
  "lang": "vi",
  "title": "Phân trang đơn hàng tăng lên 50",
  "oneLiner": "Change này tăng giới hạn mỗi trang từ 10 lên 50.",
  "featureTree": [
    {
      "label": "trang đơn hàng",
      "children": [
        {
          "label": "phân trang",
          "children": [
            {
              "label": "số dòng mỗi trang",
              "changes": [{
                "kind": "modified",
                "old": "giới hạn 10",
                "new": "giới hạn 50 mỗi trang",
                "hunks": [{
                  "path": "internal/orders/filter.go",
                  "line": 42,
                  "diff": "- const pageSize = 10\n+ const pageSize = 50",
                  "explain": "Mỗi trang liệt kê 50 đơn thay vì 10."
                }]
              }]
            }
          ]
        },
        {
          "label": "bộ lọc",
          "children": [
            {
              "label": "lọc theo ngày",
              "changes": [{
                "kind": "added",
                "text": "lọc đơn hàng theo ngày",
                "hunks": [{
                  "path": "internal/orders/filter.go",
                  "line": 58,
                  "diff": "+ if (from != null) keep(order)",
                  "explain": "Chỉ giữ đơn từ ngày đã chọn."
                }]
              }]
            }
          ]
        },
        {
          "label": "xuất file",
          "children": [
            {
              "label": "nút xuất CSV",
              "changes": [{
                "kind": "removed",
                "text": "nút xuất CSV cũ",
                "hunks": [{
                  "path": "internal/orders/export.go",
                  "line": 12,
                  "diff": "- button Export CSV",
                  "explain": "Bỏ nút xuất file cũ."
                }]
              }]
            }
          ]
        }
      ]
    }
  ],
  "plainTerms": "<p>Ai đó mở trang đơn hàng…</p><p>Họ thấy…</p>",
  "lenses": {
    "creational": "<p><span class=\"ref\" …>OrderFilter</span> được tạo…</p>",
    "structural": "<p>…</p>",
    "behavioral": "<p>…</p>"
  },
  "pseudocode": [
    { "title": "Lọc thành công", "code": "khi request đến:\n  nếu pageSize <= 50…" }
  ],
  "concepts": [
    { "term": "timeout", "explain": "Một cái đồng hồ đếm ngược. Hết giờ mà chưa xong thì dừng." }
  ],
  "testResults": {
    "command": "go test ./internal/orders/...",
    "environment": "go 1.22, linux",
    "scope": "package",
    "scopeNote": "Chạy toàn bộ test của package orders, không phải toàn repo.",
    "passed": 31, "total": 31, "skipped": 0, "failed": [],
    "earlier": [{
      "label": "Lần chạy đầu, trước khi sửa spec.",
      "passed": 29, "total": 31,
      "cause": "Test cũ còn giả định mỗi trang 10 dòng.",
      "failed": [{ "name": "TestPageSize/default", "message": "expected 10, got 50" }]
    }],
    "files": [{
      "path": "internal/orders/filter_test.go", "line": 12,
      "desc": "Test của bộ lọc đơn hàng.",
      "tests": [
        { "kind": "modified", "name": "TestPageSize/default", "line": 20, "behavior": "Trang đầu trả về 50 đơn thay vì 10." },
        { "kind": "added", "name": "TestFilterByDate", "behavior": "Chỉ giữ các đơn từ ngày đã chọn trở đi." }
      ]
    }]
  },
  "graph": { "labels": {}, "nodes": [], "edges": [], "flows": [] },
  "theme": "system",
  "extraHead": "",
  "files": []
}
```

Fields:

- `template` — omit or `"reviewer"`.
- `name` — output file name; defaults to the manifest filename stem.
- `lang` — `"vi"` (default) or `"en"`; drives section labels, the diagram
  legend, and the feature-tree group labels (Thêm/Sửa/Xóa vs
  Added/Modified/Removed).
- `title`, `oneLiner`, `graph` — required.
- `featureTree` — a nested tree, not a list grouped by added/modified/removed.
  Split until each leaf is the smallest thing a person can point at. The chat
  line that shows the change becomes `changes` on that node, not an extra
  child. Each node is `{label, children, changes}`. `changes` entries are
  `{kind:"added", text, hunks}`, `{kind:"modified", old, new, hunks}`, or
  `{kind:"removed", text, hunks}`. Features only — what the user sees and does.
  **No identifiers of any kind**: a config flag becomes its user-visible
  effect (`theo cờ cấu hình dịch vụ preview: tắt thì chụp ngay trên máy`),
  never `previewService`; a file is "ảnh preview", never `preview-utils.ts`.
  Text is plain (the renderer escapes it) — `render` warns when an item looks
  like code (camelCase, snake_case, `file.ext`, `a/b/c`, `foo()`, `data-*`),
  when the tree is flat or still grouped by change type, or when a leaf has
  no `changes`.
  Each level indents by one guide, and a long description wraps under its
  own text. Each item shows its own description on the row: modified is the old
  behavior struck, then the new one; added is the new behavior; removed is
  struck. A node that has source hunks on itself or under it is a text
  button. Click opens a popover of those relative hunks only — the unified
  diff that implements this item and the smaller items under it. A hunk that
  comes from a smaller item is named by its place under this item. Each hunk
  shows a plain sentence of what that diff does, then its repo path and the
  diff. The sentence is `explain`: one or two sentences a reader understands,
  in the document language, about this hunk only — not a repeat of the row.
  The item's own description stays on the row and is not repeated in the
  popover. Hover does not open it. Escape or a click outside closes it. A
  diff line that starts with `+` is green; a line that starts with `-` is
  red. Modified description text stays red then green. Removed description
  text stays struck and red. Added description text stays green. The Sửa
  badge is a red-to-green bar, not yellow.
  `hunks` is `[{path, line, diff, explain}]`. `path` is repo-relative.
  `line` is the line in the file after the change, when the hunk still has
  one. `diff` is the unified-diff body (` `, `+`, `-` lines) for that
  behavior. `explain` is plain text. Put each hunk on the smallest feature
  it implements, so a parent popover is the union and does not repeat the
  same lines. `render` warns when a change has no hunks, and when a hunk
  has no `explain`. Path and diff are code; they are not feature prose, so
  they do not count as identifier leaks. `explain` is feature prose, so it
  does.
- `plainTerms`, `lenses.*` — **HTML fragments**. `plainTerms` stays
  features-only like the feature tree — no `.ref` spans, no identifiers;
  technical naming (components with `.ref` spans) belongs to the lenses and
  the graph. `render` warns on identifier leaks in both fields.
- `pseudocode` — one entry per flow block from the chat reply; `code` is plain
  text rendered into a `<pre>`, comments in the document language, real
  condition values and names verbatim.
- `concepts` — words the user asked about. See "Concepts the user asked about" in the shared rules.
- `theme` — omit or `"system"` to follow `prefers-color-scheme`; set a daisyui
  theme name (`light`, `dark`, `luxury`, `nord`, …) only when the user asked
  for a fixed look or the project's design dictates one.
- `extraHead` — optional raw HTML appended to `<head>`: the project's font
  links, CSS variables, or design tokens when the subject project has its own
  design system (design-direction order: user request → subject project's own
  system → the template's Tailwind v4 + DaisyUI fallback, which needs nothing).
- `plan` — optional. Repo-relative path to a planner manifest (for example
  `.ns-explain/order-page-size-plan.json`) that this change implements. `render`
  shows which plan steps this change covers. Leave it out when no plan exists.
- `files` — extra repo-relative paths to embed in the file store. Paths already
  referenced by `.ref` spans or graph nodes are embedded automatically; list
  only what nothing references.
- `testResults` — optional; adds a **last** `<section>` titled "Kết quả test" /
  "Test results" after Flows. Include it only when the explained change added
  or edited tests; when absent, no section is rendered. Every number must come
  from a run that actually happened in this session.
  - Ran: `command` (verbatim), `environment` (optional), `scope` — `full` (whole
    repo/suite), `package` (the package or project holding the change), or
    `related` (only specific spec files) — plus `scopeNote`, a plain sentence
    on what the run covered. Then `passed`, `total`, optional `skipped`, and
    `failed: [{name, message}]` (empty list = none failed). The headline is the
    final run; an earlier failing run that a fix turned green goes in
    `earlier: [{label, passed, total, failed, cause}]` as history.
  - Not run: `{"notRun": "reason", "files": […]}` shows "Chưa chạy test" and the
    reason instead of numbers.
  - Changes: `files: [{path, line?, desc?, tests}]`, grouped by spec file
    (repo-relative `path`, rendered as a `.ref` that opens the file view at
    `line`). Each test is `{kind: "added"|"modified", name, line?, behavior}`:
    `name` is verbatim, `behavior` is one plain sentence of what the test checks
    (not a restatement of the name). A test with its own `line` is also a `.ref`.
    Spec files are embedded automatically.
  - Built from `h2`, `p`, `ul`/`li` only, so each part is commentable. `render`
    warns when `passed > total`, when failures are listed but counts say all
    passed, when a test has no `behavior`, and when a spec path is unreadable.

## Content rules (same as the chat reply)

- Reuse the chat content; do not re-derive from the diff.
- One concept per section; feature tree and plain terms name no files, no
  identifiers — the technical naming lives in the lenses and the graph.
  A change's `hunks` carry the path, the diff, and a plain `explain` of
  what that diff does. Path and diff are the one place code sits on the
  feature tree. `explain` names no files and no identifiers.
- Every flow from the reply ships as a `pseudocode` entry; the behavioral
  outcomes live in `graph.flows`.
- Test results: when the change touches tests, the last section reports the run
  honestly — real command, real counts, and whether the run was the full suite,
  the package, or only related specs. Never invent or round numbers; with no
  run, use `notRun` and say why. Each added or modified test states the
  behavior it checks, not its name again.
