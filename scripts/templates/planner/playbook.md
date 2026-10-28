# Planner template

Use `"template": "planner"` to plan work before anyone writes code. The shared
rules above (workflow, glossary, `.ref` contract, concepts, review comments,
render and serve) apply to every field here.

## When to use the planner

Use the planner when the user asks for a plan, a design, a spec, a roadmap, or
for research followed by a proposal ("how should we build X", "lên kế hoạch",
"kế hoạch", "design doc"). Use the `reviewer` template when the code change
already exists.

## Workflow: research first

Do the steps in this order. Do not write a plan from memory.

1. Read the request. If it is ambiguous, ask the user in chat first. Ask only
   what you cannot find yourself. Record each answer in
   `request.clarifications` with `by: "user"`. Record each guess with
   `by: "assumed"`.
2. Research the code base, the docs, the web, and the history (commits,
   earlier sessions). Add a `source` the moment you read something. Do not add
   sources later from memory.
3. Write `findings`. Each finding cites one or more sources.
4. Write `options`, `criteria`, and `scores`.
5. Write the `decision`. Name the findings that drive it.
6. Write `phases` and `steps`.
7. Write `risks`, `questions`, and `assumptions`.
8. Write `.ns-explain/<name>.json`.
9. Run `ns-explain.ts render .ns-explain/<name>.json`. Fix every warning.
   Render again.
10. Run `ns-explain.ts serve .ns-explain/<name>.html` and give the user the URL.

## Manifest schema

IDs are stable strings. Never renumber an id after a render: the page compares
the new render with the previous one by id.

| Kind | Id |
| --- | --- |
| source | `S1`, `S2`, ... |
| finding | `F1`, ... |
| goal | `G1`, ... |
| option | `O1`, ... |
| criterion | `C1`, ... |
| phase | `P1`, ... |
| step | `T1.1`, `T1.2`, `T2.1`, ... (phase number, then step number) |
| risk | `R1`, ... |
| question | `Q1`, ... |
| assumption | `A1`, ... |
| chart | `CH1`, ... |

```json
{
  "template": "planner",
  "name": "order-page-size-plan",
  "lang": "vi",
  "title": "Kế hoạch tăng số dòng mỗi trang đơn hàng",
  "oneLiner": "HTML summary, may hold .ref spans.",
  "status": "draft",
  "request": {
    "original": "The user's words, verbatim.",
    "summary": "One short paragraph.",
    "constraints": ["No API change"],
    "clarifications": [{ "q": "Question you asked", "a": "Answer", "by": "user" }]
  },
  "starting": {
    "summary": "HTML: how things are now.",
    "facts": [{ "text": "HTML, may hold .ref", "sources": ["S2"] }]
  },
  "goals": [{ "id": "G1", "text": "Goal", "acceptance": ["WHEN … THE SYSTEM SHALL …"] }],
  "nonGoals": ["What this plan does not do"],
  "sources": [
    { "id": "S1", "kind": "web", "title": "Page title", "url": "https://…", "retrieved": "2026-10-28", "quote": "Short verbatim quote" },
    { "id": "S2", "kind": "code", "title": "Where the limit lives", "path": "repo/relative.ts", "line": 7, "quote": "const LIMIT = 10" },
    { "id": "S3", "kind": "command", "title": "Test run", "command": "bun test", "output": "44 pass" },
    { "id": "S4", "kind": "doc", "title": "Design note", "path": "docs/x.md", "line": 3 },
    { "id": "S5", "kind": "user", "quote": "What the user said" },
    { "id": "S6", "kind": "history", "title": "Earlier commit", "ref": "abc123", "quote": "Short quote" }
  ],
  "findings": [
    { "id": "F1", "text": "HTML", "sources": ["S1"], "confidence": "high", "status": "verified" }
  ],
  "options": [
    { "id": "O1", "title": "Option", "summary": "One sentence", "pros": ["…"], "cons": ["…"], "rejectedBecause": "Required for every option the decision does not choose" }
  ],
  "criteria": [{ "id": "C1", "label": "Effort", "weight": 3 }],
  "scores": { "O1": { "C1": 4 } },
  "decision": {
    "chosen": "O1",
    "because": "Why, in two or three sentences",
    "drivers": ["F1"],
    "consequences": [{ "text": "What follows", "tone": "good" }]
  },
  "phases": [
    {
      "id": "P1",
      "title": "Phase",
      "goal": "What is true when the phase ends",
      "steps": [
        {
          "id": "T1.1",
          "title": "Step",
          "detail": "HTML",
          "files": ["repo/relative.ts:7"],
          "dependsOn": [],
          "estimate": { "o": 1, "m": 2, "p": 4 },
          "unit": "h",
          "verify": "How to check the step is done",
          "owner": "agent",
          "state": "todo",
          "goals": ["G1"]
        }
      ]
    }
  ],
  "risks": [{ "id": "R1", "text": "…", "likelihood": 2, "impact": 4, "mitigation": "…", "steps": ["T1.1"] }],
  "rabbitHoles": ["A topic that looks useful but eats time"],
  "questions": [
    { "id": "Q1", "text": "Question for the user", "blocking": true, "default": "Used if the user does not answer", "options": ["Yes", "No"], "answer": "Set after the user answers" }
  ],
  "assumptions": [{ "id": "A1", "text": "…", "checkBy": "How and when to check" }],
  "charts": [
    { "id": "CH1", "kind": "bar", "title": "…", "unit": "ms", "x": ["a", "b"], "series": [{ "name": "…", "values": [1, 2] }], "source": "S3" }
  ],
  "concepts": [],
  "files": [],
  "theme": "system",
  "extraHead": ""
}
```

