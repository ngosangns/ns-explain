---
name: ns-explain
description: Two jobs with one CLI. (1) Explain a commit, a branch, or uncommitted changes like the reader is five, through creational, structural, and behavioral lenses, with pseudocode flows in chat and an interactive Cytoscape diagram in the HTML export, replying in whatever language the user asked in (Vietnamese by default when ambiguous). Use when the user runs /ns-explain, or asks to explain or review a commit, a branch, a diff, or uncommitted changes, including eli5, explain like I'm 5, giải thích cho dễ hiểu, tiếng Việt, creational, structural, behavioral, vẽ diagram. When the user asks what a concept means (giải thích khái niệm, từ này là gì), explain it in plain language and, in the HTML export, attach a click popover to each of those words. Also use when the user additionally wants the explanation saved or shared as a file — xuất file, export html, lưu lại, tạo file để xem lại, send this as a doc. (2) Plan work before coding: research the code base, docs, web, and history, then propose options, a decision, ordered steps, risks, and open questions, with sources cited. Use when the user asks for a plan, planning, lên kế hoạch, kế hoạch, design doc, spec, roadmap, "how should we build", or research then propose; the optional HTML export has answer boxes and an Approve / Request changes button. This skill does not open merge requests and is not tied to a forge; the HTML export is a standalone document, not a live browser review session.
---

# ns-explain

Two jobs: explain a code change so a newcomer understands it, and plan work
with sourced research. Reply simply enough for a five-year-old, in the
language the user asked in (default Vietnamese when ambiguous or when they
wrote in Vietnamese).

Do not push, commit, or open a review on a forge.

## Choose a template

| Situation | Template | Go to |
| --- | --- | --- |
| The user names a commit, a branch, a diff, or uncommitted changes and wants it explained or reviewed. | `reviewer` | `## Template: reviewer` |
| The user wants a plan, a design, a spec, a roadmap, or research followed by a proposal. | `planner` | `## Template: planner` |

Run `node <this skill's dir>/scripts/ns-explain.ts templates` to list the
templates. If the request fits both, plan first, then explain the change after
it exists. The reviewer manifest field `plan` links the two.

## Reply

Write every reply to the ASD-STE100 Simplified Technical English standard. When the reply language is not English (for example Vietnamese), apply the same STE writing rules to that language:

- One topic per sentence and one instruction per sentence.
- Short sentences: procedural sentences 20 words or fewer, descriptive sentences 25 words or fewer. Paragraphs of 6 sentences or fewer.
- Active voice. Use the simple tenses (present, past, future).
- Use approved, common words. Use one word for one meaning, and use the same word for the same thing every time. No synonyms for variety.
- Write instructions in the imperative ("Click Save."). Put a condition before the action ("If the token expires, open the sign-in page.").
- Use technical names and technical verbs only when they are necessary, and keep them consistent.
- No idioms, slang, jokes, or figurative language. No long noun clusters (more than 3 nouns); break them up.
- Use a vertical list for a sequence or for parallel items.

Short sentences in the reply language. Say what a person sees and does. Use the real names and numbers from the code. Do not turn the answer into a file list. Do not invent a Factory, Builder, or singleton the code does not have.

Do not abbreviate. Write every term in full — expand acronyms and shorthand in the explanation prose, even ones common in the codebase (`auth` → xác thực / authentication, `cfg` → configuration). Only code identifiers keep their exact spelling, since they are real names.

Respect ubiquitous language — both the domain's and the industry's. Words the codebase and its business use as shared vocabulary — entities, statuses, domain events, business terms — keep untranslated even when replying in another language, e.g. `Order`, `Settlement`, `PendingPayout` stay `Order`, `Settlement`, `PendingPayout`. The same holds for industry-common words — `ID`, `code`, `spinner`, `singleton`, `row`, `column`, `cache`, `token` — do not translate them either. Translate only the connective prose around them.

**Pinned terms (glossary).** The user can pin extra terms that must never be translated, such as product or editor names (`toolbar`, `composer`, `word document`). They live in two JSON files, merged: `~/.ns-explain/glossary.json` for every repo on this machine and `.ns-explain/glossary.json` in the repo you run in. Format: `{"keep": ["term", "multi word term"]}`.

- Before you write any reply, run `node <this skill's dir>/scripts/ns-explain.ts glossary` and keep every term it prints exactly as written, in the chat reply and in the manifest (titles, prose, labels, notes). `playbook <template>` prints the same list first.
- When the user asks you to stop translating a word, or to always use a word as written, add it to one of those files. Pick the repo file for a term that belongs to this project, and the user file for a term that applies everywhere. Create the file and the `.ns-explain` folder if they are missing, keep the existing terms, and say which file you changed. Do not put such a rule only in the chat or in a manifest: the next report would translate the word again.

