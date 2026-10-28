// Checks for the lens-diagram JSON DSL.

import type { GraphModel } from "../src/types.ts";

export function validateGraph(graph: GraphModel | undefined): string[] {
  const warnings = [];
  if (!graph || typeof graph !== "object") return ["graph is missing"];
  const ids = new Set();
  for (const n of graph.nodes || []) {
    if (!n.id) warnings.push("node without id");
    else if (ids.has(n.id)) warnings.push(`duplicate node id "${n.id}"`);
    else ids.add(n.id);
  }
  for (const e of graph.edges || []) {
    if (e.id) {
      if (ids.has(e.id)) warnings.push(`duplicate element id "${e.id}"`);
      else ids.add(e.id);
    }
    for (const end of ["source", "target"] as const) {
      const id = e[end];
      if (id && !(graph.nodes || []).some((n) => n.id === id))
        warnings.push(`edge "${e.id ?? "?"}" ${end} "${id}" is not a node`);
    }
    if (!e.path)
      warnings.push(`edge "${e.id ?? "?"}": missing path — every popover needs a file; use the call site (source's file/line)`);
  }
  for (const n of graph.nodes || []) {
    if (!n.path)
      warnings.push(`node "${n.id}": missing path — every popover needs a file (packages may point at package.json)`);
  }
  for (const f of graph.flows || []) {
    if (!f.steps?.length)
      warnings.push(`flow "${f.id ?? "?"}": no steps — the viewer skips empty flows`);
    for (const s of f.steps || []) {
      if (s.target && !ids.has(s.target))
        warnings.push(`flow "${f.id ?? "?"}" step target "${s.target}" not found`);
    }
  }
  return warnings;
}