Required fields: `title`, `oneLiner`, `request`, `phases`. Every other field is
optional. HTML fields are `oneLiner`, `starting.summary`, `starting.facts[].text`,
`findings[].text`, and `steps[].detail`. Name components there with `.ref` spans
as the shared rules say.

Enums:

| Field | Values |
| --- | --- |
| `status` | `draft` (default), `approved`, `in-progress`, `done` |
| `request.clarifications[].by` | `user`, `assumed` (default) |
| `sources[].kind` | `web`, `code`, `command`, `doc`, `user`, `history` |
| `findings[].confidence` | `high`, `medium` (default), `low` |
| `findings[].status` | `verified`, `inference` (default) |
| `decision.consequences[].tone` | `good`, `bad`, `neutral` (default) |
| `steps[].owner` | `agent` (default), `user` |
| `steps[].state` | `todo` (default), `doing`, `done`, `blocked` |
| `charts[].kind` | `bar`, `stacked`, `line`, `scatter` |

Source fields by kind: `web` needs `url` and should have `retrieved`
(`YYYY-MM-DD`). `code` and `doc` need `path`, with `line` if you know it.
`command` needs `command`, with `output`. `user` and `history` use `quote` and
`ref`. Every kind can hold `title` and `quote`.

## Validation

`render` prints each problem as `warning: <path>: <message>` on stderr and still
writes the file. These are hard errors: `render` prints `manifest: <error>`,
writes nothing, and exits with code 2.

Hard errors:

- The manifest is not a JSON object, or `request` or `phases` is missing.
- A `web` source has no `url`.
- Two items in one list share an id.
- `decision.chosen` is not an option id.
- A step `dependsOn` an unknown step id.
- Steps depend on each other in a cycle (`dependency cycle T1.1 -> T1.2 -> T1.1`).

Warnings to fix before you show the plan:

- An item has no `id`, or a value is not in its enum (the default is used).
- A `code` or `doc` source has no `path`. A `command` source has no `command`.
- A finding has no sources (`no sources`), or an id points to nothing
  (`unknown source id "S9"; dropped`).
- A source is never cited by a finding, a fact, or a chart.
- A goal has no acceptance criteria. No step covers a goal.
- A `score` is missing, is not a whole number from 1 to 5, or names an unknown
  option or criterion. A criterion weight is not greater than 0.
- `decision.chosen` is empty. `decision.drivers` is empty. A rejected option has
  no `rejectedBecause`.
- A step has no `verify`.
- An estimate is not `o <= m <= p`, or a value is not positive. Steps use mixed
  units.
- A blocking question has no `default`.
- `status` is not `draft` while a blocking question has no answer. `status` is
  `done` while a step is not `done`.
- A chart has no `source`, or its source id is unknown.
- A `[S9]` or `[F9]` id in an HTML field that does not exist.
- Bare `<code>` identifiers and `.ref` spans without `data-desc` (shared rules).