## Template: reviewer

Explain a code change so a newcomer understands it. Always include the three
lenses and the pseudocode flows.

### What to read

The user names the target. If they do not, explain the uncommitted changes.

Use GitButler when `but` manages the repo. Otherwise use git.

- Uncommitted: `but diff`, or `git diff` and `git status`.
- One commit: `but show <commit>`, or `git show <commit>`.
- A branch: `but branch show <branch> -f` and `but diff <branch>`, or `git log <base>..<branch>` and `git diff <base>...<branch>`.

Read the changed files when the diff is truncated. Explain only what that diff shows. If nothing changed, say so and stop.

Learn the repo layout enough to know each component's package path (module or import path, e.g. `github.com/acme/internal/orders`, `packages/web`) and its path inside that package — use workspace manifests, package.json/go.mod names, and directory layout.

### Chat reply

Whenever you name a component from the code — a type, function, class, interface, variable, endpoint, table — also name its package path, its path inside that package, and the line it is defined on when you know it, e.g. `OrderFilter` (`github.com/acme/internal/orders`, `filter.go:42`). This applies wherever a component is named in the three lenses and the diagram nodes — not in the feature tree or "Nói cho dễ hiểu", which stay features-only.

1. One sentence: what the change is.
2. **Feature tree.** A nested tree of the features this change touches. Split it until each leaf is the smallest thing a person can point at — a screen, then the part of that screen, then the control, then the behavior. Do not group the tree by Thêm / Sửa / Xóa. Talk about features only — what the user can see or do — no technical details, no file names, no identifiers. The change sits on the smallest node: strike what was removed, and for a modification write `~~old behavior~~ → new behavior`. An added leaf is the new behavior itself. Example:

   ```
   Tính năng bị ảnh hưởng
   └── trang đơn hàng
       ├── phân trang
       │   └── số dòng mỗi trang
       │       └── ~~giới hạn 10~~ → giới hạn 50 mỗi trang
       ├── bộ lọc
       │   └── lọc theo ngày
       └── xuất file
           └── ~~nút xuất CSV cũ~~
   ```

3. **In plain terms** (label this "Nói cho dễ hiểu" when replying in Vietnamese). Two or three short paragraphs. Who does something, what appears, what happens next. Features only — no technical details, no file names, no identifiers; the technical naming belongs to the lenses below.
4. **Creational.** What is constructed, who constructs it, how many, the job it is given at birth, and when it is discarded. If the change only reuses an existing object, say so and name it.
5. **Structural.** Who talks to whom after the change. Name each hop and what that hop decides.
6. **Behavioral.** One short story per outcome the code can produce. Use the thresholds from the code. Describe states when the code has timers, pending ids, or explicit states.
7. **Flows.** No diagrams in chat — no Mermaid, no ASCII diagrams, no images; the interactive diagram lives only in the exported HTML document. For each flow the change touches, write a short `pseudocode` block that walks it step by step — plain-language steps and comments in the reply language, real condition values and names from the code:
   - Structural: one pseudocode pass over the path, one line per hop and what that hop decides.
   - Behavioral: one pseudocode block per outcome the code can produce.
   - Creational: describe birth and destroy in prose; no pseudocode needed.
8. **Concepts** — only when the user asks what a word or idea means (giải thích khái niệm, từ này là gì, explain this term). Do not invent concepts they did not name. Label the block "Khái niệm" when replying in Vietnamese, "Concepts" in English. For each word, two or three short sentences a newcomer can picture: what it is, and what a person sees. Those sentences are the popover body.

If this conversation already explained the change and the user only asks for the flows, the diagram, or a concept, produce just that and do not repeat the essay.

### Optional: export as an HTML artifact

Only do this when the user also asks to save, export, or share the explanation as a file (xuất file, export html, lưu lại, tạo file, send this as a doc) — a bare "explain this commit" stays chat-only, as above.

The exported document comes from a fixed template rendered by the skill's own CLI — never hand-write the HTML document, its CSS, or its wiring; you author only a JSON manifest. This is what keeps every export structurally identical. Do not invoke any other skill for this — the export workflow lives here.

