// Review comments for the exported page. Hover a block, or select text, to get a
// comment icon. That works on the page itself and inside the boxes it opens: the
// diff popover behind a feature, the popover behind a dotted/dashed underline or a
// diagram element, the full-screen diagram, and the "View file" dialog.
// Every comment stays in memory (a reload drops them); answers and the decision persist (see comments-inputs.ts). The dock at the bottom right
// lists them (jump, edit, delete, clear) and copies them all, with where each one
// sits, so they can be pasted straight into the agent that owns the manifest.
import { COMMENTS_CSS } from "./comments-css.ts";
import { createInputs } from "./comments-inputs.ts";
import { buildReportText, hasDecision, nonEmptyAnswers } from "./comments-report.ts";
import { createTargets, cut, squash } from "./comments-targets.ts";
import { DEFAULT_STRINGS, type Anchor, type CommentStrings, type Target } from "./comments-types.ts";

interface CommentUi {
  name?: string;
  title?: string;
  comments?: Partial<CommentStrings>;
}

interface ReviewComment {
  id: number;
  anchor: Anchor;
  /** Selected text the comment was made on; empty for a whole-block comment. */
  quote: string;
  text: string;
}

interface Draft {
  target: Target;
  anchor: Anchor;
  quote: string;
}

interface PendingSelection {
  target: Target;
  quote: string;
}

const ICON_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

const QUOTE_LIMIT = 500;
const HIDE_DELAY_MS = 180;
const ICON_SIZE = 28;
const CLEAR_ARM_MS = 3000;
const NARROW_PX = 640;

