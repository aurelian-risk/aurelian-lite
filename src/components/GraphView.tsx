import { useEffect, useMemo, useRef, useState } from "react";
import {
  forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, type Simulation,
} from "d3-force";
import type { EntityRecord, Study, Taxonomy } from "../domain/types";
import { buildGraph, type GLink, type GNode } from "../domain/graph";
import { getType } from "../domain/taxonomy";
import { EntityInfoPanel } from "./EntityInfoPanel";
import { EntityModal } from "./EntityModal";

interface SimNode extends GNode { x: number; y: number; }
interface SimLink { source: SimNode; target: SimNode; rel: string; }
const R = 11;

export function GraphView({ tax, study }: { tax: Taxonomy; study: Study }) {
  const { nodes, links } = useMemo(() => buildGraph(tax, study), [tax, study]);
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const simRef = useRef<Simulation<SimNode, undefined> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [size, setSize] = useState({ w: 900, h: 560 });
  const [selected, setSelected] = useState<string | null>(null);
  const [modal, setModal] = useState<EntityRecord | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ node: SimNode | null; moved: boolean; downX: number; downY: number; panFrom?: { x: number; y: number; vx: number; vy: number } }>({ node: null, moved: false, downX: 0, downY: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const prev = new Map(nodesRef.current.map((n) => [n.id, n]));
    const simNodes: SimNode[] = nodes.map((n) => {
      const p = prev.get(n.id);
      const seed = study.layout?.[n.id]; // shared with the canvas builder
      return {
        ...n,
        x: p?.x ?? seed?.x ?? size.w / 2 + (Math.random() - 0.5) * 200,
        y: p?.y ?? seed?.y ?? size.h / 2 + (Math.random() - 0.5) * 200,
      };
    });
    const byId = new Map(simNodes.map((n) => [n.id, n]));
    const simLinks: SimLink[] = links
      .map((l: GLink) => ({ source: byId.get(l.source)!, target: byId.get(l.target)!, rel: l.rel }))
      .filter((l) => l.source && l.target);
    nodesRef.current = simNodes;

    const sim = forceSimulation<SimNode>(simNodes)
      .force("charge", forceManyBody().strength(-360))
      .force("link", forceLink<SimNode, SimLink>(simLinks).id((d) => d.id).distance(110).strength(0.5))
      .force("center", forceCenter(size.w / 2, size.h / 2))
      .force("collide", forceCollide<SimNode>().radius(R + 18))
      .on("tick", rerender);
    simRef.current = sim;
    sim.alpha(0.9).restart();
    return () => { sim.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, links, size.w, size.h]);

  const toWorld = (cx: number, cy: number) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    return { x: (cx - rect.left - view.x) / view.k, y: (cy - rect.top - view.y) / view.k };
  };
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = wrapRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const k = Math.min(3, Math.max(0.25, view.k * (e.deltaY < 0 ? 1.12 : 0.89)));
    setView((v) => ({ k, x: mx - (mx - v.x) * (k / v.k), y: my - (my - v.y) * (k / v.k) }));
  };
  const onPointerDown = (e: React.PointerEvent, node?: SimNode) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current.moved = false; drag.current.downX = e.clientX; drag.current.downY = e.clientY;
    if (node) { drag.current.node = node; node.fx = node.x; node.fy = node.y; simRef.current?.alphaTarget(0.3).restart(); }
    else drag.current.panFrom = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (Math.hypot(e.clientX - drag.current.downX, e.clientY - drag.current.downY) > 3) drag.current.moved = true;
    if (drag.current.node) { const w = toWorld(e.clientX, e.clientY); drag.current.node.fx = w.x; drag.current.node.fy = w.y; }
    else if (drag.current.panFrom) {
      const p = drag.current.panFrom;
      setView((v) => ({ ...v, x: p.vx + (e.clientX - p.x), y: p.vy + (e.clientY - p.y) }));
    }
  };
  const onPointerUp = () => {
    const d = drag.current;
    if (d.node) {
      d.node.fx = null; d.node.fy = null; simRef.current?.alphaTarget(0);
      if (!d.moved) setSelected(d.node.id); // click, not drag → open info
    } else if (d.panFrom && !d.moved) {
      setSelected(null); // click on empty space → deselect
    }
    drag.current.node = null; drag.current.panFrom = undefined;
  };

  const simNodes = nodesRef.current;
  const byId = new Map(simNodes.map((n) => [n.id, n]));
  const selNode = selected ? byId.get(selected) : null;
  const isIncident = (l: GLink) => selected && (l.source === selected || l.target === selected);

  if (nodes.length === 0) {
    return <div className="empty"><h3>Nothing to show yet</h3>Add entities in the workshops — the graph grows with them.</div>;
  }

  const openEdit = (id: string) => setModal(study.entities.find((e) => e.id === id) ?? null);

  return (
    <div className="diagram-dock-layout">
      <div className="graph-main">
      <div className="graph-legend">
        {tax.groups.map((g) => (
          <span className="item" key={g.key}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: g.color }} /> {g.label}
          </span>
        ))}
        <span className="item" style={{ color: "var(--fg-subtle)" }}>Click a node for details · drag to move · scroll to zoom</span>
      </div>
      <div className="graph-wrap" ref={wrapRef}>
        <svg onWheel={onWheel} onPointerDown={(e) => onPointerDown(e)} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
          <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            {links.map((l, i) => {
              const s = byId.get(l.source), t = byId.get(l.target);
              if (!s || !t) return null;
              const inc = isIncident(l);
              const mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2;
              return (
                <g key={i}>
                  <line x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                    stroke={inc ? "var(--primary)" : "var(--border-strong)"}
                    strokeWidth={inc ? 1.8 : 1} strokeOpacity={selected && !inc ? 0.22 : 0.6} />
                  {(view.k >= 0.55 || inc) && (
                    <text x={mx} y={my} fontSize={9.5} textAnchor="middle"
                      fill={inc ? "var(--primary)" : "var(--fg-subtle)"}
                      opacity={selected && !inc ? 0.3 : 0.85}
                      style={{ pointerEvents: "none", userSelect: "none", paintOrder: "stroke" }}
                      stroke="var(--bg-0)" strokeWidth={3}>
                      {l.rel}
                    </text>
                  )}
                </g>
              );
            })}
            {simNodes.map((n) => {
              const t = getType(tax, n.type);
              const dim = selected && n.id !== selected && !links.some((l) => (l.source === selected && l.target === n.id) || (l.target === selected && l.source === n.id));
              return (
                <g key={n.id} transform={`translate(${n.x},${n.y})`}
                  onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, n); }} style={{ cursor: "pointer" }}
                  opacity={dim ? 0.32 : 1}>
                  <circle r={n.id === selected ? R + 3 : R} fill={n.color} fillOpacity={0.92}
                    stroke={n.id === selected ? "var(--fg)" : "var(--bg-0)"} strokeWidth={n.id === selected ? 3 : 2}>
                    <title>{(t?.label ?? n.type)}: {n.label}</title>
                  </circle>
                  <text x={R + 6} y={4} fontSize={11} fill="var(--fg)" style={{ pointerEvents: "none", userSelect: "none", paintOrder: "stroke" }}
                    stroke="var(--bg-0)" strokeWidth={3}>
                    {n.label.length > 26 ? n.label.slice(0, 26) + "…" : n.label}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      </div>
      {selNode && (
        <div className="detail-dock">
          <EntityInfoPanel tax={tax} study={study} id={selNode.id} onSelect={setSelected} onEdit={openEdit} onClose={() => setSelected(null)} />
        </div>
      )}
      {modal && <EntityModal type={getType(tax, modal.type)!} tax={tax} study={study} record={modal} onClose={() => setModal(null)} />}
    </div>
  );
}
