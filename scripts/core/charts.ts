// Server-side SVG charts for report templates. Pure functions: data in, SVG string out. No client JS.
// Colors come only from CSS classes in CHART_CSS, which use daisyUI 5 variables, so charts follow the theme.
// Every chart is readable without color: numbers are printed, series use different marker shapes and line
// dashes, gantt state and critical path have text or pattern cues, and each SVG has a <desc> with its data.
import type { Lang } from "./template.ts";

export interface ChartSeries {
  name: string;
  values: number[];
}
export interface ChartSpec {
  id?: string;
  kind: "bar" | "stacked" | "line" | "scatter";
  title?: string;
  unit?: string;
  x: string[];
  series: ChartSeries[];
  source?: string;
}
export interface GanttBar {
  id: string;
  label: string;
  start: number;
  end: number;
  critical?: boolean;
  group?: string;
  state?: string;
}
export interface RiskPoint {
  id: string;
  label: string;
  likelihood: number;
  impact: number;
}

const KINDS = ["bar", "stacked", "line", "scatter"] as const;
const PALETTE = 6;
const FONT = 11;

const COPY = {
  vi: {
    bar: "Biểu đồ cột",
    stacked: "Biểu đồ cột chồng",
    line: "Biểu đồ đường",
    scatter: "Biểu đồ điểm",
    total: "tổng",
    gantt: "Biểu đồ Gantt",
    noData: "Không có dữ liệu",
    critical: "Đường găng",
    done: "Xong",
    doing: "Đang làm",
    todo: "Chưa làm",
    blocked: "Bị chặn",
    risk: "Ma trận rủi ro",
    likelihood: "Khả năng",
    impact: "Tác động",
    low: "Thấp",
    medium: "Trung bình",
    high: "Cao",
    crit: "Nghiêm trọng",
    score: "điểm",
  },
  en: {
    bar: "Bar chart",
    stacked: "Stacked bar chart",
    line: "Line chart",
    scatter: "Scatter chart",
    total: "total",
    gantt: "Gantt chart",
    noData: "No data",
    critical: "Critical path",
    done: "Done",
    doing: "In progress",
    todo: "To do",
    blocked: "Blocked",
    risk: "Risk matrix",
    likelihood: "Likelihood",
    impact: "Impact",
    low: "Low",
    medium: "Medium",
    high: "High",
    crit: "Critical",
    score: "score",
  },
} as const;

type Copy = Record<keyof (typeof COPY)["vi"], string>;

function copy(lang: Lang | undefined): Copy {
  return COPY[lang === "en" ? "en" : "vi"];
}

function esc(s: unknown): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

/** Coordinate with at most 2 decimals. */
function n2(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** Number as shown to the reader. */
function fmt(n: number): string {
  if (Math.abs(n) >= 1000) return String(Math.round(n));
  return String(Number(n.toPrecision(4)));
}

/** Rough text width in px for the chart font. */
function tw(s: string, size = FONT): number {
  return s.length * size * 0.58;
}

function trunc(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s;
}

/**
 * Nice axis ticks that cover [min, max]. Steps are 1, 2, 2.5, 5 times a power of ten.
 * Returns the smallest step that gives at most 6 ticks (so 4 to 6 ticks for normal ranges).
 * `target` is the preferred tick count and only sets the starting step size.
 */
export function niceTicks(min: number, max: number, target = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min > max) [min, max] = [max, min];
  if (min === max) {
    if (min === 0) return [0, 1];
    if (min > 0) max = min, min = 0;
    else max = 0;
  }
  const range = max - min;
  const mag0 = Math.floor(Math.log10(range / Math.max(2, target * 2)));
  for (let mag = mag0; mag < mag0 + 8; mag++) {
    const base = 10 ** mag;
    for (const m of [1, 2, 2.5, 5]) {
      const step = m * base;
      const lo = Math.floor(min / step + 1e-9) * step;
      const hi = Math.ceil(max / step - 1e-9) * step;
      const count = Math.round((hi - lo) / step) + 1;
      if (count <= 6) {
        const out: number[] = [];
        for (let i = 0; i < count; i++) out.push(Number((lo + i * step).toFixed(10)));
        return out;
      }
    }
  }
  return [min, max];
}

// ---------- CSS ----------

