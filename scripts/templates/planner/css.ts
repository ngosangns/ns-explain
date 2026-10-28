// Planner page styles. Colors come only from daisyUI variables, so light and dark both work.

import { CHART_CSS } from "../../core/charts.ts";

export const PLANNER_CSS: string = `
.nsx-sr{position:absolute;inline-size:1px;block-size:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.nsx-muted{opacity:.7}
.nsx-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.8rem}
.nsx-sub{font-size:1rem;font-weight:600;margin:1.1rem 0 .5rem}
.nsx-lead{margin:.4rem 0}
.nsx-html>:first-child{margin-top:0}.nsx-html>:last-child{margin-bottom:0}
.nsx-pre{white-space:pre-wrap}
.nsx-sec{scroll-margin-top:4.5rem}
.nsx-sec :target,.nsx-card:target,.nsx-step:target,.nsx-phase:target{outline:2px solid var(--color-primary);outline-offset:2px}

/* chips */
.nsx-chips,.nsx-meta{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem}
.nsx-meta{margin-bottom:.35rem}
.nsx-chip{display:inline-flex;align-items:center;min-block-size:1.4rem;padding:.05rem .6rem;border-radius:999px;font-size:.75rem;font-weight:600;line-height:1.2;
  background:var(--color-base-300);color:var(--color-base-content);border:1px solid transparent;text-decoration:none;overflow-wrap:anywhere}
.nsx-chip.nsx-ok{background:var(--color-success);color:var(--color-success-content)}
.nsx-chip.nsx-warn{background:var(--color-warning);color:var(--color-warning-content)}
.nsx-chip.nsx-bad{background:var(--color-error);color:var(--color-error-content)}
.nsx-chip.nsx-info{background:var(--color-base-200);border-color:var(--color-base-content);border-color:color-mix(in oklch,var(--color-base-content) 35%,transparent)}
.nsx-chip.nsx-primary{background:var(--color-primary);color:var(--color-primary-content)}
a.nsx-chip.nsx-link{cursor:pointer}
a.nsx-chip.nsx-link:hover{text-decoration:underline}
a.nsx-chip:focus-visible,summary:focus-visible,.nsx-pill:focus-within,.nsx-choice:focus-within,.nsx-vbtn:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}
.nsx-star{color:var(--color-error);font-weight:700}

/* status strip + toc */
.nsx-strip{position:static}
.nsx-toc{position:sticky;top:0;z-index:20;display:flex;flex-wrap:wrap;gap:.25rem .5rem;padding:.5rem .75rem;border-radius:var(--radius-box,.5rem);
  background:var(--color-base-100);box-shadow:0 1px 4px rgb(0 0 0/.15)}
.nsx-toc a{display:inline-flex;align-items:center;min-block-size:2rem;padding:0 .5rem;font-size:.85rem;text-decoration:none;border-radius:.4rem}
.nsx-toc a:hover{background:var(--color-base-200);text-decoration:underline}
@media (pointer:coarse){.nsx-toc a{min-block-size:2.75rem}}
@media (max-width:640px){.nsx-toc{position:static;overflow-x:auto;flex-wrap:nowrap}.nsx-toc a{white-space:nowrap}}

/* cards + lists */
.nsx-stack{display:flex;flex-direction:column;gap:.75rem;list-style:none;margin:0;padding:0}
.nsx-card{border:1px solid var(--color-base-300);border-radius:var(--radius-box,.5rem);padding:.75rem 1rem;background:var(--color-base-100);min-inline-size:0}
.nsx-dashed{border-style:dashed;border-width:2px}
.nsx-list{margin:.4rem 0;padding-inline-start:1.25rem;list-style:disc}
.nsx-list li{margin:.25rem 0;line-height:1.55}
.nsx-facts,.nsx-revision,.nsx-conseq{list-style:none;padding-inline-start:0}
.nsx-facts li,.nsx-revision li{border-block-end:1px solid var(--color-base-300);padding:.5rem 0}
.nsx-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr));gap:.5rem 1.5rem}
.nsx-pros li::marker{content:"+ ";color:var(--color-success)}
.nsx-cons li::marker{content:"− ";color:var(--color-error)}
.nsx-pros,.nsx-cons{list-style:inside}
.nsx-rejected{margin:.5rem 0 0}
.nsx-chosen{border-color:var(--color-success);border-width:2px}
.nsx-ears{list-style:none;padding-inline-start:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.85rem}
.nsx-quote{margin:.4rem 0;padding:.3rem .8rem;border-inline-start:3px solid var(--color-base-content);border-inline-start-color:color-mix(in oklch,var(--color-base-content) 40%,transparent);background:var(--color-base-200);border-radius:.25rem;overflow-wrap:anywhere}
.nsx-snippet{margin:0;overflow:auto;max-block-size:14rem;font-size:.8rem;white-space:pre}
.nsx-cmd{background:var(--color-base-200);padding:.05rem .4rem;border-radius:.25rem}
.nsx-srcline{display:flex;flex-wrap:wrap;gap:.25rem .5rem;align-items:baseline}
.nsx-diff{margin-block-start:.25rem;font-size:.85rem}
.nsx-before{color:var(--color-error)}.nsx-after{color:var(--color-success);text-decoration:none}
.nsx-path{font-size:.8rem}
.nsx-original summary{cursor:pointer;min-block-size:2.75rem;display:flex;align-items:center;font-weight:600}
.nsx-sep{opacity:.5}

/* tables */
.nsx-scroll{overflow-x:auto;max-inline-size:100%}
.nsx-table{inline-size:100%;border-collapse:collapse;font-size:.9rem}
.nsx-table th,.nsx-table td{padding:.45rem .6rem;border-block-end:1px solid var(--color-base-300);text-align:start;vertical-align:top;overflow-wrap:break-word}
.nsx-table thead th{font-weight:600;vertical-align:bottom}
.nsx-table tbody th{font-weight:600;min-inline-size:8rem}
.nsx-matrix td.nsx-num,.nsx-matrix thead th~th{text-align:center}
.nsx-matrix .nsx-win{background:var(--color-success);background:color-mix(in oklch,var(--color-success) 22%,transparent)}
.nsx-score-bar{display:block;block-size:.4rem;margin-block-start:.25rem;background:var(--color-base-300);border-radius:999px;overflow:hidden}
.nsx-score-bar>span{display:block;block-size:100%;background:var(--color-primary)}

/* research filter (no JS): radios + :has() */
.nsx-filter{display:flex;flex-wrap:wrap;gap:.4rem;border:0;margin:.5rem 0;padding:0}
.nsx-pill{display:inline-flex;align-items:center;gap:.4rem;min-block-size:2.25rem;padding:0 .8rem;border:1px solid var(--color-base-300);border-radius:999px;cursor:pointer;font-size:.85rem}
.nsx-pill:has(input:checked){background:var(--color-primary);color:var(--color-primary-content);border-color:var(--color-primary)}
.nsx-pill input{accent-color:var(--color-primary)}
@media (pointer:coarse){.nsx-pill{min-block-size:2.75rem}.nsx-pill input{inline-size:1.25rem;block-size:1.25rem}}
${["web", "code", "command", "doc", "user", "history"]
  .map((k) => `#sec-research:has(.nsx-kf[value="${k}"]:checked) [data-kinds]:not([data-kinds~="${k}"]){display:none}`)
  .join("\n")}