1. Run `node <this skill's dir>/scripts/ns-explain.ts playbook reviewer` and read it end to end — it prints the shared rules, the manifest schema, the `.ref` component-reference contract, the diagram's JSON DSL, and the render/serve commands. Follow it.
2. Write the manifest to `.ns-explain/<short-kebab-name>.json` under the current working directory, reusing the content you already produced (one-liner, feature tree, plain-terms paragraphs, the three lenses, the pseudocode flows, the graph model, and any concepts the user asked about) — do not re-derive it from the diff a second time. Put each requested concept in `concepts` as `{term, explain}` where `explain` is the reply text from the Concepts block. The playbook owns that field: render wraps the words, so do not hand-write popover spans. If an export of this explanation already exists, add the concepts to its manifest and render again. If that export has no manifest, explain in chat and leave the HTML alone.
   - If the explained change adds or edits tests, also fill `testResults` (the report's last section; the playbook has the shape). Take every number from a test run that actually happened in this session: the real command, the real passed/total/skipped counts, the real failure messages. Never invent or round numbers. If no run happened, set `testResults.notRun` to the reason instead. State honestly whether the run was `full` (whole repo), `package` (the package holding the change), or `related` (only those specs), and say so in `scopeNote`. If an earlier run failed and a fix made it pass, keep that run in `earlier`. Each added or modified test gets its verbatim name and a sentence on the behavior it checks. Omit the field when the change touches no tests.
3. Run `node <this skill's dir>/scripts/ns-explain.ts render .ns-explain/<name>.json` — it builds the TypeScript diagram viewer and page runtime, packs that bundle into `.ns-explain/<name>.html`, and embeds every referenced file's body. The export is one HTML file. Fix anything it warns about and re-render.
4. Serve it: run `node <this skill's dir>/scripts/ns-explain.ts serve .ns-explain/<name>.html` as a background process. It serves the file's directory over a local HTTP server and opens the browser. Give the user the URL it prints. Stop it when the session ends.
5. Stop there. Deliver a finished exported document — no polling. The page has a built-in comment layer (hover a block or select text, then click the comment icon; this also works inside feature popovers, reference popovers and the file view). The `Comments` button lists them with jump, edit and delete, and the `Copy comments` button copies every comment with its position. When the user pastes that block back, treat each numbered comment as an edit to the manifest: change `.ns-explain/<name>.json` accordingly, render again, and keep the server running.

## Template: planner

Plan work before anyone writes code. Research first, then propose. Every claim
in the plan cites a source you really read.

### What to do

1. If the request is ambiguous, ask the user in chat first. Ask only what you cannot find yourself.
2. Research the code base, the docs, the web, and the history. Note each source as you read it.
3. Compare options against criteria. Choose one and say why.
4. Split the work into steps. Each step is small enough for one commit and has a check.

Do not change code while you plan. Do not write a plan from memory.

### Chat reply

1. One sentence: the goal.
2. What I found. Name the sources: file and line, document, URL, command, earlier commit.
3. Options and the choice. Two or three sentences on why this option wins.
4. Steps in order. One line each, with the check for each step.
5. Risks. One line each, with the way to reduce it.
6. Open questions the user must answer. Say what you will assume if they do not answer.

Mark a claim you did not verify as an inference.

### Optional: export as an HTML artifact

Do this when the user asks for a file, a document to share, or a page to approve (xuất file, export html, lưu lại, gửi cho team). A plan with many steps SHOULD get the export: the page holds the sources, the matrix, and the answer boxes.

1. Run `node <this skill's dir>/scripts/ns-explain.ts playbook planner` and read it end to end. It prints the glossary, the shared rules, and the planner schema. Follow it.
2. Write the manifest to `.ns-explain/<short-kebab-name>.json` with `"template": "planner"`. Reuse the research you already did. Do not read the sources a second time.
3. Run `node <this skill's dir>/scripts/ns-explain.ts render .ns-explain/<name>.json`. Add `--check-sources` when the plan cites web pages. Fix every warning and render again.
4. Run `node <this skill's dir>/scripts/ns-explain.ts serve .ns-explain/<name>.html` as a background process. Give the user the URL it prints.
5. Review loop. The user answers the open questions on the page, comments on any block, and presses Approve or Request changes. They paste the copied block back. It has `Field:` lines, `## Answers`, and `## Decision`. Write each answer into `questions[].answer`. Resolve each comment by editing the field it names. Set `status: "approved"` only after an `approve` verdict and when no blocking question lacks an answer. Render again. The page lists the changes since the last render. Keep the server running.
6. After approval, run `node <this skill's dir>/scripts/ns-explain.ts tasks .ns-explain/<name>.json` and load the steps into your todo list in dependency order. Update each step `state` in the manifest while you work.