export const CHART_CSS: string = `
.nsx-chart{display:block;width:100%;height:auto;max-width:100%;overflow:visible}
.nsx-chart text{fill:var(--color-base-content);font-size:${FONT}px;font-family:inherit}
.nsx-chart .nsx-muted{opacity:.65}
.nsx-chart .nsx-axis-title{opacity:.75;font-size:${FONT}px}
.nsx-chart .nsx-grid{stroke:var(--color-base-300);stroke-width:1}
.nsx-chart .nsx-axis{stroke:var(--color-base-content);stroke-opacity:.5;stroke-width:1}
.nsx-chart .nsx-val{font-size:10px;font-weight:600}
.nsx-chart .nsx-total{font-size:10px;font-weight:700}
.nsx-chart .nsx-s0{--c:var(--color-primary);--t:var(--color-primary-content)}
.nsx-chart .nsx-s1{--c:var(--color-secondary);--t:var(--color-secondary-content)}
.nsx-chart .nsx-s2{--c:var(--color-accent);--t:var(--color-accent-content)}
.nsx-chart .nsx-s3{--c:var(--color-info);--t:var(--color-info-content)}
.nsx-chart .nsx-s4{--c:var(--color-success);--t:var(--color-success-content)}
.nsx-chart .nsx-s5{--c:var(--color-warning);--t:var(--color-warning-content)}
.nsx-chart .nsx-bar,.nsx-chart .nsx-sw{fill:var(--c)}
.nsx-chart text.nsx-seg{fill:var(--t);font-size:10px;font-weight:600}
.nsx-chart .nsx-line{fill:none;stroke:var(--c);stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
.nsx-chart .nsx-line.nsx-s1{stroke-dasharray:7 3}
.nsx-chart .nsx-line.nsx-s2{stroke-dasharray:2 3}
.nsx-chart .nsx-line.nsx-s3{stroke-dasharray:9 3 2 3}
.nsx-chart .nsx-line.nsx-s4{stroke-dasharray:4 2}
.nsx-chart .nsx-line.nsx-s5{stroke-dasharray:1 3}
.nsx-chart .nsx-pt{fill:var(--c);stroke:var(--color-base-100);stroke-width:1}
.nsx-chart .nsx-pt.nsx-hollow{fill:var(--color-base-100);stroke:var(--c);stroke-width:2}
.nsx-chart .nsx-gbar{--c:var(--color-primary)}
.nsx-chart .nsx-gbar.nsx-crit{--c:var(--color-error)}
.nsx-chart .nsx-gb{fill:var(--c);stroke:var(--c);stroke-width:1.5}
.nsx-chart .nsx-gbar.nsx-crit .nsx-gb{stroke-width:3}
.nsx-chart .nsx-st-todo .nsx-gb{fill-opacity:.2}
.nsx-chart .nsx-st-doing .nsx-gb{fill-opacity:.55}
.nsx-chart .nsx-st-done .nsx-gb{fill-opacity:1}
.nsx-chart .nsx-st-blocked .nsx-gb{fill:none;stroke-dasharray:4 3}
.nsx-chart .nsx-hatch{fill:url(#nsx-hatch);pointer-events:none}
.nsx-chart .nsx-hatch-line{stroke:var(--color-base-100);stroke-opacity:.55;stroke-width:2}
.nsx-chart .nsx-grouprow{fill:var(--color-base-300);fill-opacity:.45}
.nsx-chart .nsx-group{font-weight:700}
.nsx-chart .nsx-mark{font-weight:700;fill:var(--color-error)}
.nsx-chart .nsx-cell{stroke:var(--color-base-100);stroke-width:2}
.nsx-chart .nsx-low{fill:var(--color-success);fill-opacity:.25}
.nsx-chart .nsx-medium{fill:var(--color-warning);fill-opacity:.3}
.nsx-chart .nsx-high{fill:var(--color-warning);fill-opacity:.7}
.nsx-chart .nsx-critical{fill:var(--color-error);fill-opacity:.55}
.nsx-chart .nsx-score{font-size:9px;opacity:.55}
.nsx-chart .nsx-risk circle{fill:var(--color-base-100);stroke:var(--color-base-content);stroke-width:1.5}
.nsx-chart .nsx-risk text{font-weight:700}
`.trim();

// ---------- shared SVG parts ----------

interface Svg {
  w: number;
  h: number;
  label: string;
  title: string;
  desc: string;
  body: string;
}

function svgRoot(s: Svg): string {
  return (
    `<svg class="nsx-chart" role="img" aria-label="${esc(s.label)}" width="100%" viewBox="0 0 ${n2(s.w)} ${n2(s.h)}" xmlns="http://www.w3.org/2000/svg">` +
    `<title>${esc(s.title)}</title><desc>${esc(s.desc)}</desc>${s.body}</svg>`
  );
}

function text(x: number, y: number, s: string, cls = "", anchor = "middle", extra = ""): string {
  const c = cls ? ` class="${cls}"` : "";
  return `<text${c} x="${n2(x)}" y="${n2(y)}" text-anchor="${anchor}"${extra}>${esc(s)}</text>`;
}

