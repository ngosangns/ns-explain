// Page behavior packed into the exported HTML: the .ref popover, the file
// dialog (one scroller, line numbers, indent guides), and pseudocode highlighting.
import type { GraphModel, GraphNode, RefData } from "./types.ts";

interface HljsApi {
  highlightElement(el: Element): void;
  registerLanguage(name: string, def: () => unknown): void;
  COMMENT(begin: string, end: string): unknown;
}

interface PageUi {
  viewFile?: string;
  plain?: string;
}

interface ConceptEntry {
  term?: string;
  explain?: string;
}

const REF_LANG: Record<string, string> = {
  ts: "typescript", tsx: "typescript", mts: "typescript", cts: "typescript",
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  proto: "protobuf", html: "xml", htm: "xml", vue: "xml", svelte: "xml",
  css: "css", scss: "scss", less: "less", json: "json",
  go: "go", rs: "rust", py: "python", java: "java", kt: "kotlin",
  swift: "swift", rb: "ruby", php: "php", c: "c", h: "c", cpp: "cpp",
  cs: "csharp", sql: "sql", yaml: "yaml", yml: "yaml", sh: "bash",
  bash: "bash", md: "markdown", toml: "ini", dockerfile: "dockerfile",
};

function readJson<T>(id: string, fallback: T): T {
  const text = document.getElementById(id)?.textContent;
  if (!text) return fallback;
  return JSON.parse(text) as T;
}

function hljsApi(): HljsApi | null {
  return (window as Window & { hljs?: HljsApi }).hljs ?? null;
}

// Split highlighted HTML on source newlines without cutting a token tag.
function highlightedLines(html: string, dropTrailing: boolean): string[] {
  const lines: string[] = [];
  let current = "";
  for (let i = 0; i < html.length; i++) {
    if (html[i] === "<") {
      const end = html.indexOf(">", i);
      if (end === -1) { current += html.slice(i); break; }
      current += html.slice(i, end + 1);
      i = end;
      continue;
    }
    if (html[i] === "\n") { lines.push(current); current = ""; continue; }
    current += html[i];
  }
  lines.push(current);
  if (dropTrailing && lines[lines.length - 1] === "") lines.pop();
  return lines.length ? lines : [""];
}

function leadingCols(line: string, tabSize: number): number {
  let cols = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === " ") cols++;
    else if (ch === "\t") cols += tabSize - (cols % tabSize);
    else break;
  }
  return cols;
}

// Guide columns per source line. A blank line keeps the block it sits in.
function indentCols(lines: string[]): { unit: number; cols: number[] } {
  const tabSize = 4;
  const widths = lines.map((line) => line.trim() === "" ? null : leadingCols(line, tabSize));
  const positive = widths.filter((n): n is number => n != null && n > 0);
  let unit = 4;
  let best = 0;
  for (const candidate of [2, 4, 8]) {
    const score = positive.filter((n) => n % candidate === 0).length;
    if (score > best || (score > 0 && score === best && candidate > unit)) {
      best = score;
      unit = candidate;
    }
  }
  const cols = widths.map((w, i) => {
    let width = w;
    if (width == null) {
      let above = 0;
      for (let j = i - 1; j >= 0; j--) if (widths[j] != null) { above = widths[j] ?? 0; break; }
      let below = 0;
      for (let j = i + 1; j < widths.length; j++) if (widths[j] != null) { below = widths[j] ?? 0; break; }
      width = below > above ? below : above;
    }
    return Math.floor(width / unit) * unit;
  });
  return { unit, cols };
}

function scrollerCanTake(el: HTMLElement, e: WheelEvent): boolean {
  const dy = e.deltaY, dx = e.deltaX;
  if (Math.abs(dy) >= Math.abs(dx)) {
    if (dy > 0) return el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    if (dy < 0) return el.scrollTop > 0;
    return false;
  }
  if (dx > 0) return el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
  if (dx < 0) return el.scrollLeft > 0;
  return false;
}