`render --check-sources` also sends a request to every `web` source URL. It
prints `warning: source S1 <url> -> 404` for each URL that fails and one line
`sources checked: N ok, M failed`. Use it before you show a plan with web
sources.

## Authoring rules

- A finding without a source is an `inference`. Set `status: "inference"` and
  lower `confidence`. Set `verified` only when a source proves the finding.
- Keep each `quote` short. Copy it verbatim from the source. Do not paraphrase
  inside a quote.
- Add `retrieved` to every web source. Cite only what the page says.
- Scores are whole numbers from 1 to 5. A higher score is better for the
  criterion. Weights are positive whole numbers. Score every option on every
  criterion.
- Name the option you did not choose and say why in `rejectedBecause`.
- Every step has `verify`: one check a person or a command can do. Write the
  command or the visible result.
- Make each step small enough for one commit.
- Estimates are PERT numbers `o` (best case), `m` (most likely), `p` (worst
  case) in one unit for the whole plan. The default unit is `h`.
- A chart number needs a `source`. Take the number from a source you recorded.
- Write acceptance criteria in the form `WHEN <event> THE SYSTEM SHALL <result>`.
- Write a blocking question only when the plan cannot go on without the answer.
  Give it a `default`.
- Do not hide bad consequences. Use `tone: "bad"`.

## Review loop

The page shows a box for each open question. The user can answer them, comment
on any block, and press `Approve` or `Request changes`. The `Copy comments`
button copies everything. The user pastes the block back to you.

The block has these parts:

- Comment entries. A `Field:` line names the manifest field, for example
  `Field: phases[P1].steps[T1.2]`.
- `## Answers`: one entry per answered question, with `Field: questions[Q1]`
  and `Answer:`.
- `## Decision`: `Verdict: approve` or `Verdict: request-changes`, and `Note:`.

Do this for each part:

1. Write each answer into `questions[].answer` for the question named in `Field:`.
2. Resolve each comment. Change the field named in `Field:`. If a comment has no
   `Field:` line, find the block from its section and quote.
3. Set `status: "approved"` only after a `Verdict: approve` and when no blocking
   question lacks an answer. After `request-changes`, keep `draft`.
4. Run `render` again. The page now shows `Changes since the last render` with
   every id that changed. Keep the server running.

## Execution

After approval, run `ns-explain.ts tasks .ns-explain/<name>.json`. It prints the
steps in dependency order, one per line. Load them into your todo list.

While you work:

- Set `status: "in-progress"` when the first step starts.
- Set each step `state` to `doing`, `done`, or `blocked` as it changes.
- Set `status: "done"` only when every step is `done`.
- Render again when the user wants to see progress.

To show the code that implements the plan, set `plan` in the reviewer manifest
to the path of the plan, for example `"plan": ".ns-explain/order-page-size-plan.json"`.
The reviewer page then shows which plan steps the change covers.

## Minimal example

This manifest is valid and gives zero warnings.

```json
{
  "template": "planner",
  "name": "rename-config-key",
  "lang": "en",
  "title": "Rename the retry config key",
  "oneLiner": "Rename <code>retries</code> to <code>maxRetries</code> in one commit.",
  "status": "draft",
  "request": {
    "original": "Rename the retries key in the config.",
    "summary": "Rename one config key."
  },
  "goals": [
    { "id": "G1", "text": "The key has the new name.", "acceptance": ["WHEN the app starts THE SYSTEM SHALL read maxRetries"] }
  ],
  "sources": [
    { "id": "S1", "kind": "code", "title": "Config reader", "path": "src/config.ts", "line": 12, "quote": "retries: number" }
  ],
  "findings": [
    { "id": "F1", "text": "One file reads the key.", "sources": ["S1"], "confidence": "medium", "status": "inference" }
  ],
  "phases": [
    {
      "id": "P1",
      "title": "Rename",
      "goal": "The new key works.",
      "steps": [
        {
          "id": "T1.1",
          "title": "Rename the key",
          "detail": "Change the key in the config reader.",
          "dependsOn": [],
          "estimate": { "o": 1, "m": 1, "p": 2 },
          "unit": "h",
          "verify": "Run bun test. All tests pass.",
          "goals": ["G1"]
        }
      ]
    }
  ]
}
```