/** Marker shapes differ by series so series are told apart without color. */
function marker(k: number, cx: number, cy: number, tip: string): string {
  const c = `nsx-pt nsx-s${k % PALETTE}`;
  const t = `<title>${esc(tip)}</title>`;
  const x = n2(cx);
  const y = n2(cy);
  switch (k % PALETTE) {
    case 1:
      return `<rect class="${c}" x="${n2(cx - 4)}" y="${n2(cy - 4)}" width="8" height="8">${t}</rect>`;
    case 2:
      return `<polygon class="${c}" points="${x},${n2(cy - 5.5)} ${n2(cx + 5.5)},${y} ${x},${n2(cy + 5.5)} ${n2(cx - 5.5)},${y}">${t}</polygon>`;
    case 3:
      return `<polygon class="${c}" points="${x},${n2(cy - 5.5)} ${n2(cx + 5)},${n2(cy + 4)} ${n2(cx - 5)},${n2(cy + 4)}">${t}</polygon>`;
    case 4:
      return `<polygon class="${c}" points="${n2(cx - 5)},${n2(cy - 4)} ${n2(cx + 5)},${n2(cy - 4)} ${x},${n2(cy + 5.5)}">${t}</polygon>`;
    case 5:
      return `<circle class="${c} nsx-hollow" cx="${x}" cy="${y}" r="4.5">${t}</circle>`;
    default:
      return `<circle class="${c}" cx="${x}" cy="${y}" r="4.5">${t}</circle>`;
  }
}

/** Legend swatch drawn like the series itself. */
function seriesSwatch(kind: ChartSpec["kind"], k: number, x: number, y: number): string {
  const cls = `nsx-s${k % PALETTE}`;
  if (kind === "line") {
    return `<line class="nsx-line ${cls}" x1="${n2(x)}" y1="${n2(y + 6)}" x2="${n2(x + 22)}" y2="${n2(y + 6)}"/>` + marker(k, x + 11, y + 6, "");
  }
  if (kind === "scatter") return marker(k, x + 11, y + 6, "");
  return `<rect class="nsx-sw ${cls}" x="${n2(x)}" y="${n2(y)}" width="12" height="12" rx="2"/>`;
}

interface LegendItem {
  width: number;
  svg: (x: number, y: number) => string;
}

/** Lays legend items in wrapped rows. Returns the SVG and the height used. */
function legend(items: LegendItem[], x0: number, y0: number, maxW: number): { svg: string; h: number } {
  let x = x0;
  let y = y0;
  let out = "";
  const rowH = 18;
  for (const it of items) {
    if (x > x0 && x + it.width > x0 + maxW) {
      x = x0;
      y += rowH;
    }
    out += it.svg(x, y);
    x += it.width + 14;
  }
  return { svg: out, h: y - y0 + rowH };
}

// ---------- bar / stacked / line / scatter ----------

function isNumericAxis(x: string[]): boolean {
  return x.length > 0 && x.every((s) => s.trim() !== "" && Number.isFinite(Number(s)));
}

function dataDesc(spec: ChartSpec, c: Copy): string {
  const parts = spec.series.map((s) => {
    const pairs = spec.x.map((x, i) => `${x} = ${fmt(s.values[i])}`).join("; ");
    return `${s.name}: ${pairs}`;
  });
  let out = `${c[spec.kind]}${spec.unit ? ` (${spec.unit})` : ""}. ${parts.join(". ")}.`;
  if (spec.kind === "stacked") {
    const totals = spec.x.map((x, i) => `${x} = ${fmt(spec.series.reduce((a, s) => a + s.values[i], 0))}`).join("; ");
    out += ` ${c.total}: ${totals}.`;
  }
  return out;
}

