// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
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

// ── Keeping laid-out nodes apart ─────────────────────────────────────────────
//
// The ego layout places neighbours on arcs, which is right for reading the structure and
// wrong as soon as a focus has more neighbours than its arc has room for: they land on
// top of each other. This pushes overlapping nodes apart afterwards, which keeps the
// arrangement the layout intended and only relieves the crowding.
//
// Deterministic on purpose - no jitter, no randomness, pairs visited in index order. The
// same scene must draw the same way twice, or a screenshot, a test and a reader's memory
// all disagree with each other. (d3-force was in package.json for this and was never
// imported; its collide force jiggles coincident points with Math.random, which is
// exactly what determinism rules out.)

export interface Placed { id: string; x: number; y: number; /** never moved: the foci */ fixed?: boolean }

/** Push overlapping points apart until each pair clears `2 * radius` horizontally and
 *  `2 * (radiusY ?? radius)` vertically, or `rounds` is spent. The two are separate because
 *  what collides on screen is not the dot but the dot AND its label: a wide, flat shape, so
 *  the room a node needs sideways is not the room it needs above and below. `bounds` keeps
 *  the result inside the drawing area. Returns a new array; the input is untouched. */
export function spreadOut(items: Placed[], radius: number,
  bounds?: { x0: number; y0: number; x1: number; y1: number }, rounds = 80, radiusY?: number): Placed[] {
  const out = items.map((p) => ({ ...p }));
  const ry = radiusY ?? radius;
  // Measure in a space where the ellipse is a circle: scale y, then everything below is
  // the plain circular case, and the push is scaled back on the way out.
  const ky = radius / ry;
  const min = radius * 2, min2 = min * min;
  const clamp = (p: Placed) => {
    if (!bounds) return;
    p.x = Math.min(bounds.x1, Math.max(bounds.x0, p.x));
    p.y = Math.min(bounds.y1, Math.max(bounds.y0, p.y));
  };
  for (let r = 0; r < rounds; r++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i], b = out[j];
        if (a.fixed && b.fixed) continue;
        let dx = b.x - a.x, dy = (b.y - a.y) * ky;
        let d2 = dx * dx + dy * dy;
        if (d2 >= min2) continue;
        // Exactly coincident: separate along a direction derived from their order, so the
        // result is reproducible rather than random.
        if (d2 === 0) { dx = Math.cos(i + j); dy = Math.sin(i + j); d2 = 1; }
        const d = Math.sqrt(d2);
        const push = (min - d) / d / 2;
        const ax = dx * push, ay = (dy * push) / ky;
        if (a.fixed) { b.x += ax * 2; b.y += ay * 2; }
        else if (b.fixed) { a.x -= ax * 2; a.y -= ay * 2; }
        else { a.x -= ax; a.y -= ay; b.x += ax; b.y += ay; }
        clamp(a); clamp(b);
        moved = true;
      }
    }
    if (!moved) break;   // nothing overlaps any more: further rounds cannot change anything
  }
  for (const p of out) clamp(p);
  return out;
}
