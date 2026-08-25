// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Does the graph keep its nodes apart, and does it do it the same way twice?
//
// The layout puts neighbours on arcs; past a certain count they land on top of each other.
// The relief pass has to satisfy three things at once, and each is a way it could go wrong:
// nodes end up apart, the foci stay where the layout put them (they carry the structure),
// and the result is REPRODUCIBLE - a jiggle would redraw the same scene differently every
// visit, which is what ruled out d3-force's collide force.
//
// Run: npm run test:graph
import { pathToFileURL } from "node:url";

const need = (k) => { const v = process.env[k]; if (!v) { console.error(`set ${k}`); process.exit(2); } return v; };
const { spreadOut } = await import(pathToFileURL(need("MOD_G")).href);

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { c ? pass++ : fail++; console.log(`${c ? "✓" : "✗"} ${n}${d ? `  (${d})` : ""}`); };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const closest = (ps) => {
  let m = Infinity;
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) m = Math.min(m, dist(ps[i], ps[j]));
  return m;
};

// ── 1. crowding is relieved ─────────────────────────────────────────────────
{
  // Sixteen neighbours on one arc, the case the ellipse layout cannot fit.
  const arc = Array.from({ length: 16 }, (_, i) => ({
    id: `n${i}`, x: 400 + 180 * Math.cos(-1.2 + i * 0.06), y: 300 + 120 * Math.sin(-1.2 + i * 0.06),
  }));
  ok("the crowded case starts overlapping", closest(arc) < 40, `${closest(arc).toFixed(1)}px apart`);
  const out = spreadOut(arc, 22);
  ok("...and comes out with every node clear of its neighbours", closest(out) >= 43.9,
    `${closest(out).toFixed(1)}px apart, asked for 44`);
  ok("...without losing or inventing one", out.length === arc.length
    && out.every((p, i) => p.id === arc[i].id));
  ok("...and without moving the input", arc[0].x === 400 + 180 * Math.cos(-1.2));
}

// ── 2. the same scene draws the same way twice ──────────────────────────────
{
  const scene = () => Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, x: 300 + (i % 3) * 4, y: 200 + Math.floor(i / 3) * 4 }));
  const a = spreadOut(scene(), 20), b = spreadOut(scene(), 20);
  ok("two runs of the same scene agree exactly",
    a.every((p, i) => p.x === b[i].x && p.y === b[i].y));
  // Coincident points are the case a random jiggle is normally used for.
  const same = [{ id: "a", x: 100, y: 100 }, { id: "b", x: 100, y: 100 }, { id: "c", x: 100, y: 100 }];
  const s1 = spreadOut(same, 15), s2 = spreadOut(same.map((p) => ({ ...p })), 15);
  ok("points at the very same spot are separated", closest(s1) >= 29.9, `${closest(s1).toFixed(1)}px`);
  ok("...and separated reproducibly", s1.every((p, i) => p.x === s2[i].x && p.y === s2[i].y));
}

// ── 3. the foci carry the structure and do not move ─────────────────────────
{
  const items = [
    { id: "focus", x: 400, y: 300, fixed: true },
    { id: "a", x: 402, y: 301 },
    { id: "b", x: 398, y: 299 },
  ];
  const out = spreadOut(items, 25);
  const f = out.find((p) => p.id === "focus");
  ok("a fixed node stays exactly where the layout put it", f.x === 400 && f.y === 300);
  ok("...and the others move out of its way", closest(out) >= 49.9, `${closest(out).toFixed(1)}px`);
}

// ── 4. it stays inside the drawing area ─────────────────────────────────────
{
  const bounds = { x0: 0, y0: 0, x1: 500, y1: 400 };
  const corner = Array.from({ length: 8 }, (_, i) => ({ id: `n${i}`, x: 496 + i * 0.5, y: 396 }));
  const out = spreadOut(corner, 30, bounds);
  ok("nothing is pushed off the canvas",
    out.every((p) => p.x >= bounds.x0 && p.x <= bounds.x1 && p.y >= bounds.y0 && p.y <= bounds.y1));
  // In a corner there is not room for every node; the pass must give up rather than spin.
  ok("...and a corner that cannot hold them all still terminates", out.length === 8);
}

// ── 5. it does nothing when there is nothing to do ──────────────────────────
{
  const spread = [{ id: "a", x: 0, y: 0 }, { id: "b", x: 200, y: 0 }, { id: "c", x: 0, y: 200 }];
  const out = spreadOut(spread, 20);
  ok("a scene that already fits is left exactly as it is",
    out.every((p, i) => p.x === spread[i].x && p.y === spread[i].y));
}

console.log(`\n${pass}/${pass + fail} graph-layout assertions passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