export function chartSvg(spec: ChartSpec, opts: { width?: number; height?: number; lang?: Lang } = {}): string {
  const c = copy(opts.lang);
  const W = Math.max(240, Math.round(opts.width ?? 640));
  const nx = spec.x.length;
  const ns = spec.series.length;
  const kind = spec.kind;
  const label = spec.title?.trim() || c[kind];
  if (nx === 0 || ns === 0) {
    return svgRoot({ w: W, h: 40, label, title: label, desc: c.noData, body: text(W / 2, 24, c.noData, "nsx-muted") });
  }

  // value domain
  let dmin = Infinity;
  let dmax = -Infinity;
  const add = (v: number) => {
    if (v < dmin) dmin = v;
    if (v > dmax) dmax = v;
  };
  if (kind === "bar" || kind === "stacked") add(0);
  if (kind === "stacked") {
    for (let i = 0; i < nx; i++) {
      let pos = 0;
      let neg = 0;
      for (const s of spec.series) (s.values[i] >= 0 ? (pos += s.values[i]) : (neg += s.values[i]));
      add(pos);
      add(neg);
    }
  } else {
    for (const s of spec.series) for (const v of s.values) add(v);
  }
  const yTicks = niceTicks(dmin, dmax);
  const lo = yTicks[0];
  const hi = yTicks[yTicks.length - 1];

  // horizontal scale
  const numericX = kind === "scatter" && isNumericAxis(spec.x);
  const xNums = numericX ? spec.x.map(Number) : [];
  const xTicks = numericX ? niceTicks(Math.min(...xNums), Math.max(...xNums)) : [];

  // margins
  const unit = spec.unit?.trim();
  const ML = (unit ? 16 : 4) + Math.max(...yTicks.map((t) => tw(fmt(t)))) + 12;
  const MR = 14;
  const MT = 22;
  const plotW = W - ML - MR;
  const band = plotW / nx;

  // x labels: truncate, or rotate when they do not fit
  const maxLen = Math.max(...spec.x.map((s) => s.length));
  let rotate = false;
  let maxChars = Math.max(3, Math.floor(band / (FONT * 0.58)));
  if (!numericX && maxLen > maxChars && maxChars < 6) {
    rotate = true;
    maxChars = 18;
  }
  const xLabelH = numericX ? 22 : rotate ? 12 + Math.min(maxLen, maxChars) * 5.6 : 22;

  // legend
  const showLegend = ns > 1;
  const legItems: LegendItem[] = showLegend
    ? spec.series.map((s, k) => {
        const lt = { label: trunc(s.name, 32), width: 18 + tw(trunc(s.name, 32)) };
        return {
          width: lt.width,
          svg: (x, y) =>
            `<g>${seriesSwatch(kind, k, x, y)}${text(x + (kind === "line" || kind === "scatter" ? 28 : 18), y + 10, lt.label, "", "start")}</g>`,
        };
      })
    : [];
  const legendH = showLegend ? legend(legItems, ML, 0, plotW).h + 8 : 0;

  const plotH = opts.height ? Math.max(80, Math.round(opts.height) - MT - xLabelH - legendH) : 240;
  const H = MT + plotH + xLabelH + legendH;
  const yS = (v: number) => MT + plotH * (1 - (v - lo) / (hi - lo));
  const y0 = yS(0 >= lo && 0 <= hi ? 0 : lo);

  let g = "";
  // grid + y ticks
  for (const t of yTicks) {
    const y = yS(t);
    g += `<line class="nsx-grid" x1="${n2(ML)}" y1="${n2(y)}" x2="${n2(ML + plotW)}" y2="${n2(y)}"/>`;
    g += text(ML - 6, y + 3.5, fmt(t), "", "end");
  }
  if (unit) {
    const cy = MT + plotH / 2;
    g += `<text class="nsx-axis-title" transform="translate(12 ${n2(cy)}) rotate(-90)" text-anchor="middle">${esc(unit)}</text>`;
  }
  // zero / base axis
  g += `<line class="nsx-axis" x1="${n2(ML)}" y1="${n2(y0)}" x2="${n2(ML + plotW)}" y2="${n2(y0)}"/>`;
  g += `<line class="nsx-axis" x1="${n2(ML)}" y1="${n2(MT)}" x2="${n2(ML)}" y2="${n2(MT + plotH)}"/>`;

  // x labels
  const xBase = MT + plotH;
  if (numericX) {
    const xmin = xTicks[0];
    const xmax = xTicks[xTicks.length - 1];
    for (const t of xTicks) {
      const x = ML + ((t - xmin) / (xmax - xmin)) * plotW;
      g += `<line class="nsx-axis" x1="${n2(x)}" y1="${n2(xBase)}" x2="${n2(x)}" y2="${n2(xBase + 4)}"/>`;
      g += text(x, xBase + 16, fmt(t));
    }
  } else {
    for (let i = 0; i < nx; i++) {
      const cx = ML + band * (i + 0.5);
      const short = trunc(spec.x[i], maxChars);
      const tip = short === spec.x[i] ? "" : `<title>${esc(spec.x[i])}</title>`;
      if (rotate) {
        g += `<text transform="translate(${n2(cx)} ${n2(xBase + 12)}) rotate(-40)" text-anchor="end">${tip}${esc(short)}</text>`;
      } else {
        g += `<text x="${n2(cx)}" y="${n2(xBase + 16)}" text-anchor="middle">${tip}${esc(short)}</text>`;
      }
    }
  }

  // data
  const posX = (i: number): number =>
    numericX ? ML + ((xNums[i] - xTicks[0]) / (xTicks[xTicks.length - 1] - xTicks[0])) * plotW : ML + band * (i + 0.5);

  if (kind === "bar") {
    const groupW = Math.min(band * 0.8, ns * 56);
    const barW = groupW / ns;
    for (let i = 0; i < nx; i++) {
      const left = ML + band * (i + 0.5) - groupW / 2;
      for (let k = 0; k < ns; k++) {
        const v = spec.series[k].values[i];
        const yv = yS(v);
        const top = Math.min(yv, y0);
        const h = Math.abs(yv - y0);
        const bx = left + k * barW;
        const bw = Math.max(1, barW - (ns > 1 ? 2 : 0));
        g += `<rect class="nsx-bar nsx-s${k % PALETTE}" data-value="${fmt(v)}" x="${n2(bx)}" y="${n2(top)}" width="${n2(bw)}" height="${n2(h)}"><title>${esc(`${spec.series[k].name}, ${spec.x[i]}: ${fmt(v)}${unit ? ` ${unit}` : ""}`)}</title></rect>`;
        const lab = fmt(v);
        if (bw >= lab.length * 5.5) g += text(bx + bw / 2, v >= 0 ? top - 4 : top + h + 11, lab, "nsx-val");
      }
    }
  } else if (kind === "stacked") {
    const barW = Math.min(band * 0.6, 64);
    for (let i = 0; i < nx; i++) {
      const bx = ML + band * (i + 0.5) - barW / 2;
      let pos = 0;
      let neg = 0;
      let total = 0;
      for (let k = 0; k < ns; k++) {
        const v = spec.series[k].values[i];
        total += v;
        const from = v >= 0 ? pos : neg;
        const to = from + v;
        if (v >= 0) pos = to;
        else neg = to;
        const ya = yS(from);
        const yb = yS(to);
        const top = Math.min(ya, yb);
        const h = Math.abs(ya - yb);
        g += `<rect class="nsx-bar nsx-s${k % PALETTE}" data-value="${fmt(v)}" x="${n2(bx)}" y="${n2(top)}" width="${n2(barW)}" height="${n2(h)}"><title>${esc(`${spec.series[k].name}, ${spec.x[i]}: ${fmt(v)}${unit ? ` ${unit}` : ""}`)}</title></rect>`;
        const lab = fmt(v);
        if (h >= 14 && barW >= lab.length * 6 + 4) g += text(bx + barW / 2, top + h / 2 + 3.5, lab, `nsx-seg nsx-s${k % PALETTE}`);
      }
      const above = pos > 0 || neg === 0;
      const ty = above ? yS(pos) - 4 : yS(neg) + 11;
      g += `<text class="nsx-total" data-total="${fmt(total)}" x="${n2(bx + barW / 2)}" y="${n2(ty)}" text-anchor="middle">${esc(fmt(total))}</text>`;
    }
  } else {
    // line + scatter
    for (let k = 0; k < ns; k++) {
      const s = spec.series[k];
      const pts = s.values.map((v, i) => ({ x: posX(i), y: yS(v), v, i }));
      if (kind === "line") {
        const line = pts.map((p) => `${n2(p.x)},${n2(p.y)}`).join(" ");
        g += `<polyline class="nsx-line nsx-s${k % PALETTE}" points="${line}"/>`;
      }
      const labelPoints = (kind === "line" ? band >= 34 : numericX ? nx <= 12 : band >= 34) && ns <= 3;
      for (const p of pts) {
        g += marker(k, p.x, p.y, `${s.name}, ${spec.x[p.i]}: ${fmt(p.v)}${unit ? ` ${unit}` : ""}`);
        if (labelPoints) g += text(p.x, k % 2 === 0 ? p.y - 9 : p.y + 17, fmt(p.v), "nsx-val");
      }
    }
  }

  if (showLegend) g += legend(legItems, ML, MT + plotH + xLabelH + 4, plotW).svg;

  return svgRoot({ w: W, h: H, label, title: label, desc: dataDesc(spec, c), body: g });
}