/* plan */
.nsx-phase{margin-block:1rem}
.nsx-phasetitle{font-size:1.05rem;font-weight:600;margin:0}
.nsx-steps{list-style:none;margin:.5rem 0;padding:0;display:flex;flex-direction:column;gap:.6rem}
.nsx-step{border:1px solid var(--color-base-300);border-inline-start-width:4px;border-radius:var(--radius-box,.5rem);padding:.6rem .9rem}
.nsx-st-done{border-inline-start-color:var(--color-success)}.nsx-step.nsx-st-doing{border-inline-start-color:var(--color-primary)}
.nsx-step.nsx-st-blocked{border-inline-start-color:var(--color-error);border-style:dashed}
.nsx-steptitle{overflow-wrap:anywhere}
.nsx-files{margin:.4rem 0;display:flex;flex-wrap:wrap;gap:.25rem}
.nsx-verify{margin:.3rem 0 0}
.nsx-figure{margin:.75rem 0;max-inline-size:100%;overflow-x:auto}
.nsx-figure figcaption{font-size:.85rem;margin-block-start:.25rem}
.nsx-risk{max-inline-size:460px}
.nsx-sec .lens-diagram{min-block-size:22rem}

/* questions + verdict */
.nsx-blocking{border-color:var(--color-warning);border-width:2px}
.nsx-answer{margin:.3rem 0;padding:.3rem .6rem;background:var(--color-base-200);border-radius:.25rem}
.nsx-radios{display:flex;flex-direction:column;gap:.35rem;margin-block-start:.5rem}
.nsx-choice{display:flex;align-items:center;gap:.6rem;min-block-size:2.25rem;padding:.25rem .5rem;border:1px solid var(--color-base-300);border-radius:.4rem;cursor:pointer}
.nsx-choice:has(input:checked){border-color:var(--color-primary);background:var(--color-base-200)}
.nsx-choice input{accent-color:var(--color-primary)}
@media (pointer:coarse){.nsx-choice{min-block-size:2.75rem}.nsx-choice input{inline-size:1.25rem;block-size:1.25rem}}
.nsx-textarea{inline-size:100%;margin-block-start:.4rem;padding:.5rem .6rem;border:1px solid var(--color-base-300);border-radius:.4rem;background:var(--color-base-100);color:inherit;font:inherit}
.nsx-textarea:focus-visible{outline:2px solid var(--color-primary);outline-offset:1px}
.nsx-verdict-btns{display:flex;flex-wrap:wrap;gap:.5rem;margin-block:.5rem}
.nsx-vbtn{min-block-size:2.75rem;padding:0 1.2rem;border:2px solid var(--color-base-300);border-radius:.5rem;background:var(--color-base-100);color:inherit;font:inherit;font-weight:600;cursor:pointer}
.nsx-vbtn[data-nsx-verdict="approve"][aria-pressed="true"]{background:var(--color-success);border-color:var(--color-success);color:var(--color-success-content)}
.nsx-vbtn[data-nsx-verdict="request-changes"][aria-pressed="true"]{background:var(--color-warning);border-color:var(--color-warning);color:var(--color-warning-content)}
.nsx-vbtn[aria-pressed="true"]::before{content:"✓ "}
.nsx-notelabel{display:block;font-weight:600}
@media (prefers-reduced-motion:no-preference){.nsx-vbtn,.nsx-pill,.nsx-choice{transition:background-color .15s,border-color .15s}}

${CHART_CSS}
`.trim();
