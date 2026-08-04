// Relationship graph as a FOCUS / ego-network: one node sits at the centre and only
// its DIRECT neighbours fan out around it (coloured by workshop group, shaped by entity
// type, edges labelled with the relation + direction). Click a neighbour to re-centre on
// it; search to jump anywhere; ← Back walks the trail. This is deliberately different from
// the three left→right methodology flows (Flow, Attack paths, Kill chain) — it is for
// exploring "what is connected to X", not the linear progression.
import { useEffect, useMemo, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { EntityRecord, Study, Taxonomy } from "../domain/types";
import { buildGraph, type GNode } from "../domain/graph";
import { getType } from "../domain/taxonomy";
import { EntityInfoPanel } from "./EntityInfoPanel";
import { EntityModal } from "./EntityModal";

const FR = 16, NR = 11; // focus + neighbour radii

// Distinct shape per entity type (index within its group) so types sharing a colour are
// still told apart — e.g. security measures (○) vs risk treatments (◇) in Treatment.
function shapeEl(si: number, r: number, extra: Record<string, unknown>, title: ReactNode) {
  const p = extra as Record<string, unknown>;
  if (si % 4 === 1) return <rect x={-r * 0.9} y={-r * 0.9} width={r * 1.8} height={r * 1.8} rx={2.5} {...p}>{title}</rect>;
  if (si % 4 === 2) return <path d={`M0 ${-r * 1.18}L${r * 1.18} 0L0 ${r * 1.18}L${-r * 1.18} 0Z`} {...p}>{title}</path>;
  if (si % 4 === 3) return <path d={`M0 ${-r * 1.15}L${r} ${r * 0.8}L${-r} ${r * 0.8}Z`} {...p}>{title}</path>;
  return <circle r={r} {...p}>{title}</circle>;
}

export function GraphView({ tax, study }: { tax: Taxonomy; study: Study }) {
  const { nodes, links } = useMemo(() => buildGraph(tax, study), [tax, study]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const shapeIx = useMemo(() => {
    const m = new Map<string, number>();
    for (const key of [...tax.groups.map((g) => g.key), ""])
      tax.entityTypes.filter((et) => (et.group ?? "") === key).forEach((et, i) => m.set(et.key, i));
    return m;
  }, [tax]);
  // Default to the first entity (a business asset — the natural EBIOS starting point),
  // and the searchable, grouped index on the left makes the current focus explicit.
  const defaultFocus = useMemo(() => nodes[0]?.id ?? null, [nodes]);

  const [focusIds, setFocusIds] = useState<string[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<EntityRecord | null>(null);
  const [size, setSize] = useState({ w: 900, h: 560 });
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  // Effective foci: the current selection, or the default when nothing is picked yet.
  const foci = useMemo(() => {
    const ids = focusIds.filter((id) => byId.has(id));
    return (ids.length ? ids : defaultFocus ? [defaultFocus] : []).map((id) => byId.get(id)!);
  }, [focusIds, byId, defaultFocus]);
  const fociSet = useMemo(() => new Set(foci.map((f) => f.id)), [foci]);
  const primary = foci[foci.length - 1] ?? null; // last picked drives the legend + docked detail

  // Plain click focuses a single node (and records history for ← Back); Shift-click
  // (additive) toggles the node in a multi-focus selection so several egos show at once.
  const goTo = (id: string, additive = false) => {
    setInspect(null);  // focusing from the index / re-centring closes the detail box; only a node click opens it
    setFocusIds((prev) => {
      const cur = prev.filter((x) => byId.has(x));
      if (additive) {
        const base = cur.length ? cur : primary ? [primary.id] : [];
        return base.includes(id) ? (base.length > 1 ? base.filter((x) => x !== id) : base) : [...base, id];
      }
      if (primary && id !== primary.id) setHistory((h) => [...h, primary.id]);
      return [id];
    });
    if (!additive) setQ("");
  };
  const back = () => setHistory((h) => { const n = [...h]; const prev = n.pop(); if (prev) setFocusIds([prev]); return n; });

  // INSPECT: a plain node click shows that entity in the detail box WITHOUT re-centring
  // the graph or moving the left selection. Re-centring is a deliberate act — double-click
  // a node, or click it in the left index.
  const [inspect, setInspect] = useState<string | null>(null);
  const inspectNode = (id: string) => setInspect(id); // clicking a graph node is the ONLY thing that shows the box

  // DRAG: a node can be pulled around; on release it springs back to its computed spot.
  const offsets = useRef(new Map<string, { x: number; y: number; vx: number; vy: number }>());
  const dragRef = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const rafRef = useRef<number | undefined>(undefined);
  const [, bump] = useReducer((c: number) => c + 1, 0);
  useEffect(() => () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); }, []);

  const runSpring = () => {
    if (rafRef.current != null) return;
    let last = performance.now();
    const step = (t: number) => {
      const dt = Math.min(2.5, (t - last) / 16.67); last = t;
      let any = false;
      for (const [id, o] of offsets.current) {
        if (dragRef.current?.id === id) { any = true; continue; } // held: leave where the pointer is
        o.vx += -o.x * 0.22 * dt; o.vy += -o.y * 0.22 * dt;       // spring pull toward home
        o.vx *= 0.80; o.vy *= 0.80;                               // damping
        o.x += o.vx * dt; o.y += o.vy * dt;
        if (Math.abs(o.x) < 0.4 && Math.abs(o.y) < 0.4 && Math.abs(o.vx) < 0.4 && Math.abs(o.vy) < 0.4) offsets.current.delete(id);
        else any = true;
      }
      bump();
      rafRef.current = any ? requestAnimationFrame(step) : undefined;
    };
    rafRef.current = requestAnimationFrame(step);
  };

  const off = (id: string, p: { x: number; y: number }) => { const o = offsets.current.get(id); return o ? { x: p.x + o.x, y: p.y + o.y } : p; };

  // Drag handlers for a node; a click that doesn't move fires onTap (inspect / add-focus).
  const nodeDrag = (id: string, onTap: (shift: boolean) => void) => ({
    onPointerDown: (e: ReactPointerEvent) => {
      e.stopPropagation();
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      const o = offsets.current.get(id) ?? { x: 0, y: 0, vx: 0, vy: 0 };
      offsets.current.set(id, o);
      dragRef.current = { id, sx: e.clientX, sy: e.clientY, ox: o.x, oy: o.y, moved: false };
    },
    onPointerMove: (e: ReactPointerEvent) => {
      const d = dragRef.current; if (!d || d.id !== id) return;
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 3) d.moved = true;
      const o = offsets.current.get(id)!; o.x = d.ox + (e.clientX - d.sx); o.y = d.oy + (e.clientY - d.sy); o.vx = 0; o.vy = 0;
      bump();
    },
    onPointerUp: (e: ReactPointerEvent) => {
      const d = dragRef.current; if (!d || d.id !== id) return;
      dragRef.current = null;
      if (d.moved) runSpring(); else onTap(e.shiftKey);
    },
  });

  // Combined ego-view of ALL foci: each neighbour records which foci it links to (with
  // relation + direction); edges directly between two selected foci are kept separately.
  const scene = useMemo(() => {
    type Conn = { rels: Set<string>; out: boolean; in: boolean };
    const nm = new Map<string, { node: GNode; conn: Map<string, Conn> }>();
    const emap = new Map<string, { a: string; b: string; rels: Set<string> }>();
    const fociEdges: { a: string; b: string; rels: Set<string> }[] = [];
    const touch = (nbId: string, fId: string, rel: string, dir: "out" | "in") => {
      const nd = byId.get(nbId); if (!nd) return;
      let e = nm.get(nbId); if (!e) { e = { node: nd, conn: new Map() }; nm.set(nbId, e); }
      let c = e.conn.get(fId); if (!c) { c = { rels: new Set(), out: false, in: false }; e.conn.set(fId, c); }
      c.rels.add(rel); if (dir === "out") c.out = true; else c.in = true;
    };
    for (const l of links) {
      const sF = fociSet.has(l.source), tF = fociSet.has(l.target);
      if (sF && tF) {
        if (l.source === l.target) continue;
        const key = l.source + "→" + l.target;
        let e = emap.get(key); if (!e) { e = { a: l.source, b: l.target, rels: new Set() }; emap.set(key, e); fociEdges.push(e); }
        e.rels.add(l.rel);
      } else if (sF) touch(l.target, l.source, l.rel, "out");
      else if (tF) touch(l.source, l.target, l.rel, "in");
    }
    const neigh = [...nm.values()].sort((a, b) => a.node.group.localeCompare(b.node.group) || a.node.label.localeCompare(b.node.label));
    return { neigh, fociEdges };
  }, [fociSet, links, byId]);

  if (nodes.length === 0) {
    return <div className="empty"><h3>Nothing to show yet</h3>Add entities in the workshops — the graph grows with them.</div>;
  }

  const cx = size.w / 2, cy = size.h / 2;
  const k = scene.neigh.length;
  const nF = foci.length;
  const fpos = new Map<string, { x: number; y: number; ang: number }>();
  const pos = new Map<string, { x: number; y: number }>();
  // Fill the pane: spread to within a label-sized margin of each edge. Elliptical, so the
  // wide-but-short graph area is used horizontally instead of leaving a small circle adrift.
  const rx = Math.max(150, size.w / 2 - 175);
  const ry = Math.max(110, size.h / 2 - 80);

  if (nF <= 1) {
    // Single ego: focus dead centre, neighbours around it on the full ellipse.
    if (foci[0]) fpos.set(foci[0].id, { x: cx, y: cy, ang: -Math.PI / 2 });
    const c = scene.neigh.length;
    scene.neigh.forEach((e, i) => {
      const ang = c <= 1 ? -Math.PI / 2 : -Math.PI / 2 + (i * 2 * Math.PI) / c;
      const rr = c > 14 && i % 2 ? 0.78 : 1;   // pull every other node inward when crowded
      pos.set(e.node.id, { x: cx + rx * rr * Math.cos(ang), y: cy + ry * rr * Math.sin(ang) });
    });
  } else {
    // Multi ego: each focus OWNS an angular sector. Its exclusive neighbours ride the outer
    // arc of that sector (clusters never collide across foci); shared neighbours (≥2 foci)
    // sit near the centre between their foci so overlaps read as bridges.
    const frx = rx * 0.46, fry = ry * 0.46;
    const sector = (2 * Math.PI) / nF;
    foci.forEach((f, i) => {
      const a = -Math.PI / 2 + i * sector;
      fpos.set(f.id, { x: cx + frx * Math.cos(a), y: cy + fry * Math.sin(a), ang: a });
    });
    const exclusive = new Map<string, typeof scene.neigh>();
    const shared: typeof scene.neigh = [];
    for (const e of scene.neigh) {
      const fids = [...e.conn.keys()];
      if (fids.length === 1) { const arr = exclusive.get(fids[0]) ?? []; arr.push(e); exclusive.set(fids[0], arr); }
      else shared.push(e);
    }
    foci.forEach((f) => {
      const arr = exclusive.get(f.id) ?? [];
      const a = fpos.get(f.id)!.ang;
      const c = arr.length;
      const span = Math.max(sector - sector * 0.28, 0.001); // keep a margin between sectors
      arr.forEach((e, j) => {
        const ang = c === 1 ? a : a - span / 2 + (j * span) / (c - 1);
        const rr = c > 8 && j % 2 ? 0.82 : 1;                // second inner ring only when crowded
        pos.set(e.node.id, { x: cx + rx * rr * Math.cos(ang), y: cy + ry * rr * Math.sin(ang) });
      });
    });
    shared.forEach((e, idx) => {
      const fids = [...e.conn.keys()];
      let sc = 0, ss = 0; for (const fid of fids) { const a = fpos.get(fid)!.ang; sc += Math.cos(a); ss += Math.sin(a); }
      const avg = Math.atan2(ss, sc);
      const rf = 0.52 + idx * 0.12;
      pos.set(e.node.id, { x: cx + frx * rf * Math.cos(avg), y: cy + fry * rf * Math.sin(avg) });
    });
  }

  // Left index: EVERY entity, grouped by workshop and searchable — so the whole model
  // is visible at a glance and the current focus is explicit (not an arbitrary node).
  const matches = (n: GNode) => !q.trim() || n.label.toLowerCase().includes(q.trim().toLowerCase());
  const idxGroups = [...tax.groups.map((g) => ({ key: g.key, label: g.label, color: g.color })), { key: "", label: "Other", color: "var(--fg-subtle)" }]
    .map((g) => ({ g, ents: nodes.filter((n) => (getType(tax, n.type)?.group ?? "") === g.key && matches(n)) }))
    .filter((x) => x.ents.length > 0);

  // The detail box shows the inspected node when there is one, otherwise the primary focus.
  const dockId = (inspect && byId.has(inspect)) ? inspect : null;

  return (
    <div className="graph-focus-layout">
      <aside className="graph-index">
        <input className="graph-search" placeholder="Search entities…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="gi-list">
          {idxGroups.map(({ g, ents }) => (
            <div className="gi-group" key={g.key || "other"}>
              <div className="gi-group-h"><span className="gi-dot" style={{ background: g.color }} />{g.label}<span className="gi-count">{ents.length}</span></div>
              {ents.map((e) => (
                <button key={e.id} className={"gi-e" + (fociSet.has(e.id) ? " active" : "") + (primary?.id === e.id ? " primary" : "") + (inspect === e.id && !fociSet.has(e.id) ? " inspected" : "")}
                  onClick={(ev) => goTo(e.id, ev.shiftKey)} title={`${e.label}  ·  Shift-click to add to the focus`}>{e.label}</button>
              ))}
            </div>
          ))}
          {idxGroups.length === 0 && <div className="hint" style={{ padding: 12 }}>No matches.</div>}
        </div>
      </aside>
      <div className="graph-main">
        <div className="graph-legend">
          {history.length > 0 && nF <= 1 && <button className="btn ghost sm" onClick={back}>← Back</button>}
          {nF > 1
            ? <span className="item"><b style={{ color: "var(--fg)" }}>{nF} focuses</b>&nbsp;<span style={{ color: "var(--fg-subtle)" }}>· click a node to inspect · double-click to re-centre · Shift-click to add / remove</span></span>
            : primary && <span className="item"><b style={{ color: "var(--fg)" }}>{primary.label}</b>&nbsp;<span style={{ color: "var(--fg-subtle)" }}>· {k} relationship{k === 1 ? "" : "s"} · click to inspect · double-click to re-centre · Shift-click to compare</span></span>}
          {nF > 1 && <button className="btn ghost sm" onClick={() => setFocusIds(primary ? [primary.id] : [])}>Clear extra</button>}
        </div>
        <div className="graph-wrap" ref={wrapRef}>
          <svg>
            <defs>
              <marker id="ego-arrow" markerWidth="8" markerHeight="8" refX="6.5" refY="3.5" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0 0.7 L7 3.5 L0 6.3 z" fill="context-stroke" /></marker>
            </defs>
            {/* neighbour edges — one per (focus, neighbour) link */}
            {scene.neigh.map((e) => {
              const np0 = pos.get(e.node.id); if (!np0) return null;
              const np = off(e.node.id, np0);
              return [...e.conn.entries()].map(([fid, c]) => {
                const fp = off(fid, fpos.get(fid)!);
                const dx = np.x - fp.x, dy = np.y - fp.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
                const x1 = fp.x + ux * FR, y1 = fp.y + uy * FR, x2 = np.x - ux * NR, y2 = np.y - uy * NR;
                return (
                  <g key={"e-" + fid + "-" + e.node.id}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--border-strong)" strokeWidth={1.2} strokeOpacity={0.5}
                      markerEnd={c.out ? "url(#ego-arrow)" : undefined} markerStart={c.in ? "url(#ego-arrow)" : undefined} />
                    <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 2} textAnchor="middle" fontSize={9.5} fill="var(--fg-subtle)"
                      style={{ pointerEvents: "none", userSelect: "none", paintOrder: "stroke" }} stroke="var(--bg-0)" strokeWidth={3}>
                      {[...c.rels].join(" / ")}
                    </text>
                  </g>
                );
              });
            })}
            {/* edges directly between two selected foci */}
            {scene.fociEdges.map((fe) => {
              const a0 = fpos.get(fe.a), b0 = fpos.get(fe.b); if (!a0 || !b0) return null;
              const a = off(fe.a, a0), b = off(fe.b, b0);
              const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
              return <line key={"fe-" + fe.a + fe.b} x1={a.x + ux * FR} y1={a.y + uy * FR} x2={b.x - ux * FR} y2={b.y - uy * FR}
                stroke="var(--primary)" strokeWidth={1.6} strokeOpacity={0.6} markerEnd="url(#ego-arrow)" />;
            })}
            {/* neighbour nodes */}
            {scene.neigh.map((e) => {
              const np0 = pos.get(e.node.id); if (!np0) return null;
              const np = off(e.node.id, np0);
              const t = getType(tax, e.node.type);
              const anchorEnd = np.x < cx;
              const isShared = e.conn.size > 1;
              const isInspect = inspect === e.node.id;
              return (
                <g key={e.node.id} transform={`translate(${np.x},${np.y})`} style={{ cursor: "grab" }}
                  {...nodeDrag(e.node.id, (shift) => shift ? goTo(e.node.id, true) : inspectNode(e.node.id))}
                  onDoubleClick={() => goTo(e.node.id)}>
                  {isInspect && <circle r={NR + 5} fill="none" stroke="var(--primary)" strokeWidth={1.4} strokeDasharray="3 3" opacity={0.9} />}
                  {shapeEl(shapeIx.get(e.node.type) ?? 0, NR, { fill: e.node.color, fillOpacity: 0.92, stroke: isShared ? "var(--primary)" : "var(--bg-0)", strokeWidth: isShared ? 2.5 : 2 }, <title>{(t?.label ?? e.node.type)}: {e.node.label}</title>)}
                  <text x={anchorEnd ? -(NR + 5) : NR + 5} y={4} textAnchor={anchorEnd ? "end" : "start"} fontSize={10.5} fill="var(--fg)"
                    style={{ pointerEvents: "none", userSelect: "none", paintOrder: "stroke" }} stroke="var(--bg-0)" strokeWidth={3}>
                    {e.node.label.length > 24 ? e.node.label.slice(0, 24) + "…" : e.node.label}
                  </text>
                </g>
              );
            })}
            {/* focus nodes */}
            {foci.map((f) => {
              const fp = off(f.id, fpos.get(f.id)!);
              const t = getType(tax, f.type);
              const isPrimary = primary?.id === f.id;
              const isInspect = inspect === f.id;
              return (
                <g key={"f-" + f.id} transform={`translate(${fp.x},${fp.y})`} style={{ cursor: "grab" }}
                  {...nodeDrag(f.id, (shift) => shift ? goTo(f.id, true) : inspectNode(f.id))}
                  onDoubleClick={() => setModal(study.entities.find((en) => en.id === f.id) ?? null)}>
                  {isInspect && <circle r={FR + 6} fill="none" stroke="var(--primary)" strokeWidth={1.6} strokeDasharray="3 3" opacity={0.9} />}
                  {shapeEl(shapeIx.get(f.type) ?? 0, FR, { fill: f.color, fillOpacity: 0.95, stroke: isPrimary ? "var(--fg)" : "var(--primary)", strokeWidth: 3 }, <title>{(t?.label ?? f.type)}: {f.label}</title>)}
                  <text x={0} y={FR + 15} textAnchor="middle" fontSize={12.5} fontWeight={700} fill="var(--fg)"
                    style={{ pointerEvents: "none", userSelect: "none", paintOrder: "stroke" }} stroke="var(--bg-0)" strokeWidth={4}>
                    {f.label.length > 30 ? f.label.slice(0, 30) + "…" : f.label}
                  </text>
                </g>
              );
            })}
            {nF === 1 && k === 0 && <text x={cx} y={cy + FR + 34} textAnchor="middle" fontSize={10.5} fill="var(--fg-subtle)" style={{ paintOrder: "stroke" }} stroke="var(--bg-0)" strokeWidth={3}>no relationships yet</text>}
          </svg>
        </div>
      </div>
      {dockId && (
        <div className="detail-dock">
          <EntityInfoPanel tax={tax} study={study} id={dockId} onSelect={inspectNode} onEdit={(id) => setModal(study.entities.find((e) => e.id === id) ?? null)} onClose={() => setInspect(null)} />
        </div>
      )}
      {modal && <EntityModal type={getType(tax, modal.type)!} tax={tax} study={study} record={modal} onClose={() => setModal(null)} />}
    </div>
  );
}