const escText = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function mountPage(): void {
  const ui = readJson<PageUi>("nsx-ui", {});
  const viewFile = ui.viewFile ?? "View file";
  const plainLabel = ui.plain ?? "In plain terms";
  const concepts = new Map<string, string>();
  for (const entry of readJson<ConceptEntry[]>("nsx-concepts", [])) {
    const term = entry.term?.trim().toLowerCase() ?? "";
    const explain = entry.explain?.trim() ?? "";
    if (term && explain && !concepts.has(term)) concepts.set(term, explain);
  }
  const popEl = document.getElementById("ref-popover");
  const fileStore = readJson<Record<string, string>>("file-store", {});
  const dialogEl = document.getElementById("file-dialog");
  if (!popEl || !(dialogEl instanceof HTMLDialogElement)) return;
  const titleNode = dialogEl.querySelector(".file-title");
  const codeNode = dialogEl.querySelector("code");
  if (!(titleNode instanceof HTMLElement) || !(codeNode instanceof HTMLElement)) return;
  const pop: HTMLElement = popEl;
  // CSS hides it before any inline style exists. The open checks compare
  // against inline display, so start from the same value hideRef writes.
  pop.style.display = "none";
  const fileDialog: HTMLDialogElement = dialogEl;
  const fileTitle: HTMLElement = titleNode;
  const fileCode: HTMLElement = codeNode;

  const graph = JSON.parse(
    document.querySelector(".lens-diagram .graph-model")?.textContent ?? "{}",
  ) as GraphModel;

  const nodeById: Record<string, GraphNode> = {};
  const nodeByLabel: Record<string, GraphNode> = {};
  const nodeByPath: Record<string, GraphNode> = {};
  const nodeByPathLine: Record<string, GraphNode> = {};
  for (const n of graph.nodes ?? []) {
    nodeById[n.id] = n;
    nodeByLabel[n.label] ??= n;
    if (n.path) {
      nodeByPath[n.path] ??= n;
      nodeByPathLine[`${n.path}:${n.line}`] = n;
    }
  }

  function relsFor(id: string): string[] {
    const rels: string[] = [];
    for (const e of graph.edges ?? []) {
      const dir = e.source === id ? "→" : e.target === id ? "←" : null;
      if (!dir) continue;
      const other = nodeById[dir === "→" ? e.target : e.source];
      const hop = e.decides ? `${e.label} — ${e.decides}` : e.label;
      rels.push(`<div class="rel">${dir} ${other?.label ?? "?"}<br><span class="opacity-70">${hop ?? ""}</span></div>`);
    }
    return rels;
  }

  function focusLine(line: number): void {
    fileCode.querySelector(".code-line.is-focus")?.classList.remove("is-focus");
    const row = fileCode.querySelector(`.code-line[data-line="${line}"]`);
    if (!row) return;
    row.classList.add("is-focus");
    const pre = fileDialog.querySelector("pre");
    if (!pre) return;
    const delta = row.getBoundingClientRect().top - pre.getBoundingClientRect().top;
    pre.scrollTop = Math.max(0, pre.scrollTop + delta - pre.clientHeight / 3);
  }

  function openFile(path: string | undefined, line: number | string | undefined): void {
    if (!path) return;
    const body = fileStore[path];
    if (body == null) return;
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    fileTitle.textContent = path;
    fileCode.textContent = body;
    fileCode.className = "language-" + (REF_LANG[ext] ?? "plaintext");
    delete fileCode.dataset.highlighted;
    hljsApi()?.highlightElement(fileCode);
    const lines = highlightedLines(fileCode.innerHTML, body.endsWith("\n"));
    const raw = body.split("\n");
    if (body.endsWith("\n") && raw[raw.length - 1] === "") raw.pop();
    const guide = indentCols(raw.length ? raw : [""]);
    fileCode.style.setProperty("--line-digits", String(String(lines.length).length));
    fileCode.style.setProperty("--indent-unit", String(guide.unit));
    fileCode.innerHTML = lines.map((html, i) => {
      const n = i + 1;
      const content = html === "" ? "&#8203;" : html;
      const level = Math.floor((guide.cols[i] || 0) / guide.unit);
      const marks = level
        ? `<span class="indents" aria-hidden="true">${'<span class="indent"></span>'.repeat(level)}</span>`
        : "";
      return `<span class="code-line" data-line="${n}"><span class="ln" aria-hidden="true">${n}</span><span class="code-text">${marks}${content}</span></span>`;
    }).join("");
    pop.style.display = "none";
    if (!fileDialog.open) fileDialog.showModal();
    if (line) focusLine(Number(line));
  }

  function conceptExplain(label: string | undefined): string | undefined {
    const key = label?.trim().toLowerCase() ?? "";
    return key ? concepts.get(key) : undefined;
  }

  function conceptNote(explain: string): string {
    return `<div class="term-note"><div class="term-kicker">${escText(plainLabel)}</div>` +
      `<div class="term-explain">${escText(explain)}</div></div>`;
  }

  function placePopover(x: number, y: number): void {
    pop.style.display = "block";
    // Offset from the pointer: a popover under the cursor blocks the canvas
    // and starts a show/hide flicker loop.
    pop.style.left = Math.min(x + 14, innerWidth - pop.offsetWidth - 8) + "px";
    pop.style.top = (y + 14 + pop.offsetHeight + 8 > innerHeight
      ? y - pop.offsetHeight - 10
      : y + 14) + "px";
  }

  // One popover for .ref spans and graph nodes/edges alike.
  function showRefData(d: RefData, x: number, y: number): void {
    const hasFile = d.path != null && Object.hasOwn(fileStore, d.path);
    const node = d.id
      ? nodeById[d.id] ?? null
      : (d.label ? nodeByLabel[d.label] : undefined) ??
        (d.path ? nodeByPathLine[`${d.path}:${d.line}`] ?? nodeByPath[d.path] : null);
    const elId = node?.id ?? d.id;
    if (elId)
      document.dispatchEvent(new CustomEvent("ns:hover-el", { detail: { id: elId } }));
    setOpenTerm(null);
    const rels = node ? relsFor(node.id) : [];
    const explain = conceptExplain(d.label);
    const note = explain && explain !== (d.desc ?? "").trim() ? conceptNote(explain) : "";
    pop.innerHTML =
      (d.label ? `<div class="ref-name">${d.label}</div>` : "") +
      (d.path ? `<div class="ref-path">${d.path}</div>` : "") +
      `<div>${d.desc ?? ""}</div>` +
      note +
      (rels.length ? `<div class="ref-rels">${rels.join("")}</div>` : "") +
      (hasFile ? `<button class="btn btn-xs ref-view">${viewFile}</button>` : "");
    pop.querySelector(".ref-view")?.addEventListener("click", () => openFile(d.path, d.line));
    placePopover(x, y);
  }

  function showRef(el: HTMLElement): void {
    const r = el.getBoundingClientRect();
    showRefData({
      path: el.dataset.path,
      line: el.dataset.line,
      desc: el.dataset.desc,
      label: el.textContent?.trim() ?? "",
    }, r.left, r.bottom);
  }

  let openTerm: HTMLElement | null = null;

  function setOpenTerm(el: HTMLElement | null): void {
    if (openTerm) openTerm.setAttribute("aria-expanded", "false");
    openTerm = el;
    if (el) el.setAttribute("aria-expanded", "true");
  }

  const hideRef = (): void => {
    pop.style.display = "none";
    delete pop.dataset.key;
    setOpenTerm(null);
    document.dispatchEvent(new CustomEvent("ns:unhover-el"));
  };

  function toggleRef(el: HTMLElement): void {
    const label = el.textContent?.trim() ?? "";
    const key = `${el.dataset.path}:${el.dataset.line}:${label}`;
    if (pop.style.display !== "none" && pop.dataset.key === key) { hideRef(); return; }
    pop.dataset.key = key;
    showRef(el);
  }

  function showTerm(el: HTMLElement): void {
    const label = el.textContent?.trim() ?? "";
    const explain = conceptExplain(el.dataset.term || label) ?? "";
    pop.innerHTML =
      `<div class="term-kicker">${escText(plainLabel)}</div>` +
      (label ? `<div class="ref-name">${escText(label)}</div>` : "") +
      (explain ? `<div class="term-explain">${escText(explain)}</div>` : "");
    const rect = el.getBoundingClientRect();
    placePopover(rect.left, rect.bottom);
  }

  function toggleTerm(el: HTMLElement): void {
    const key = `term:${el.dataset.term}:${el.textContent?.trim() ?? ""}`;
    if (pop.style.display !== "none" && pop.dataset.key === key) { hideRef(); return; }
    pop.dataset.key = key;
    showTerm(el);
    setOpenTerm(el);
  }

  function bindPopover(selector: string, open: (el: HTMLElement) => void): void {
    document.querySelectorAll(selector).forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      // A term painted inside a feature button must not steal that button's click.
      if (el.closest(".ft-trigger")) return;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        open(el);
      });
      el.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        open(el);
      });
    });
  }

  bindPopover(".ref", toggleRef);
  bindPopover(".term", toggleTerm);

  document.querySelectorAll(".ft-trigger").forEach((node) => {
    if (!(node instanceof HTMLButtonElement)) return;
    const panelId = node.getAttribute("popovertarget");
    const panel = panelId ? document.getElementById(panelId) : null;
    if (!panel) return;
    panel.addEventListener("toggle", (event) => {
      const open = event instanceof ToggleEvent
        ? event.newState === "open"
        : panel.matches(":popover-open");
      node.setAttribute("aria-expanded", String(open));
    });
  });

  document.addEventListener("pointerdown", (e) => {
    if (pop.style.display === "none") return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (pop.contains(target)) return;
    // The comment layer sits outside the popover but acts on it: a click there must not close it.
    if (target.closest(".nsx-c-ui")) return;
    const term = target.closest(".term");
    if (target.closest(".ref") || (term && !term.closest(".ft-trigger")) || target.closest(".cy-canvas")) return;
    hideRef();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const feature = [...document.querySelectorAll(".ft-changes")].find(
      (el) => el instanceof HTMLElement && el.matches(":popover-open"),
    );
    const refOpen = pop.style.display !== "none";
    if (!refOpen && !(feature instanceof HTMLElement)) return;
    // One layer at a time, so the diagram dialog stays up for the next press.
    if (refOpen) hideRef();
    else if (feature instanceof HTMLElement) feature.hidePopover();
    e.preventDefault();
  });
  fileDialog.addEventListener("click", (e) => {
    if (e.target === fileDialog) fileDialog.close();
  });
  // Wheel stays inside the dialog. The code scroller takes it while it can.
  fileDialog.addEventListener("wheel", (e) => {
    e.stopPropagation();
    const scroller = fileDialog.querySelector("pre");
    const overCode = scroller instanceof HTMLElement && scroller.contains(e.target as Node);
    if (!scroller || !overCode || !scrollerCanTake(scroller, e)) e.preventDefault();
  }, { capture: true, passive: false });

  document.addEventListener("ns:open-file", (e) => {
    const detail = (e as CustomEvent<RefData>).detail;
    openFile(detail.path, detail.line);
  });
  document.addEventListener("ns:show-ref", (e) => {
    const detail = (e as CustomEvent<RefData>).detail;
    setOpenTerm(null);
    pop.dataset.key = `el:${detail.id}`;
    showRefData(detail, detail.x ?? 0, detail.y ?? 0);
  });
  document.addEventListener("ns:hide-ref", hideRef);

  const hljs = hljsApi();
  if (hljs) {
    hljs.registerLanguage("nspseudo", () => ({
      case_insensitive: true,
      contains: [
        hljs.COMMENT("#", "$"),
        hljs.COMMENT("//", "$"),
        { className: "keyword",
          begin: "\\b(nếu|thì|khác|ngược lại|mỗi|khi|trả|tạo|hủy|chờ|gọi|bỏ qua|đặt|và|hoặc|không|if|else|for|while|await|async|return|throw|catch|finally|when|then|else if|true|false|null)\\b" },
        { className: "number", begin: "\\b\\d[\\d_]*\\b" },
        { className: "string", begin: '"', end: '"' },
        { className: "string", begin: "'", end: "'" },
      ],
    }));
    document.querySelectorAll("pre.pcode code").forEach((el) =>
      hljs.highlightElement(el));
  }
}