// ---------- validation ----------

const SOURCE_NOTE = "a chart is a claim, too";

export function validateChart(raw: unknown, where: string, sourceIds: Set<string>, warnings: string[]): ChartSpec | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    warnings.push(`${where}: chart must be an object — skipped`);
    return null;
  }
  const o = raw as Record<string, unknown>;
  const kind = o.kind;
  if (typeof kind !== "string" || !(KINDS as readonly string[]).includes(kind)) {
    warnings.push(`${where}: unknown kind ${JSON.stringify(kind)}; use one of ${KINDS.join(", ")} — chart skipped`);
    return null;
  }
  if (!Array.isArray(o.x) || o.x.length === 0) {
    warnings.push(`${where}: x must be a non-empty array of labels — chart skipped`);
    return null;
  }
  const x: string[] = [];
  for (const v of o.x) {
    const s = typeof v === "number" && Number.isFinite(v) ? String(v) : v;
    if (typeof s !== "string" || s.trim() === "") {
      warnings.push(`${where}: every x label must be a non-empty string — chart skipped`);
      return null;
    }
    x.push(s);
  }
  if (!Array.isArray(o.series) || o.series.length === 0) {
    warnings.push(`${where}: series must be a non-empty array — chart skipped`);
    return null;
  }
  const series: ChartSeries[] = [];
  for (let k = 0; k < o.series.length; k++) {
    const sr = o.series[k] as Record<string, unknown> | null;
    const at = `${where}.series[${k}]`;
    if (!sr || typeof sr !== "object" || !Array.isArray(sr.values)) {
      warnings.push(`${at}: needs name and values array — chart skipped`);
      return null;
    }
    if (sr.values.length !== x.length) {
      warnings.push(`${at}: has ${sr.values.length} values but x has ${x.length} labels; lengths must match — chart skipped`);
      return null;
    }
    const bad = sr.values.findIndex((v) => typeof v !== "number" || !Number.isFinite(v));
    if (bad >= 0) {
      warnings.push(`${at}: values[${bad}] is not a finite number (${JSON.stringify(sr.values[bad]) ?? "undefined"}) — chart skipped`);
      return null;
    }
    const name = typeof sr.name === "string" && sr.name.trim() ? sr.name : "";
    if (!name) warnings.push(`${at}: needs a name`);
    series.push({ name: name || `#${k + 1}`, values: sr.values as number[] });
  }
  const spec: ChartSpec = { kind: kind as ChartSpec["kind"], x, series };
  if (typeof o.id === "string") spec.id = o.id;
  if (typeof o.title === "string") spec.title = o.title;
  if (typeof o.unit === "string") spec.unit = o.unit;
  if (typeof o.source === "string" && o.source) spec.source = o.source;

  if (!spec.source) {
    warnings.push(`${where}: needs a source id from sources — ${SOURCE_NOTE}`);
  } else if (!sourceIds.has(spec.source)) {
    warnings.push(`${where}: source "${spec.source}" is not in sources — ${SOURCE_NOTE}`);
  }
  if (spec.kind === "stacked" && series.some((s) => s.values.some((v) => v < 0))) {
    warnings.push(`${where}: stacked chart has negative values; segments stack from zero in both directions and the total may mislead`);
  }
  return spec;
}

