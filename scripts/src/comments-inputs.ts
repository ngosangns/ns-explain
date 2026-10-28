// Page inputs the reader fills in (planner answers, the approve / request-changes decision).
// Values persist in localStorage, scoped per report, and are restored on load.
import { scrollAndFlash } from "./comments-targets.ts";
import type { ReportAnswer, ReportDecision, Verdict } from "./comments-report.ts";

interface Stored {
  inputs: Record<string, string>;
  verdict: Verdict;
  note: string;
}

const INPUT_SELECTOR = "[data-nsx-input]";

function isVerdict(v: unknown): v is Verdict {
  return v === "approve" || v === "request-changes";
}

/** Current value of an input element or a radio-group container. */
function valueOf(node: HTMLElement): string {
  if (node instanceof HTMLInputElement && node.type === "radio") {
    return node.checked ? node.value : "";
  }
  if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement) {
    return node.value;
  }
  return node.querySelector<HTMLInputElement>("input[type=radio]:checked")?.value ?? "";
}

function setValue(node: HTMLElement, value: string): void {
  if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement) {
    if (node instanceof HTMLInputElement && node.type === "radio") node.checked = node.value === value;
    else node.value = value;
    return;
  }
  node.querySelectorAll<HTMLInputElement>("input[type=radio]").forEach((r) => {
    r.checked = r.value === value;
  });
}

export function createInputs(main: HTMLElement, scope: string, onChange: () => void) {
  const storageKey = `nsx:${scope}:inputs`;
  const state: Stored = { inputs: {}, verdict: "", note: "" };

  const decisionEl = main.querySelector<HTMLElement>("[data-nsx-decision]");
  const noteEl = decisionEl?.querySelector<HTMLTextAreaElement>("[data-nsx-decision-note]") ?? null;
  const verdictBtns = decisionEl
    ? [...decisionEl.querySelectorAll<HTMLElement>("[data-nsx-verdict]")].filter((b) => isVerdict(b.dataset.nsxVerdict))
    : [];

  const fieldOf = (node: HTMLElement) => node.closest<HTMLElement>("[data-nsx-field]")?.dataset.nsxField ?? "";
  const labelOf = (node: HTMLElement) =>
    (node.closest<HTMLElement>("[data-nsx-label]")?.dataset.nsxLabel ?? "").replace(/\s+/g, " ").trim();
  const inputEls = () => [...main.querySelectorAll<HTMLElement>(INPUT_SELECTOR)].filter((n) => fieldOf(n));
  /** The element that owns an input event: a radio reports its group container when one is marked. */
  const ownerOf = (target: Element) => target.closest<HTMLElement>(INPUT_SELECTOR);

  function save(): void {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Storage blocked or full: the values still live in the page.
    }
  }

  function paintVerdict(): void {
    verdictBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.nsxVerdict === state.verdict)));
  }

  function load(): void {
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey) ?? "null") as Partial<Stored> | null;
      if (raw && typeof raw === "object") {
        if (raw.inputs && typeof raw.inputs === "object") {
          for (const [k, v] of Object.entries(raw.inputs)) if (typeof v === "string") state.inputs[k] = v;
        }
        if (isVerdict(raw.verdict)) state.verdict = raw.verdict;
        if (typeof raw.note === "string") state.note = raw.note;
      }
    } catch {
      // Corrupt entry: start empty.
    }
    for (const node of inputEls()) {
      const v = state.inputs[fieldOf(node)];
      if (v != null) setValue(node, v);
    }
    if (noteEl) noteEl.value = state.note;
    paintVerdict();
  }

  /** Re-read every input from the page (a radio group changes through any of its members). */
  function collect(): void {
    state.inputs = {};
    for (const node of inputEls()) {
      const v = valueOf(node);
      if (v.trim()) state.inputs[fieldOf(node)] = v;
    }
    state.note = noteEl?.value ?? "";
  }

  function changed(): void {
    collect();
    save();
    onChange();
  }

  function onEdit(e: Event): void {
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (ownerOf(target) || (noteEl && target === noteEl)) changed();
  }
  main.addEventListener("input", onEdit);
  main.addEventListener("change", onEdit);
  // Keys typed in a field are the reader's own: nothing else on the page may react to them.
  main.addEventListener("keyup", (e) => {
    const target = e.target;
    if (target instanceof Element && (ownerOf(target) || (noteEl && target === noteEl))) e.stopPropagation();
  });

  verdictBtns.forEach((b) =>
    b.addEventListener("click", () => {
      const v = b.dataset.nsxVerdict;
      if (!isVerdict(v)) return;
      state.verdict = state.verdict === v ? "" : v;
      paintVerdict();
      save();
      onChange();
    }));

  load();

  return {
    answers(): ReportAnswer[] {
      const seen = new Set<string>();
      const out: ReportAnswer[] = [];
      for (const node of inputEls()) {
        const field = fieldOf(node);
        const value = valueOf(node);
        if (!value.trim() || seen.has(field)) continue;
        seen.add(field);
        out.push({ label: labelOf(node), field, value });
      }
      return out;
    },
    decision(): ReportDecision {
      return { verdict: state.verdict, note: state.note };
    },
    /** Scroll to and flash the element for an answer field, or the decision block. */
    reveal(field: string | null): void {
      const node = field === null ? decisionEl : inputEls().find((n) => fieldOf(n) === field);
      if (node) scrollAndFlash(node.closest("[data-nsx-field]") ?? node);
    },
    clear(): void {
      for (const node of inputEls()) setValue(node, "");
      if (noteEl) noteEl.value = "";
      state.inputs = {};
      state.verdict = "";
      state.note = "";
      paintVerdict();
      save();
    },
  };
}
