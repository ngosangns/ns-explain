// Tests for the server-side SVG charts: what a reader sees in the output (ticks, bar sizes, markers,
// risk bands, escaping) and which warnings an author gets for bad chart data. Run with `bun test`.
import { describe, expect, test } from "bun:test";
import { CHART_CSS, chartSvg, ganttSvg, niceTicks, riskMatrixSvg, validateChart } from "./core/charts.ts";
import type { ChartSpec } from "./core/charts.ts";

const num = (s: string, attr: string): number => {
  const m = s.match(new RegExp(`${attr}="(-?[\\d.]+)"`));
  if (!m) throw new Error(`no ${attr} in ${s}`);
  return Number(m[1]);
};

describe("niceTicks", () => {
  test("gives round ticks that cover the range", () => {
    expect(niceTicks(0, 87)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(niceTicks(0, 10)).toEqual([0, 2, 4, 6, 8, 10]);
  });
  test("keeps 4 to 6 ticks for ordinary ranges", () => {
    for (const max of [3, 7, 13, 48, 120, 999, 12345, 0.7]) {
      const t = niceTicks(0, max);
      expect(t.length).toBeGreaterThanOrEqual(3);
      expect(t.length).toBeLessThanOrEqual(6);
      expect(t[0]).toBeLessThanOrEqual(0);
      expect(t[t.length - 1]).toBeGreaterThanOrEqual(max);
    }
  });
  test("handles negative ranges and flat data", () => {
    const t = niceTicks(-30, 80);
    expect(t[0]).toBeLessThanOrEqual(-30);
    expect(t).toContain(0);
    expect(niceTicks(0, 0)).toEqual([0, 1]);
    expect(niceTicks(5, 5)[0]).toBe(0);
  });
  test("avoids float noise", () => {
    expect(niceTicks(0, 0.7)).toEqual([0, 0.2, 0.4, 0.6, 0.8]);
  });
});

describe("bar and stacked charts", () => {
  const bar: ChartSpec = {
    kind: "bar",
    title: "Build time",
    unit: "s",
    x: ["a", "b"],
    series: [{ name: "cold", values: [10, 20] }],
  };

  test("bar heights are proportional to values", () => {
    const svg = chartSvg(bar);
    const h = [...svg.matchAll(/<rect class="nsx-bar[^>]*>/g)].map((m) => num(m[0], "height"));
    expect(h.length).toBe(2);
    expect(h[1] / h[0]).toBeCloseTo(2, 1);
  });

  test("groups one bar per series per x, prints values, adds a legend and the unit", () => {
    const svg = chartSvg({ ...bar, series: [...bar.series, { name: "warm", values: [4, 8] }] });
    expect(svg.match(/<rect class="nsx-bar/g)?.length).toBe(4);
    expect(svg).toContain(">20</text>");
    expect(svg).toContain(">warm</text>");
    expect(svg).toContain(">s</text>");
    expect(svg).toContain("nsx-s1");
  });

  test("single series has no legend", () => {
    expect(chartSvg(bar)).not.toContain(">cold</text>");
  });

  test("negative bars go below the zero line", () => {
    const svg = chartSvg({ kind: "bar", x: ["a", "b"], series: [{ name: "d", values: [5, -5] }] });
    const rects = [...svg.matchAll(/<rect class="nsx-bar[^>]*>/g)].map((m) => m[0]);
    expect(num(rects[1], "y")).toBeGreaterThan(num(rects[0], "y"));
    expect(num(rects[1], "height")).toBeCloseTo(num(rects[0], "height"), 1);
  });

  test("stacked chart prints the total of every column and stacks segments", () => {
    const svg = chartSvg(
      {
        kind: "stacked",
        x: ["q1", "q2"],
        series: [
          { name: "a", values: [3, 5] },
          { name: "b", values: [4, 1] },
        ],
      },
      { lang: "en" },
    );
    const totals = [...svg.matchAll(/data-total="([^"]+)"/g)].map((m) => m[1]);
    expect(totals).toEqual(["7", "6"]);
    const rects = [...svg.matchAll(/<rect class="nsx-bar[^>]*>/g)].map((m) => m[0]);
    // q1: segment b sits on top of segment a
    expect(num(rects[1], "y") + num(rects[1], "height")).toBeCloseTo(num(rects[0], "y"), 1);
    expect(svg).toContain("total: q1 = 7; q2 = 6");
  });

  test("root has role, label, title and a hidden description with the data", () => {
    const svg = chartSvg(bar, { lang: "en" });
    expect(svg).toMatch(/^<svg class="nsx-chart" role="img" aria-label="Build time"/);
    expect(svg).toContain('width="100%"');
    expect(svg).toContain("viewBox=");
    expect(svg).toContain("<title>Build time</title>");
    expect(svg).toMatch(/<desc>[^<]*cold: a = 10; b = 20/);
  });

  test("falls back to the kind name when no title is given", () => {
    expect(chartSvg({ ...bar, title: undefined }, { lang: "vi" })).toContain('aria-label="Biểu đồ cột"');
    expect(chartSvg({ ...bar, title: undefined }, { lang: "en" })).toContain('aria-label="Bar chart"');
  });

  test("width option sets the viewBox width", () => {
    expect(chartSvg(bar, { width: 400 })).toContain('viewBox="0 0 400 ');
  });
});

describe("line and scatter charts", () => {
  test("line draws one polyline per series with a marker per point", () => {
    const svg = chartSvg({
      kind: "line",
      x: ["a", "b", "c"],
      series: [
        { name: "s1", values: [1, 2, 3] },
        { name: "s2", values: [3, 2, 1] },
      ],
    });
    expect(svg.match(/<polyline/g)?.length).toBe(2);
    // 6 data markers; the legend adds 2 more
    expect(svg.match(/class="nsx-pt/g)?.length).toBe(8);
  });

  test("series use different marker shapes", () => {
    const svg = chartSvg({
      kind: "scatter",
      x: ["a", "b"],
      series: [
        { name: "s1", values: [1, 2] },
        { name: "s2", values: [2, 1] },
      ],
    });
    expect(svg).toContain("<circle");
    expect(svg).toContain('<rect class="nsx-pt nsx-s1"');
    expect(svg).not.toContain("<polyline");
  });

  test("scatter places numeric x labels by value", () => {
    const svg = chartSvg({ kind: "scatter", x: ["1", "2", "10"], series: [{ name: "s", values: [1, 2, 3] }] });
    const cx = [...svg.matchAll(/<circle class="nsx-pt nsx-s0" cx="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(cx.length).toBe(3);
    expect(cx[2] - cx[1]).toBeGreaterThan((cx[1] - cx[0]) * 5);
  });

  test("empty data gives a small valid svg", () => {
    const svg = chartSvg({ kind: "line", x: [], series: [] }, { lang: "en" });
    expect(svg).toContain("No data");
    expect(svg).toContain("<svg");
  });
});

describe("validateChart", () => {
  const ids = new Set(["S1", "S2"]);
  const good = { id: "CH1", kind: "bar", x: ["a", "b"], series: [{ name: "s", values: [1, 2] }], source: "S1" };

  test("accepts a good chart without warnings", () => {
    const w: string[] = [];
    const c = validateChart(good, "charts[CH1]", ids, w);
    expect(w).toEqual([]);
    expect(c?.kind).toBe("bar");
    expect(c?.source).toBe("S1");
  });

  test("warns when the source is missing, and still keeps the chart", () => {
    const w: string[] = [];
    const { source: _s, ...noSource } = good;
    const c = validateChart(noSource, "charts[CH1]", ids, w);
    expect(c).not.toBeNull();
    expect(w).toEqual(["charts[CH1]: needs a source id from sources — a chart is a claim, too"]);
  });

  test("warns when the source id is unknown", () => {
    const w: string[] = [];
    validateChart({ ...good, source: "S9" }, "charts[CH1]", ids, w);
    expect(w.join("\n")).toContain('"S9" is not in sources');
  });

  test("rejects a series whose length differs from x", () => {
    const w: string[] = [];
    const c = validateChart({ ...good, series: [{ name: "s", values: [1] }] }, "charts[CH1]", ids, w);
    expect(c).toBeNull();
    expect(w.join("\n")).toMatch(/1 values but x has 2/);
  });

  test("rejects NaN, Infinity and strings as values", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, "3", null]) {
      const w: string[] = [];
      const c = validateChart({ ...good, series: [{ name: "s", values: [1, bad] }] }, "charts[CH1]", ids, w);
      expect(c).toBeNull();
      expect(w.join("\n")).toContain("values[1]");
    }
  });

  test("rejects an unknown kind and lists the valid ones", () => {
    const w: string[] = [];
    expect(validateChart({ ...good, kind: "pie" }, "charts[CH1]", ids, w)).toBeNull();
    expect(w.join("\n")).toMatch(/unknown kind "pie".*bar, stacked, line, scatter/);
  });

  test("rejects empty or blank x labels and empty series", () => {
    for (const bad of [{ ...good, x: [] }, { ...good, x: ["a", " "] }, { ...good, series: [] }, "nope", null]) {
      const w: string[] = [];
      expect(validateChart(bad, "charts[CH1]", ids, w)).toBeNull();
      expect(w.length).toBeGreaterThan(0);
    }
  });

  test("allows negative values for bar and line", () => {
    for (const kind of ["bar", "line"]) {
      const w: string[] = [];
      const c = validateChart({ ...good, kind, series: [{ name: "s", values: [-1, 2] }] }, "charts[CH1]", ids, w);
      expect(c).not.toBeNull();
      expect(w).toEqual([]);
    }
  });

  test("warns about negative values in a stacked chart but keeps it", () => {
    const w: string[] = [];
    const c = validateChart({ ...good, kind: "stacked", series: [{ name: "s", values: [-1, 2] }] }, "charts[CH1]", ids, w);
    expect(c).not.toBeNull();
    expect(w.join("\n")).toMatch(/stacked chart has negative values/);
  });
});

describe("ganttSvg", () => {
  const bars = [
    { id: "T1.1", label: "Design", start: 0, end: 2, critical: true, group: "P1", state: "done" },
    { id: "T1.2", label: "Spike", start: 0, end: 1, group: "P1", state: "todo" },
    { id: "T2.1", label: "Build", start: 2, end: 6, critical: true, group: "P2", state: "blocked" },
  ];

  test("marks critical bars with a class and a text marker", () => {
    const svg = ganttSvg(bars, { unit: "h", lang: "en" });
    const rows = [...svg.matchAll(/<g class="nsx-gbar([^"]*)" data-id="([^"]+)"/g)].map((m) => [m[2], m[1]]);
    expect(rows.find((r) => r[0] === "T1.1")?.[1]).toContain("nsx-crit");
    expect(rows.find((r) => r[0] === "T1.2")?.[1]).not.toContain("nsx-crit");
    expect(svg).toContain("★ T1.1 Design");
    expect(svg).not.toContain("★ T1.2");
    expect(svg).toContain("Critical path");
  });

  test("lists groups in order of first use, with their bars under them", () => {
    const svg = ganttSvg([bars[2], bars[0], bars[1]]);
    const order = [...svg.matchAll(/class="nsx-group"[^>]*>([^<]+)<|data-id="([^"]+)"/g)].map((m) => m[1] ?? m[2]);
    expect(order).toEqual(["P2", "T2.1", "P1", "T1.1", "T1.2"]);
  });

  test("bar length follows the schedule and the axis shows the unit", () => {
    const svg = ganttSvg(bars, { unit: "h" });
    const w = (id: string) => {
      const g = svg.slice(svg.indexOf(`data-id="${id}"`));
      return num(g.slice(g.indexOf('<rect class="nsx-gb"')), "width");
    };
    expect(w("T2.1") / w("T1.1")).toBeCloseTo(2, 1);
    expect(svg).toContain(">h</text>");
  });

  test("states are drawn differently and listed in the legend", () => {
    const svg = ganttSvg(bars, { lang: "en" });
    expect(svg).toContain("nsx-st-done");
    expect(svg).toContain("nsx-st-blocked");
    expect(svg).toContain(">Done</text>");
    expect(svg).toContain(">Blocked</text>");
    expect(svg).not.toContain(">In progress</text>");
    expect(svg).toContain('class="nsx-hatch"');
  });

  test("unknown state is treated as todo; empty input gives a small svg", () => {
    expect(ganttSvg([{ id: "a", label: "a", start: 0, end: 1, state: "weird" }])).toContain("nsx-st-todo");
    expect(ganttSvg([])).toContain("Không có dữ liệu");
  });
});

describe("riskMatrixSvg", () => {
  const cellClass = (svg: string, lik: number, imp: number): string => {
    const m = svg.match(new RegExp(`<rect class="nsx-cell nsx-(\\w+)" data-likelihood="${lik}" data-impact="${imp}"`));
    if (!m) throw new Error(`no cell ${lik}x${imp}`);
    return m[1];
  };
  const svg = riskMatrixSvg([]);

  test("draws 25 cells with bands at the edges 4/5, 9/10 and 14/15", () => {
    expect(svg.match(/class="nsx-cell nsx-\w+" data-likelihood/g)?.length).toBe(25);
    expect(cellClass(svg, 1, 1)).toBe("low");
    expect(cellClass(svg, 2, 2)).toBe("low"); // 4
    expect(cellClass(svg, 1, 5)).toBe("medium"); // 5
    expect(cellClass(svg, 3, 3)).toBe("medium"); // 9
    expect(cellClass(svg, 2, 5)).toBe("high"); // 10
    expect(cellClass(svg, 3, 4)).toBe("high"); // 12
    expect(cellClass(svg, 5, 2)).toBe("high"); // 10
    expect(cellClass(svg, 3, 5)).toBe("critical"); // 15
    expect(cellClass(svg, 4, 4)).toBe("critical"); // 16
    expect(cellClass(svg, 5, 5)).toBe("critical"); // 25
  });

  test("no 5x5 cell scores 14, so the 14/15 edge shows between 12 and 15", () => {
    expect(cellClass(svg, 4, 3)).toBe("high"); // 12
    expect(cellClass(svg, 5, 3)).toBe("critical"); // 15
  });

  test("puts high impact at the top and high likelihood on the right", () => {
    const y = (lik: number, imp: number) => {
      const m = svg.match(new RegExp(`data-likelihood="${lik}" data-impact="${imp}"[^>]*? x="(\\d+)" y="(\\d+)"`));
      return [Number(m?.[1]), Number(m?.[2])];
    };
    expect(y(1, 5)[1]).toBeLessThan(y(1, 1)[1]);
    expect(y(5, 1)[0]).toBeGreaterThan(y(1, 1)[0]);
  });

  test("two points in one cell do not overlap and stay inside the cell", () => {
    const out = riskMatrixSvg([
      { id: "R1", label: "one", likelihood: 3, impact: 3 },
      { id: "R2", label: "two", likelihood: 3, impact: 3 },
      { id: "R3", label: "three", likelihood: 3, impact: 3 },
    ]);
    const pts = [...out.matchAll(/data-id="(R\d)" data-x="([\d.]+)" data-y="([\d.]+)" data-r="([\d.]+)"/g)].map((m) => ({
      x: Number(m[2]),
      y: Number(m[3]),
      r: Number(m[4]),
    }));
    expect(pts.length).toBe(3);
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        expect(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y)).toBeGreaterThanOrEqual(pts[i].r + pts[j].r);
      }
      // cell (3,3) spans x 224..304, y 170..250 (ML 64, MT 10, 80 px cells)
      expect(pts[i].x - pts[i].r).toBeGreaterThanOrEqual(224);
      expect(pts[i].x + pts[i].r).toBeLessThanOrEqual(304);
      expect(pts[i].y - pts[i].r).toBeGreaterThanOrEqual(170);
      expect(pts[i].y + pts[i].r).toBeLessThanOrEqual(250);
    }
  });

  test("axis labels default by language and can be overridden", () => {
    expect(riskMatrixSvg([], { lang: "vi" })).toContain(">Khả năng</text>");
    expect(riskMatrixSvg([], { lang: "vi" })).toContain(">Tác động</text>");
    expect(riskMatrixSvg([], { lang: "en" })).toContain(">Likelihood</text>");
    expect(riskMatrixSvg([], { axisLabels: { likelihood: "Odds", impact: "Pain" } })).toContain(">Pain</text>");
  });

  test("the description lists each risk with its score", () => {
    const out = riskMatrixSvg([{ id: "R1", label: "Data loss", likelihood: 4, impact: 5 }], { lang: "en" });
    expect(out).toMatch(/<desc>[^<]*R1 Data loss: Likelihood 4, Impact 5, score 20/);
  });
});

describe("escaping and theme", () => {
  const evil = `<script>alert(1)</script>"&`;

  test("every label is escaped in every chart", () => {
    const outs = [
      chartSvg({ kind: "bar", title: evil, unit: evil, x: [evil], series: [{ name: evil, values: [1] }, { name: "b", values: [2] }] }),
      chartSvg({ kind: "line", title: evil, x: [evil, "b"], series: [{ name: evil, values: [1, 2] }] }),
      ganttSvg([{ id: "T1", label: evil, start: 0, end: 1, group: evil }], { unit: evil }),
      riskMatrixSvg([{ id: "R1", label: evil, likelihood: 1, impact: 1 }], { axisLabels: { likelihood: evil, impact: evil } }),
    ];
    for (const o of outs) {
      expect(o).not.toContain("<script");
      expect(o).toContain("&lt;script&gt;");
    }
  });

  test("CSS uses daisyUI variables only, no literal colors", () => {
    expect(CHART_CSS).toContain("var(--color-primary)");
    expect(CHART_CSS).toContain("var(--color-base-content)");
    expect(CHART_CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/);
  });

  test("SVG output has no inline color", () => {
    const svg = chartSvg({ kind: "bar", x: ["a"], series: [{ name: "s", values: [1] }] }) + ganttSvg([{ id: "a", label: "a", start: 0, end: 1 }]) + riskMatrixSvg([]);
    expect(svg).not.toMatch(/(fill|stroke)="/);
  });
});
