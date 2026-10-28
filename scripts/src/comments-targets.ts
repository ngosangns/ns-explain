// Where a comment can attach in the exported page, and how to describe, mark and
// reveal that place again. A target is what the pointer is over; an anchor is the
// snapshot a comment keeps.
import type { Anchor, CommentStrings, Target } from "./comments-types.ts";

const EXCERPT_LIMIT = 200;
const FLASH_MS = 1600;

// Plain page blocks. Anything inside a popover or dialog is resolved separately.
const BLOCK_SELECTOR = [
  "main > header h1",
  "main > header p",
  "main > section > h2",
  "main > section p",
  "main > section li:not(.ft-item):not(.ft-hunk)",
  "main > section .ft-item > .ft-row",
  "main > section figure",
  "main [data-nsx-field]",
].join(",");

export const squash = (s: string) => s.replace(/\s+/g, " ").trim();

export function cut(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

export function elementOf(node: Node | null): Element | null {
  if (!node) return null;
  return node instanceof Element ? node : node.parentElement;
}

const hostOf = (node: Element): HTMLElement => node.closest<HTMLElement>("dialog") ?? document.body;

/** Text of `node` without the parts matching `drop` (popover bodies, buttons, scripts). */
function textWithout(node: Element, drop: string): string {
  const copy = node.cloneNode(true);
  if (!(copy instanceof Element)) return "";
  copy.querySelectorAll(drop).forEach((n) => n.remove());
  return squash((copy.textContent ?? "").replace(/\u200b/g, ""));
}

function flash(node: Element): void {
  node.classList.remove("nsx-c-flash");
  void (node as HTMLElement).offsetWidth;
  node.classList.add("nsx-c-flash");
  window.setTimeout(() => node.classList.remove("nsx-c-flash"), FLASH_MS);
}

export function scrollAndFlash(node: Element): void {
  node.scrollIntoView({ block: "center" });
  flash(node);
}

function sectionHeading(from: Element | null): string {
  return squash(from?.closest("section")?.querySelector(":scope > h2")?.textContent ?? "");
}

/** Manifest path of the innermost `data-nsx-field` at or above `from`, inside `main`. */
function fieldOf(from: Element | null, main: Element): string {
  const holder = from?.closest<HTMLElement>("[data-nsx-field]");
  return holder && main.contains(holder) ? (holder.dataset.nsxField ?? "") : "";
}

/** Key the page runtime stores in `#ref-popover[data-key]` for the span that opened it. */
function triggerKey(node: HTMLElement): string {
  const label = node.textContent?.trim() ?? "";
  return node.classList.contains("term")
    ? `term:${node.dataset.term}:${label}`
    : `${node.dataset.path}:${node.dataset.line}:${label}`;
}

export function createTargets(t: CommentStrings, main: HTMLElement) {
  const ids = new WeakMap<Element, string>();
  let nextId = 1;
  const idOf = (node: Element): string => {
    let id = ids.get(node);
    if (!id) {
      id = `block:${nextId++}`;
      ids.set(node, id);
    }
    return id;
  };

  const popEl = document.getElementById("ref-popover");
  const diagramEl = (): Element => main.querySelector(".lens-diagram") ?? main;

  function featurePath(from: Element): string {
    const names: string[] = [];
    let item: Element | null = from.closest("li.ft-item");
    while (item) {
      const label = item.querySelector(":scope > .ft-row > .ft-trigger, :scope > .ft-row > .ft-label");
      if (label?.textContent) names.unshift(squash(label.textContent));
      item = item.parentElement?.closest("li.ft-item") ?? null;
    }
    return names.join(" › ");
  }

  const isPageBlock = (n: Element) => n.closest(BLOCK_SELECTOR) === n && !n.closest("[popover], dialog");

  function describeBlock(block: HTMLElement): { section: string; where: string } {
    const tagName = block.tagName;
    if (block.matches("main > header h1")) return { section: t.locTitle, where: "" };
    if (block.matches("main > header p")) return { section: t.locSummary, where: "" };
    const section = block.closest("section");
    const heading = sectionHeading(block);
    if (block.matches("h2")) return { section: heading, where: "" };
    if (block.classList.contains("lens-diagram")) {
      return { section: heading, where: heading === t.locDiagram ? "" : t.locDiagram };
    }
    if (block.classList.contains("ft-row")) return { section: heading, where: featurePath(block) };
    if (block.matches("figure")) {
      return { section: heading, where: squash(block.querySelector("figcaption")?.textContent ?? "") };
    }
    const field = block as HTMLElement;
    if (field.hasAttribute("data-nsx-field") && !field.matches("p, li")) {
      return { section: heading, where: field.dataset.nsxField ?? "" };
    }
    const isItem = tagName === "LI";
    const peers = [...(section?.querySelectorAll(isItem ? "li" : "p") ?? [])].filter(isPageBlock);
    return { section: heading, where: `${isItem ? t.locItem : t.locParagraph} ${peers.indexOf(block) + 1}` };
  }

  function diagramLabels(block: HTMLElement): string {
    let model: unknown;
    try {
      model = JSON.parse(block.querySelector(".graph-model")?.textContent ?? "{}");
    } catch {
      return "";
    }
    if (!model || typeof model !== "object" || !("nodes" in model) || !Array.isArray(model.nodes)) return "";
    const nodes: unknown[] = model.nodes;
    const labels: string[] = [];
    for (const n of nodes) {
      if (!n || typeof n !== "object" || !("label" in n) || typeof n.label !== "string") continue;
      if ("kind" in n && n.kind === "package") continue;
      labels.push(n.label);
    }
    return labels.join(", ");
  }

  function excerptOf(block: HTMLElement): string {
    if (block.classList.contains("lens-diagram")) {
      return cut(`${t.locDiagram}: ${diagramLabels(block)}`, EXCERPT_LIMIT * 2);
    }
    return cut(textWithout(block, "[popover], script, style"), EXCERPT_LIMIT);
  }

  function filesOf(block: HTMLElement): string[] {
    const seen = new Set<string>();
    block.querySelectorAll<HTMLElement>(".ref[data-path]").forEach((r) => {
      const path = r.dataset.path ?? "";
      if (path) seen.add(r.dataset.line ? `${path}:${r.dataset.line}` : path);
    });
    return [...seen];
  }

  // --- a plain block of the page (or the diagram, also while full screen) ----

  function blockTarget(block: HTMLElement): Target {
    const key = idOf(block);
    const host = hostOf(block);
    const rect = () => block.getBoundingClientRect();
    return {
      key,
      host,
      fixed: host !== document.body,
      side: "outside",
      rect,
      edge: rect,
      alive: () => block.isConnected,
      anchor: () => {
        const where = describeBlock(block);
        return {
          key,
          section: where.section,
          field: fieldOf(block, main),
          where: where.where,
          excerpt: excerptOf(block),
          files: filesOf(block),
          sortEl: block,
          sub: 0,
          marks: () => ({ blocks: [block], triggers: [] }),
          reveal: () => scrollAndFlash(block),
        };
      },
    };
  }

  // --- one diff hunk inside a feature popover ---------------------------------

  function hunkTarget(li: HTMLElement, panel: HTMLElement): Target {
    const trigger = document.getElementById(panel.getAttribute("aria-labelledby") ?? "");
    const rect = () => li.getBoundingClientRect();
    const key = idOf(li);
    return {
      key,
      host: panel,
      fixed: true,
      side: "inside",
      rect,
      edge: () => panel.getBoundingClientRect(),
      clip: () => panel.getBoundingClientRect(),
      alive: () => panel.matches(":popover-open"),
      anchor: () => {
        const at = squash(li.querySelector(".ft-path")?.textContent ?? "");
        const hunks = [...panel.querySelectorAll("li.ft-hunk")];
        const place = at.split("/").pop() ?? at;
        const route = trigger ? featurePath(trigger) : "";
        return {
          key,
          section: sectionHeading(trigger),
          field: fieldOf(trigger, main),
          where: [route, place].filter(Boolean).join(" › "),
          excerpt: cut(squash(li.querySelector(".ft-explain")?.textContent ?? ""), EXCERPT_LIMIT),
          files: at ? [at] : [],
          sortEl: trigger ?? panel,
          sub: hunks.indexOf(li),
          marks: () => ({ blocks: [li], triggers: trigger ? [trigger] : [] }),
          reveal: () => {
            if (!trigger || !panel.matches(":popover-open")) {
              trigger?.scrollIntoView({ block: "center" });
              trigger?.click();
            }
            requestAnimationFrame(() => {
              panel.scrollTop = Math.max(0, li.offsetTop - panel.clientHeight / 3);
              flash(li);
            });
          },
        };
      },
    };
  }

  // --- the popover opened by a dotted/dashed underline or a diagram element ---

  const refTriggers = (popKey: string): HTMLElement[] =>
    [...main.querySelectorAll<HTMLElement>(".ref, .term")].filter(
      (n) => !n.closest(".ft-trigger") && triggerKey(n) === popKey,
    );

  function refTarget(pop: HTMLElement): Target | null {
    const popKey = pop.dataset.key;
    if (!popKey) return null;
    const key = `ref:${popKey}`;
    const rect = () => pop.getBoundingClientRect();
    const showing = () => pop.style.display !== "none" && pop.dataset.key === popKey;
    return {
      key,
      host: hostOf(pop),
      fixed: true,
      side: "inside",
      rect,
      edge: rect,
      alive: showing,
      anchor: () => {
        const label = squash(pop.querySelector(".ref-name")?.textContent ?? "");
        const path = squash(pop.querySelector(".ref-path")?.textContent ?? "");
        const sortEl = refTriggers(popKey)[0] ?? diagramEl();
        return {
          key,
          section: sectionHeading(sortEl),
          field: fieldOf(sortEl, main),
          where: `${t.locPopover}: ${label}`,
          excerpt: cut(textWithout(pop, ".ref-rels, .ref-view, .term-kicker, .ref-path, .ref-name"), EXCERPT_LIMIT),
          files: path ? [path] : [],
          sortEl,
          sub: 0,
          marks: () => ({ blocks: showing() ? [pop] : [], triggers: refTriggers(popKey) }),
          reveal: () => {
            const trigger = refTriggers(popKey)[0];
            if (!trigger) {
              scrollAndFlash(diagramEl());
              return;
            }
            trigger.scrollIntoView({ block: "center" });
            if (!showing()) trigger.click();
          },
        };
      },
    };
  }

  // --- source lines in the "View file" dialog ---------------------------------

  function fileTarget(first: HTMLElement, last: HTMLElement): Target | null {
    const dialog = first.closest<HTMLElement>("#file-dialog");
    if (!dialog) return null;
    const path = squash(dialog.querySelector(".file-title")?.textContent ?? "");
    const a = Number(first.dataset.line);
    const b = Number(last.dataset.line);
    if (!path || !Number.isFinite(a) || !Number.isFinite(b)) return null;
    const from = Math.min(a, b);
    const to = Math.max(a, b);
    const span = from === to ? `${from}` : `${from}-${to}`;
    const key = `file:${path}:${span}`;
    const linesInRange = () =>
      [...dialog.querySelectorAll<HTMLElement>(".code-line")].filter((l) => {
        const n = Number(l.dataset.line);
        return n >= from && n <= to;
      });
    return {
      key,
      host: dialog,
      fixed: true,
      side: "inside",
      rect: () => first.getBoundingClientRect(),
      edge: () => dialog.getBoundingClientRect(),
      clip: () => dialog.querySelector("pre")?.getBoundingClientRect() ?? dialog.getBoundingClientRect(),
      alive: () => dialog instanceof HTMLDialogElement && dialog.open && first.isConnected,
      anchor: () => {
        const textOf = (l: Element) => squash((l.querySelector(".code-text")?.textContent ?? "").replace(/\u200b/g, ""));
        // A blank or one-token line says nothing to the agent: show the commented lines, else the ones around them.
        const all = [...dialog.querySelectorAll<HTMLElement>(".code-line")];
        const inside = linesInRange().map(textOf).filter(Boolean);
        const around = inside.length
          ? inside
          : all.filter((l) => Math.abs(Number(l.dataset.line) - from) <= 2).map(textOf).filter(Boolean);
        const code = around.slice(0, 4).join(" ⏎ ");
        const opener = [...main.querySelectorAll<HTMLElement>(".ref[data-path]")].find((r) => r.dataset.path === path);
        return {
          key,
          section: t.locFile,
          field: "",
          where: `${path}:${span}`,
          excerpt: cut(code, EXCERPT_LIMIT),
          files: [`${path}:${from}`],
          sortEl: opener ?? diagramEl(),
          sub: from,
          marks: () => {
            const showing = dialog instanceof HTMLDialogElement && dialog.open &&
              squash(dialog.querySelector(".file-title")?.textContent ?? "") === path;
            return { blocks: showing ? linesInRange() : [], triggers: [] };
          },
          reveal: () => {
            document.dispatchEvent(new CustomEvent("ns:open-file", { detail: { path, line: from } }));
          },
        };
      },
    };
  }

  /**
   * The target under a node, or null. With `range`, a selection that runs over several
   * code lines resolves to the whole line span.
   */
  function resolve(from: Node | null, range?: Range): Target | null {
    const start = elementOf(from);
    if (!start) return null;

    const line = start.closest<HTMLElement>("#file-dialog .code-line");
    if (line) {
      let last = elementOf(range?.endContainer ?? null)?.closest<HTMLElement>("#file-dialog .code-line") ?? line;
      // A triple click ends at offset 0 of the next line: that line is not part of the selection.
      const prior = last.previousElementSibling;
      if (range && last !== line && range.endOffset === 0 && prior instanceof HTMLElement) last = prior;
      return fileTarget(line, last);
    }
    if (start.closest("#file-dialog")) return null;

    const pop = start.closest<HTMLElement>("#ref-popover");
    if (pop) return pop === popEl && pop.style.display !== "none" ? refTarget(pop) : null;

    const panel = start.closest<HTMLElement>(".ft-changes");
    if (panel) {
      const li = start.closest<HTMLElement>("li.ft-hunk");
      return li && panel.contains(li) ? hunkTarget(li, panel) : null;
    }

    if (start.closest(".nsx-c-ui, [data-nsx-input], [data-nsx-decision]")) return null;
    const diagram = start.closest<HTMLElement>(".lens-diagram");
    if (diagram) return blockTarget(diagram);

    const block = start.closest<HTMLElement>(BLOCK_SELECTOR);
    if (!block || block.closest("[popover], dialog")) return null;
    return blockTarget(block);
  }

  return { resolve };
}

export type { Anchor };