function readUi(): CommentUi {
  try {
    return JSON.parse(document.getElementById("nsx-ui")?.textContent ?? "{}") as CommentUi;
  } catch {
    return {};
  }
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function button(cls: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = el("button", cls, label);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

export function mountComments(): void {
  const ui = readUi();
  const t: CommentStrings = { ...DEFAULT_STRINGS, ...(ui.comments ?? {}) };
  const mainEl = document.querySelector("main");
  if (!mainEl) return;
  const main: HTMLElement = mainEl;

  if (!document.getElementById("nsx-comments-css")) {
    const style = document.createElement("style");
    style.id = "nsx-comments-css";
    style.textContent = COMMENTS_CSS;
    document.head.appendChild(style);
  }

  const targets = createTargets(t, main);
  const comments: ReviewComment[] = [];
  const inputs = createInputs(main, ui.name ?? location.pathname, () => refresh());
  let nextId = 1;
  let draft: Draft | null = null;
  let editingId: number | null = null;
  let hoverTarget: Target | null = null;
  let pendingSelection: PendingSelection | null = null;
  let hideTimer = 0;
  let panelOpen = false;
  let panelEditing: number | null = null;
  let clearArmed = false;
  let clearTimer = 0;
  const blockMarks = new Set<Element>();
  const dotMarks = new Set<Element>();

  // --- floating pieces -----------------------------------------------------

  const hoverBtn = el("button", "nsx-c-ui nsx-c-icon");
  hoverBtn.type = "button";
  hoverBtn.setAttribute("aria-label", t.comment);
  hoverBtn.title = t.comment;
  hoverBtn.innerHTML = ICON_SVG;
  const badge = el("span", "nsx-c-badge");
  hoverBtn.appendChild(badge);

  const selBtn = el("button", "nsx-c-ui nsx-c-icon nsx-c-sel");
  selBtn.type = "button";
  selBtn.setAttribute("aria-label", t.comment);
  selBtn.title = t.comment;
  selBtn.innerHTML = ICON_SVG;

  const composer = el("div", "nsx-c-ui nsx-c-composer");
  composer.setAttribute("role", "dialog");
  composer.setAttribute("aria-label", t.comment);

  const dock = el("div", "nsx-c-ui nsx-c-dock");
  const listBtn = el("button", "nsx-c-listbtn");
  listBtn.type = "button";
  listBtn.setAttribute("aria-haspopup", "dialog");
  listBtn.setAttribute("aria-expanded", "false");
  const copyBtn = el("button", "nsx-c-copy");
  copyBtn.type = "button";
  dock.append(listBtn, copyBtn);

  const panel = el("div", "nsx-c-ui nsx-c-panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", t.list);

  document.body.append(hoverBtn, selBtn, composer, dock, panel);

  // --- helpers -------------------------------------------------------------

  const commentsAt = (key: string) => comments.filter((c) => c.anchor.key === key);
  const whereOf = (a: Anchor) => [a.section, a.where].filter(Boolean).join(" › ");

  /** Document order, then order inside one anchor element (hunk index, line number), then age. */
  function inOrder(): ReviewComment[] {
    return [...comments].sort((a, b) => {
      const x = a.anchor;
      const y = b.anchor;
      if (x.sortEl !== y.sortEl) {
        return x.sortEl.compareDocumentPosition(y.sortEl) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      }
      return x.sub - y.sub || a.id - b.id;
    });
  }

  const verdictLabel = (v: string) => (v === "approve" ? t.verdictApprove : t.verdictChanges);

  /** Answers and decision as the page holds them now, and the sizes the buttons show. */
  function extras() {
    const answers = nonEmptyAnswers(inputs.answers());
    const decision = inputs.decision();
    return { answers, decision, total: comments.length + answers.length + (hasDecision(decision) ? 1 : 0) };
  }

  function buildReport(): string {
    return buildReportText({
      title: ui.title ?? document.title,
      name: ui.name,
      comments: inOrder().map((c) => ({
        where: whereOf(c.anchor),
        field: c.anchor.field,
        excerpt: c.anchor.excerpt,
        quote: c.quote,
        files: c.anchor.files,
        text: c.text,
      })),
      answers: inputs.answers(),
      decision: inputs.decision(),
    }) ?? "";
  }

  async function writeClipboard(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Not a secure context, or permission denied: fall back to a hidden textarea.
      const ta = el("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      ta.remove();
      return ok;
    }
  }

  /** Viewport coordinates in, either fixed (top layer, dialogs) or page-absolute out. */
  function placeAt(node: HTMLElement, x: number, y: number, fixed: boolean): void {
    node.style.position = fixed ? "fixed" : "absolute";
    node.style.left = `${Math.round(fixed ? x : x + scrollX)}px`;
    node.style.top = `${Math.round(fixed ? y : y + scrollY)}px`;
  }

  /** A modal dialog makes the rest of the page inert and a popover sits in the top layer, so the UI lives inside the box it serves. */
  function mount(host: HTMLElement): void {
    for (const node of [hoverBtn, selBtn, composer]) {
      if (node.parentElement !== host) host.appendChild(node);
    }
  }

  function syncMarks(want: Set<Element>, have: Set<Element>, cls: string): void {
    have.forEach((n) => {
      if (want.has(n)) return;
      n.classList.remove(cls);
      have.delete(n);
    });
    want.forEach((n) => {
      n.classList.add(cls);
      have.add(n);
    });
  }

  function refresh(): void {
    const blocks = new Set<Element>();
    const triggers = new Set<Element>();
    for (const c of comments) {
      const m = c.anchor.marks();
      m.blocks.forEach((b) => blocks.add(b));
      m.triggers.forEach((b) => triggers.add(b));
    }
    syncMarks(blocks, blockMarks, "nsx-c-has");
    syncMarks(triggers, dotMarks, "nsx-c-dot");
    const total = extras().total;
    copyBtn.textContent = `${t.copy} (${total})`;
    copyBtn.disabled = total === 0;
    copyBtn.title = total === 0 ? t.copyEmpty : "";
    listBtn.textContent = `${t.list} (${total})`;
    if (hoverTarget) badge.textContent = String(commentsAt(hoverTarget.key).length || "");
    if (panelOpen && panelEditing === null) renderPanel();
  }

  // --- hover icon ----------------------------------------------------------

  function hideHover(): void {
    window.clearTimeout(hideTimer);
    hoverBtn.style.display = "none";
    hoverTarget = null;
  }

  function showHover(target: Target): void {
    window.clearTimeout(hideTimer);
    if (draft) return;
    const r = target.rect();
    const clip = target.clip?.();
    // A hunk or a code line scrolled out of its box has nothing to point at.
    if (clip && (r.bottom < clip.top + 4 || r.top > clip.bottom - 4)) {
      hideHover();
      return;
    }
    mount(target.host);
    hoverTarget = target;
    const edge = target.edge();
    const roomRight = target.side === "outside" && innerWidth - edge.right >= ICON_SIZE + 12;
    const x = roomRight ? edge.right + 8 : edge.right - ICON_SIZE - (target.side === "inside" ? 20 : 4);
    let y = r.top + 2;
    if (clip) y = clamp(y, clip.top + 4, clip.bottom - ICON_SIZE - 4);
    placeAt(hoverBtn, x, y, target.fixed);
    badge.textContent = String(commentsAt(target.key).length || "");
    hoverBtn.style.display = "flex";
  }

  function scheduleHide(): void {
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(hideHover, HIDE_DELAY_MS);
  }

  function onPoint(e: PointerEvent): void {
    const node = e.target;
    if (!(node instanceof Element)) return;
    if (node.closest(".nsx-c-icon, .nsx-c-composer")) {
      window.clearTimeout(hideTimer);
      return;
    }
    if (draft) return;
    const target = targets.resolve(node);
    if (target) showHover(target);
    else scheduleHide();
  }

  document.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "touch") onPoint(e);
  }, { passive: true });
  // Touch has no hover: a tap on a block brings the icon up instead.
  document.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") onPoint(e);
  }, { passive: true });
  // Scrolling inside a popover or the file dialog does not bubble: listen on capture.
  document.addEventListener("scroll", () => {
    if (!draft && hoverTarget) showHover(hoverTarget);
  }, { passive: true, capture: true });
  hoverBtn.addEventListener("pointerleave", scheduleHide);

  // --- selection icon ------------------------------------------------------

  function hideSelection(): void {
    selBtn.style.display = "none";
    pendingSelection = null;
  }

  function checkSelection(): void {
    const sel = window.getSelection();
    if (draft || !sel || sel.rangeCount === 0 || sel.isCollapsed) {
      if (!draft) hideSelection();
      return;
    }
    const range = sel.getRangeAt(0);
    const target = targets.resolve(range.startContainer, range) ?? targets.resolve(range.endContainer, range);
    const quote = cut(squash(sel.toString()), QUOTE_LIMIT);
    if (!target || !quote) {
      hideSelection();
      return;
    }
    mount(target.host);
    const rects = range.getClientRects();
    const last = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
    const above = last.top >= 40;
    placeAt(
      selBtn,
      clamp(last.right - 12, 8, innerWidth - 40),
      above ? last.top - 34 : last.bottom + 6,
      target.fixed,
    );
    pendingSelection = { target, quote };
    selBtn.style.display = "flex";
  }

  document.addEventListener("selectionchange", () => {
    const sel = window.getSelection();
    if (!draft && (!sel || sel.isCollapsed)) hideSelection();
  });
  document.addEventListener("pointerup", () => window.setTimeout(checkSelection, 0));
  document.addEventListener("keyup", (e) => {
    if (e.shiftKey || e.key.startsWith("Arrow")) window.setTimeout(checkSelection, 0);
  });

  // --- composer ------------------------------------------------------------

  function closeComposer(clearSelection = false): void {
    composer.style.display = "none";
    composer.replaceChildren();
    draft = null;
    editingId = null;
    if (clearSelection) window.getSelection()?.removeAllRanges();
    hideSelection();
  }

  function renderComposer(): void {
    if (!draft) return;
    const { anchor, quote } = draft;
    composer.replaceChildren();

    const head = el("div", "nsx-c-head");
    head.append(el("span", "nsx-c-where", whereOf(anchor)));
    const x = button("nsx-c-x", "✕", () => closeComposer());
    x.setAttribute("aria-label", t.cancel);
    head.appendChild(x);
    composer.appendChild(head);

    if (quote) {
      const q = el("blockquote", "nsx-c-quote");
      q.append(el("div", "nsx-c-kicker", t.selected), el("div", undefined, quote));
      composer.appendChild(q);
    }

    const existing = commentsAt(anchor.key);
    if (existing.length) {
      const list = el("ul", "nsx-c-list");
      existing.forEach((c) => {
        const li = el("li", c.id === editingId ? "nsx-c-item is-editing" : "nsx-c-item");
        if (c.quote) li.appendChild(el("div", "nsx-c-itemquote", c.quote));
        li.appendChild(el("div", "nsx-c-text", c.text));
        const actions = el("div", "nsx-c-itemactions");
        actions.append(
          button("nsx-c-link", t.edit, () => {
            editingId = c.id;
            renderComposer();
          }),
          button("nsx-c-link nsx-c-danger", t.remove, () => {
            comments.splice(comments.indexOf(c), 1);
            if (editingId === c.id) editingId = null;
            refresh();
            renderComposer();
          }),
        );
        li.appendChild(actions);
        list.appendChild(li);
      });
      composer.appendChild(list);
    }

    const ta = el("textarea", "nsx-c-input");
    ta.rows = 3;
    ta.placeholder = t.placeholder;
    ta.value = comments.find((c) => c.id === editingId)?.text ?? "";
    composer.appendChild(ta);

    const foot = el("div", "nsx-c-foot");
    foot.appendChild(el("span", "nsx-c-hint", t.hint));
    const save = button("nsx-c-btn nsx-c-primary", t.save, () => commit());
    foot.append(button("nsx-c-btn", t.cancel, () => closeComposer()), save);
    composer.appendChild(foot);

    function commit(): void {
      const text = ta.value.trim();
      if (!text || !draft) return;
      const current = comments.find((c) => c.id === editingId);
      if (current) current.text = text;
      else comments.push({ id: nextId++, anchor: draft.anchor, quote: draft.quote, text });
      const hadQuote = !!draft.quote;
      closeComposer(hadQuote);
      refresh();
    }
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeComposer();
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        commit();
      }
    });
    // Not yet placed on first open: a plain focus() would scroll the page to wherever the box happens to sit.
    ta.focus({ preventScroll: true });
  }

  function openComposer(next: Draft, from: DOMRect): void {
    hideHover();
    selBtn.style.display = "none";
    draft = next;
    editingId = null;
    mount(next.target.host);
    composer.style.display = "block";
    renderComposer();
    const w = composer.offsetWidth;
    const h = composer.offsetHeight;
    const x = clamp(from.left, 8, innerWidth - w - 8);
    // Flip above the icon when the box would run off the bottom of the viewport.
    const below = from.bottom + 6;
    const y = below + h > innerHeight - 8 ? Math.max(8, from.top - h - 6) : below;
    placeAt(composer, x, y, next.target.fixed);
    if (!next.target.fixed) composer.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  hoverBtn.addEventListener("click", () => {
    if (!hoverTarget) return;
    openComposer(
      { target: hoverTarget, anchor: hoverTarget.anchor(), quote: "" },
      hoverBtn.getBoundingClientRect(),
    );
  });
  // Pressing the icon must not collapse the selection it is about to quote.
  selBtn.addEventListener("pointerdown", (e) => e.preventDefault());
  selBtn.addEventListener("click", () => {
    if (!pendingSelection) return;
    const { target, quote } = pendingSelection;
    openComposer({ target, anchor: target.anchor(), quote }, selBtn.getBoundingClientRect());
  });

  document.addEventListener("pointerdown", (e) => {
    if (!draft) return;
    const node = e.target;
    if (node instanceof Element && node.closest(".nsx-c-ui")) return;
    // A half-written comment survives a stray click; Save or Cancel ends it.
    const input = composer.querySelector<HTMLTextAreaElement>(".nsx-c-input");
    if (input && input.value.trim()) return;
    closeComposer();
  });

  // --- comment list --------------------------------------------------------

  function disarmClear(): void {
    window.clearTimeout(clearTimer);
    clearArmed = false;
  }

  function setPanel(open: boolean): void {
    panelOpen = open;
    panel.style.display = open ? "flex" : "none";
    listBtn.classList.toggle("is-open", open);
    listBtn.setAttribute("aria-expanded", String(open));
    if (open) renderPanel();
    else {
      panelEditing = null;
      disarmClear();
    }
  }

  function renderPanelItem(c: ReviewComment, index: number): HTMLElement {
    const item = el("div", c.id === panelEditing ? "nsx-c-pitem is-editing" : "nsx-c-pitem");
    item.appendChild(el("div", "nsx-c-pwhere", `${index + 1}. ${whereOf(c.anchor)}`));
    item.appendChild(el("div", "nsx-c-pexcerpt", c.quote || c.anchor.excerpt));

    if (c.id === panelEditing) {
      const ta = el("textarea", "nsx-c-input nsx-c-pedit");
      ta.rows = 3;
      ta.value = c.text;
      const save = (): void => {
        const text = ta.value.trim();
        if (!text) return;
        c.text = text;
        panelEditing = null;
        refresh();
        renderPanel();
      };
      const cancel = (): void => {
        panelEditing = null;
        renderPanel();
      };
      ta.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          cancel();
        } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          save();
        }
      });
      const foot = el("div", "nsx-c-foot");
      foot.append(
        el("span", "nsx-c-hint", t.hint),
        button("nsx-c-btn", t.cancel, cancel),
        button("nsx-c-btn nsx-c-primary", t.save, save),
      );
      item.append(ta, foot);
      window.setTimeout(() => ta.focus({ preventScroll: true }), 0);
      return item;
    }

    item.appendChild(el("div", "nsx-c-text", c.text));
    const actions = el("div", "nsx-c-itemactions");
    actions.append(
      button("nsx-c-link", t.jump, () => {
        c.anchor.reveal();
        // On a narrow screen the list would sit on top of the place it just revealed.
        if (innerWidth < NARROW_PX) setPanel(false);
      }),
      button("nsx-c-link", t.edit, () => {
        panelEditing = c.id;
        renderPanel();
      }),
      button("nsx-c-link nsx-c-danger", t.remove, () => {
        comments.splice(comments.indexOf(c), 1);
        if (panelEditing === c.id) panelEditing = null;
        if (draft) renderComposer();
        refresh();
        renderPanel();
      }),
    );
    item.appendChild(actions);
    return item;
  }

  function renderPanel(): void {
    panel.replaceChildren();
    const { answers, decision, total } = extras();

    const head = el("div", "nsx-c-phead");
    head.appendChild(el("span", "nsx-c-ptitle", `${t.list} (${total})`));
    const clear = button("nsx-c-link nsx-c-danger", clearArmed ? t.clearConfirm : t.clear, () => {
      if (!clearArmed) {
        clearArmed = true;
        window.clearTimeout(clearTimer);
        clearTimer = window.setTimeout(() => {
          clearArmed = false;
          if (panelOpen) renderPanel();
        }, CLEAR_ARM_MS);
        renderPanel();
        return;
      }
      disarmClear();
      comments.length = 0;
      inputs.clear();
      panelEditing = null;
      if (draft) closeComposer();
      refresh();
      renderPanel();
    });
    clear.disabled = total === 0;
    const close = button("nsx-c-x", "✕", () => {
      setPanel(false);
      listBtn.focus();
    });
    close.setAttribute("aria-label", t.close);
    head.append(clear, close);
    panel.appendChild(head);

    const body = el("div", "nsx-c-pbody");
    if (total === 0) body.appendChild(el("div", "nsx-c-pempty", t.copyEmpty));
    inOrder().forEach((c, i) => body.appendChild(renderPanelItem(c, i)));
    if (answers.length) {
      body.appendChild(el("div", "nsx-c-psection", `${t.answers} (${answers.length})`));
      answers.forEach((a, i) => {
        const item = el("div", "nsx-c-pitem");
        item.appendChild(el("div", "nsx-c-pwhere", `${i + 1}. ${a.label || a.field}`));
        item.appendChild(el("div", "nsx-c-text", a.value));
        const actions = el("div", "nsx-c-itemactions");
        actions.appendChild(button("nsx-c-link", t.jump, () => {
          inputs.reveal(a.field);
          if (innerWidth < NARROW_PX) setPanel(false);
        }));
        item.appendChild(actions);
        body.appendChild(item);
      });
    }
    if (hasDecision(decision)) {
      body.appendChild(el("div", "nsx-c-psection", t.decision));
      const item = el("div", "nsx-c-pitem");
      if (decision.verdict) item.appendChild(el("div", "nsx-c-pwhere", verdictLabel(decision.verdict)));
      if (decision.note.trim()) item.appendChild(el("div", "nsx-c-text", decision.note.trim()));
      const actions = el("div", "nsx-c-itemactions");
      actions.appendChild(button("nsx-c-link", t.jump, () => {
        inputs.reveal(null);
        if (innerWidth < NARROW_PX) setPanel(false);
      }));
      item.appendChild(actions);
      body.appendChild(item);
    }
    panel.appendChild(body);
  }

  listBtn.addEventListener("click", () => setPanel(!panelOpen));
  panel.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    setPanel(false);
    listBtn.focus();
  });

  // --- copy button ---------------------------------------------------------

  let copyTimer = 0;
  copyBtn.addEventListener("click", async () => {
    const total = extras().total;
    if (total === 0) return;
    const ok = await writeClipboard(buildReport());
    copyBtn.classList.toggle("is-ok", ok);
    copyBtn.classList.toggle("is-fail", !ok);
    copyBtn.textContent = ok ? `${t.copied} (${total})` : t.copyFailed;
    window.clearTimeout(copyTimer);
    copyTimer = window.setTimeout(() => {
      copyBtn.classList.remove("is-ok", "is-fail");
      refresh();
    }, 1600);
  });

  // --- keeping marks and floating UI in step with boxes that open and close --

  /**
   * The topmost box that hides the page: an open modal dialog (file view, full-screen diagram) or a
   * feature popover. Both live in the top layer, so a dock left on `<body>` would sit underneath them.
   * The page itself when nothing is open.
   */
  function topLayerHost(): HTMLElement {
    const modal = [...document.querySelectorAll<HTMLDialogElement>("dialog[open]")].pop();
    if (modal) return modal;
    const feature = [...document.querySelectorAll<HTMLElement>(".ft-changes")].find((n) => n.matches(":popover-open"));
    return feature ?? document.body;
  }

  function syncDock(): void {
    const host = topLayerHost();
    for (const node of [dock, panel]) {
      if (node.parentElement !== host) host.appendChild(node);
    }
    // Inside a box that scrolls, a fixed child still pins to the viewport, so no offset adjusting is needed.
  }

  function syncLive(): void {
    if (draft && !draft.target.alive()) closeComposer();
    if (hoverTarget && !hoverTarget.alive()) hideHover();
    if (pendingSelection && !pendingSelection.target.alive()) hideSelection();
    syncDock();
    refresh();
  }

  // The feature popovers and the dialogs announce open/close on their own element, without bubbling.
  document.addEventListener("toggle", syncLive, true);
  document.addEventListener("close", syncLive, true);

  const live = new MutationObserver(syncLive);
  const refPopover = document.getElementById("ref-popover");
  if (refPopover) {
    live.observe(refPopover, { attributes: true, attributeFilter: ["style", "data-key"], childList: true });
  }
  const fileDialog = document.getElementById("file-dialog");
  if (fileDialog) {
    live.observe(fileDialog, { attributes: true, attributeFilter: ["open"] });
    const code = fileDialog.querySelector("code");
    if (code) live.observe(code, { childList: true });
  }

  hideHover();
  hideSelection();
  composer.style.display = "none";
  panel.style.display = "none";
  refresh();
}
