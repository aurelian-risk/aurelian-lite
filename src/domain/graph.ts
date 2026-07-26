// Derives a node/edge graph from a study's generic entities, using the
// taxonomy's ref/multiref fields as relationships.
import type { EntityRecord, Study, Taxonomy } from "./types";
import { getType, recordTitle, refFields } from "./taxonomy";

export interface GNode {
  id: string;
  label: string;
  type: string;
  group: string;
  color: string;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GLink {
  source: string;
  target: string;
  rel: string;
}

export function buildGraph(tax: Taxonomy, study: Study): { nodes: GNode[]; links: GLink[] } {
  const groupColor = new Map(tax.groups.map((g) => [g.key, g.color]));
  const nodes: GNode[] = [];
  const byId = new Map<string, EntityRecord>();

  for (const r of study.entities) {
    const t = getType(tax, r.type);
    if (!t) continue;
    byId.set(r.id, r);
    nodes.push({
      id: r.id,
      label: recordTitle(t, r),
      type: r.type,
      group: t.group,
      color: groupColor.get(t.group) ?? "var(--primary)",
    });
  }

  const ids = new Set(nodes.map((n) => n.id));
  const links: GLink[] = [];
  for (const r of study.entities) {
    const t = getType(tax, r.type);
    if (!t) continue;
    for (const f of refFields(t)) {
      const rel = f.relation ?? f.label;
      const v = r.values[f.key];
      const targets = f.type === "multiref" ? (Array.isArray(v) ? v : []) : v ? [v] : [];
      for (const target of targets) {
        if (typeof target === "string" && ids.has(target)) {
          links.push({ source: r.id, target, rel });
        }
      }
    }
  }
  return { nodes, links };
}