// ---------- gantt ----------

const STATES = ["todo", "doing", "done", "blocked"] as const;

function stateOf(s: string | undefined): (typeof STATES)[number] {
  return (STATES as readonly string[]).includes(s ?? "") ? (s as (typeof STATES)[number]) : "todo";
}

export function ganttSvg(bars: GanttBar[], opts: { unit?: string; lang?: Lang } = {}): string {
  const c = copy(opts.lang);
  const W = 640;
  const unit = opts.unit?.trim() ?? "";
  if (bars.length === 0) {
    return svgRoot({ w: W, h: 40, label: c.gantt, title: c.gantt, desc: c.noData, body: text(W / 2, 24, c.noData, "nsx-muted") });
  }
  const rows = bars.map((b) => {
    const start = Number.isFinite(b.start) ? b.start : 0;
    const end = Number.isFinite(b.end) ? Math.max(b.end, start) : start;
    return { ...b, start, end, group: b.group?.trim() ?? "", state: stateOf(b.state) };
  });
  // stable grouping: groups in order of first appearance, bars keep input order inside a group
  const groups: string[] = [];
  for (const r of rows) if (!groups.includes(r.group)) groups.push(r.group);
  const hasGroups = groups.some((g) => g !== "");

  const maxEnd = Math.max(...rows.map((r) => r.end), 0) || 1;
  const rowLabel = (r: (typeof rows)[number]) => `${r.critical ? "★ " : ""}${r.id} ${r.label}`.trim();
  const labelMax = 38;
  const LW = Math.min(280, Math.max(120, Math.max(...rows.map((r) => tw(trunc(rowLabel(r), labelMax)))) + 16));
  const x0 = LW + 8;
  const x1 = W - 76;
  const plotW = x1 - x0;
  const xS = (v: number) => x0 + (v / maxEnd) * plotW;

  const MT = 6;
  const barRowH = 26;
  const groupRowH = 22;
  let y = MT;
  let rowsSvg = "";
  const layout: { y: number; h: number }[] = [];
  for (const g of groups) {
    if (hasGroups && g !== "") {
      rowsSvg += `<rect class="nsx-grouprow" x="0" y="${n2(y)}" width="${W}" height="${groupRowH}" rx="3"/>`;
      rowsSvg += text(6, y + 15, trunc(g, 60), "nsx-group", "start");
      y += groupRowH;
    }
    for (const r of rows.filter((q) => q.group === g)) {
      const bx = xS(r.start);
      const bw = Math.max(2, xS(r.end) - bx);
      const by = y + 6;
      const dur = `${Number((r.end - r.start).toFixed(1))}${unit ? ` ${unit}` : ""}`;
      const tip = `${r.id} ${r.label}: ${fmt(r.start)}–${fmt(r.end)}${unit ? ` ${unit}` : ""} (${c[r.state]}${r.critical ? `, ${c.critical}` : ""})`;
      const full = rowLabel(r);
      const short = trunc(full, labelMax);
      const labelTip = short === full ? "" : `<title>${esc(full)}</title>`;
      const crit = r.critical ? " nsx-crit" : "";
      rowsSvg += `<g class="nsx-gbar nsx-st-${r.state}${crit}" data-id="${esc(r.id)}" data-start="${fmt(r.start)}" data-end="${fmt(r.end)}">`;
      rowsSvg += `<title>${esc(tip)}</title>`;
      rowsSvg += `<text x="4" y="${n2(y + 17)}" text-anchor="start">${labelTip}${esc(short)}</text>`;
      rowsSvg += `<rect class="nsx-gb" x="${n2(bx)}" y="${n2(by)}" width="${n2(bw)}" height="14" rx="2"/>`;
      if (r.state === "done") rowsSvg += `<rect class="nsx-hatch" x="${n2(bx)}" y="${n2(by)}" width="${n2(bw)}" height="14" rx="2"/>`;
      rowsSvg += text(bx + bw + 5, y + 17, r.critical ? `${dur} ★` : dur, r.critical ? "nsx-mark" : "nsx-muted", "start");
      rowsSvg += `</g>`;
      layout.push({ y, h: barRowH });
      y += barRowH;
    }
  }
  const plotBottom = y + 2;

  // axis + grid
  let axis = "";
  const ticks = niceTicks(0, maxEnd).filter((t) => t >= 0 && t <= maxEnd + 1e-9);
  for (const t of ticks) {
    const x = xS(t);
    axis += `<line class="nsx-grid" x1="${n2(x)}" y1="${MT}" x2="${n2(x)}" y2="${n2(plotBottom)}"/>`;
    axis += text(x, plotBottom + 14, fmt(t));
  }
  axis += `<line class="nsx-axis" x1="${n2(x0)}" y1="${n2(plotBottom)}" x2="${n2(x1)}" y2="${n2(plotBottom)}"/>`;
  if (unit) axis += text(x1 + 8, plotBottom + 14, unit, "nsx-axis-title", "start");
  const axisH = 24;

  // legend: only states in use, plus critical path
  const used = new Set(rows.map((r) => r.state));
  const items: LegendItem[] = [];
  for (const s of STATES) {
    if (!used.has(s)) continue;
    const l = c[s];
    items.push({
      width: 30 + tw(l),
      svg: (x, ly) =>
        `<g class="nsx-gbar nsx-st-${s}"><rect class="nsx-gb" x="${n2(x)}" y="${n2(ly)}" width="22" height="12" rx="2"/>` +
        (s === "done" ? `<rect class="nsx-hatch" x="${n2(x)}" y="${n2(ly)}" width="22" height="12" rx="2"/>` : "") +
        `</g>${text(x + 28, ly + 10, l, "", "start")}`,
    });
  }
  if (rows.some((r) => r.critical)) {
    const l = `★ ${c.critical}`;
    items.push({
      width: 30 + tw(l),
      svg: (x, ly) =>
        `<g class="nsx-gbar nsx-crit nsx-st-doing"><rect class="nsx-gb" x="${n2(x)}" y="${n2(ly)}" width="22" height="12" rx="2"/></g>${text(x + 28, ly + 10, l, "nsx-mark", "start")}`,
    });
  }
  const leg = legend(items, 4, plotBottom + axisH + 4, W - 8);
  const H = plotBottom + axisH + 4 + leg.h + 4;

  const body =
    `<defs><pattern id="nsx-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line class="nsx-hatch-line" x1="0" y1="0" x2="0" y2="6"/></pattern></defs>` +
    axis +
    rowsSvg +
    leg.svg;
  const desc =
    `${c.gantt}${unit ? ` (${unit})` : ""}. ` +
    groups
      .flatMap((g) => rows.filter((r) => r.group === g))
      .map((r) => `${r.id} ${r.label}${r.group ? ` [${r.group}]` : ""}: ${fmt(r.start)}–${fmt(r.end)}, ${c[r.state]}${r.critical ? `, ${c.critical}` : ""}`)
      .join(". ") +
    ".";
  return svgRoot({ w: W, h: H, label: c.gantt, title: c.gantt, desc, body });
}

// ---------- risk matrix ----------

type Tone = "low" | "medium" | "high" | "critical";

function clamp15(v: number): number {
  return Math.min(5, Math.max(1, Math.round(Number.isFinite(v) ? v : 1)));
}

export function riskMatrixSvg(
  points: RiskPoint[],
  opts: { lang?: Lang; axisLabels?: { likelihood: string; impact: string } } = {},
): string {
  const c = copy(opts.lang);
  const axL = opts.axisLabels?.likelihood ?? c.likelihood;
  const axI = opts.axisLabels?.impact ?? c.impact;
  const CELL = 80;
  const ML = 64;
  const MT = 10;
  const MR = 12;
  const W = ML + CELL * 5 + MR;
  const gridBottom = MT + CELL * 5;

  let g = "";
  // cells: row 0 is impact 5
  for (let imp = 5; imp >= 1; imp--) {
    for (let lik = 1; lik <= 5; lik++) {
      const score = lik * imp;
      const cx = ML + (lik - 1) * CELL;
      const cy = MT + (5 - imp) * CELL;
      const band: Tone = score >= 15 ? "critical" : score >= 10 ? "high" : score >= 5 ? "medium" : "low";
      g += `<rect class="nsx-cell nsx-${band}" data-likelihood="${lik}" data-impact="${imp}" data-score="${score}" x="${cx}" y="${cy}" width="${CELL}" height="${CELL}"><title>${esc(`${c.likelihood} ${lik} × ${c.impact} ${imp} = ${score}`)}</title></rect>`;
      g += text(cx + CELL - 5, cy + 12, String(score), "nsx-score", "end");
    }
  }
  // axes
  for (let i = 1; i <= 5; i++) {
    g += text(ML + (i - 0.5) * CELL, gridBottom + 15, String(i));
    g += text(ML - 8, MT + (5 - i + 0.5) * CELL + 4, String(i), "", "end");
  }
  g += text(ML + (CELL * 5) / 2, gridBottom + 33, axL, "nsx-axis-title");
  g += `<text class="nsx-axis-title" transform="translate(14 ${n2(MT + (CELL * 5) / 2)}) rotate(-90)" text-anchor="middle">${esc(axI)}</text>`;

  // points: grouped by cell, laid out on a grid inside the cell
  const byCell = new Map<string, RiskPoint[]>();
  for (const p of points) {
    const key = `${clamp15(p.likelihood)},${clamp15(p.impact)}`;
    const list = byCell.get(key);
    if (list) list.push(p);
    else byCell.set(key, [p]);
  }
  const PAD = 6;
  for (const [key, list] of byCell) {
    const [lik, imp] = key.split(",").map(Number);
    const cx0 = ML + (lik - 1) * CELL;
    const cy0 = MT + (5 - imp) * CELL;
    const n = list.length;
    const cols = Math.ceil(Math.sqrt(n));
    const rowsN = Math.ceil(n / cols);
    const inner = CELL - 2 * PAD;
    const step = Math.min(inner / cols, inner / rowsN);
    const r = Math.max(5, Math.min(15, step / 2 - 1));
    const fs = Math.max(7, Math.min(11, r * 0.75));
    list.forEach((p, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const inRow = row === rowsN - 1 ? n - cols * (rowsN - 1) : cols;
      const px = cx0 + CELL / 2 + (col - (inRow - 1) / 2) * step;
      const py = cy0 + CELL / 2 + (row - (rowsN - 1) / 2) * step + 3;
      g += `<g class="nsx-risk" data-id="${esc(p.id)}" data-x="${n2(px)}" data-y="${n2(py)}" data-r="${n2(r)}"><title>${esc(`${p.id}: ${p.label} (${c.likelihood} ${lik} × ${c.impact} ${imp} = ${lik * imp})`)}</title>`;
      g += `<circle cx="${n2(px)}" cy="${n2(py - 3)}" r="${n2(r)}"/>`;
      g += `<text x="${n2(px)}" y="${n2(py - 3 + fs * 0.36)}" text-anchor="middle" style="font-size:${n2(fs)}px">${esc(trunc(p.id, 5))}</text></g>`;
    });
  }

  // tone legend
  const bands: [Tone, string, string][] = [
    ["low", c.low, "1–4"],
    ["medium", c.medium, "5–9"],
    ["high", c.high, "10–14"],
    ["critical", c.crit, "15–25"],
  ];
  const items: LegendItem[] = bands.map(([t, name, range]) => {
    const l = `${name} ${range}`;
    return {
      width: 22 + tw(l),
      svg: (x, y) => `<rect class="nsx-cell nsx-${t}" x="${n2(x)}" y="${n2(y)}" width="14" height="12"/>${text(x + 20, y + 10, l, "", "start")}`,
    };
  });
  const leg = legend(items, ML, gridBottom + 44, CELL * 5);
  const H = gridBottom + 44 + leg.h + 4;

  const desc =
    `${c.risk}. ` +
    (points.length === 0
      ? `${c.noData}.`
      : points
          .map((p) => `${p.id} ${p.label}: ${c.likelihood} ${clamp15(p.likelihood)}, ${c.impact} ${clamp15(p.impact)}, ${c.score} ${clamp15(p.likelihood) * clamp15(p.impact)}`)
          .join(". ") + ".");
  return svgRoot({ w: W, h: H, label: c.risk, title: c.risk, desc, body: g + leg.svg });
}
