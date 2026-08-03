// Integrated attack-paths view: a READ-ONLY projection of all operational-scenario
// kill chains into one graph that converges on the target assets. The kill chains
// remain the single source of truth. Intra-chain edges come from step order (with
// explicit `predecessors` adding branches); cross-chain edges come ONLY from an
// explicit predecessor that points at a step in another scenario. A *pass-through*
// asset reached by more than one visible chain (i.e. attacks continue through it, so
// it is not merely a shared final target) is highlighted as a choke point.
import { useMemo, useState } from "react";
import type { EntityRecord, Study, Taxonomy } from "../domain/types";
import { getType, recordTitle } from "../domain/taxonomy";
import { EntityModal } from "./EntityModal";

const CHAIN_COLORS = ["var(--color-workshop-4)", "var(--chainB, #7d5bd0)", "var(--color-workshop-2)", "var(--color-workshop-1)", "var(--color-workshop-5)"];
const NW = 190, NH = 104, HGAP = 72, VGAP = 38, PAD = 28;

interface Node { id: string; kind: "step" | "asset" | "biz"; chains: Set<string>; label: string; tactic?: string; tech?: string; mit?: boolean; rec?: EntityRecord; x: number; y: number; }
interface Edge { from: string; to: string; kind: "intra" | "cross" | "asset"; }

export function AttackPathsView({ tax, study, color }: { tax: Taxonomy; study: Study; color: string }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [openRec, setOpenRec] = useState<EntityRecord | null>(null);
  const [collapsed, setCollapsed] = useState(true);

  const model = useMemo(() => {
    const stepType = tax.entityTypes.find((t) => t.fields.some((f) => f.type === "ref" && f.refType) && t.fields.some((f) => f.type === "number"));
    const parentF = stepType?.fields.find((f) => f.type === "ref" && f.refType);
    const orderF = stepType?.fields.find((f) => f.type === "number");
    const predF = stepType?.fields.find((f) => f.type === "multiref" && f.refType === stepType?.key);
    const tacticF = stepType?.fields.find((f) => f.type === "enum" && f.key !== "join");
    const techF = stepType?.fields.find((f) => f.type === "text" && f.key !== (stepType?.titleField ?? "name"));
    const targetF = stepType?.fields.find((f) => f.type === "ref" && f.refType && f.key !== parentF?.key);
    const measureType = tax.entityTypes.find((t) => t.key !== stepType?.key && t.fields.some((f) => f.type === "multiref" && f.refType === stepType?.key));
    const coversF = measureType?.fields.find((f) => f.type === "multiref" && f.refType === stepType?.key);
    const opType = parentF?.refType ? getType(tax, parentF.refType) : undefined;
    if (!stepType || !parentF || !orderF || !opType) return null;

    const steps = study.entities.filter((e) => e.type === stepType.key);
    if (!steps.length) return null;
    const ids = new Set(steps.map((s) => s.id));
    const chainOf = (s: EntityRecord) => String(s.values[parentF.key] ?? "");
    const ops = study.entities.filter((e) => e.type === opType.key && steps.some((s) => chainOf(s) === e.id));
    const chainColor = new Map(ops.map((o, i) => [o.id, CHAIN_COLORS[i % CHAIN_COLORS.length]]));
    const chainName = new Map(ops.map((o) => [o.id, recordTitle(opType, o)]));

    // predecessors of a step: explicit if any, else the previous step in its own chain by order.
    const byChainOrdered = new Map<string, EntityRecord[]>();
    for (const o of ops) byChainOrdered.set(o.id, steps.filter((s) => chainOf(s) === o.id).sort((a, b) => Number(a.values[orderF.key] || 0) - Number(b.values[orderF.key] || 0)));
    const predsOf = (s: EntityRecord): string[] => {
      const explicit = predF && Array.isArray(s.values[predF.key]) ? (s.values[predF.key] as string[]).filter((id) => ids.has(id)) : [];
      if (explicit.length) return explicit;
      const chain = byChainOrdered.get(chainOf(s)) ?? [];
      const idx = chain.findIndex((x) => x.id === s.id);
      return idx > 0 ? [chain[idx - 1].id] : [];
    };

    const measures = measureType && coversF ? study.entities.filter((e) => e.type === measureType.key) : [];
    const mitigated = (sid: string) => measures.some((m) => Array.isArray(m.values[coversF!.key]) && (m.values[coversF!.key] as string[]).includes(sid));

    // assemble nodes + edges
    const nodes = new Map<string, Node>();
    const edges: Edge[] = [];
    const stepById = new Map(steps.map((s) => [s.id, s]));
    for (const s of steps) {
      nodes.set(s.id, { id: s.id, kind: "step", chains: new Set([chainOf(s)]), label: recordTitle(stepType, s),
        tactic: tacticF ? String(s.values[tacticF.key] ?? "") : "", tech: techF ? String(s.values[techF.key] ?? "") : "",
        mit: mitigated(s.id), rec: s, x: 0, y: 0 });
    }
    for (const s of steps) for (const pid of predsOf(s)) {
      const cross = stepById.get(pid) && chainOf(stepById.get(pid)!) !== chainOf(s);
      edges.push({ from: pid, to: s.id, kind: cross ? "cross" : "intra" });
    }
    // target assets (+ the business assets they support) as terminal nodes
    const assetNode = (rec: EntityRecord, chain: string, kind: "asset" | "biz") => {
      const n = nodes.get(rec.id);
      if (n) { n.chains.add(chain); return; }
      const t = getType(tax, rec.type);
      nodes.set(rec.id, { id: rec.id, kind, chains: new Set([chain]), label: t ? recordTitle(t, rec) : rec.id,
        tactic: t?.label ?? "", rec, x: 0, y: 0 });
    };
    for (const s of steps) {
      const tid = targetF ? s.values[targetF.key] : undefined;
      const target = typeof tid === "string" ? study.entities.find((e) => e.id === tid) : undefined;
      if (!target) continue;
      assetNode(target, chainOf(s), "asset");
      edges.push({ from: s.id, to: target.id, kind: "asset" });
      // the supporting asset feeds the business asset(s) it supports — the ultimate target
      const tt = getType(tax, target.type);
      const supF = tt?.fields.find((f) => f.type === "multiref");
      const bizIds = supF && Array.isArray(target.values[supF.key]) ? (target.values[supF.key] as string[]) : [];
      for (const bid of bizIds) {
        const biz = study.entities.find((e) => e.id === bid);
        if (!biz) continue;
        assetNode(biz, chainOf(s), "biz");
        edges.push({ from: target.id, to: biz.id, kind: "asset" });
      }
    }
    return { nodes, edges, ops, chainColor, chainName, stepType };
  }, [tax, study]);

  if (!model) return <div className="empty" style={{ padding: "60px 24px" }}>No kill-chain steps yet — model an operational scenario's kill chain to see its attack paths.</div>;

  const { nodes, edges, ops, chainColor, chainName } = model;
  const visibleChain = (id: string) => !hidden.has(id);
  const nodeVisible = (n: Node) => [...n.chains].some(visibleChain);
  const vis = [...nodes.values()].filter(nodeVisible);
  const visIds = new Set(vis.map((n) => n.id));
  const visEdges = edges.filter((e) => visIds.has(e.from) && visIds.has(e.to));

  // longest-path depth over the visible sub-graph
  const inc = new Map<string, string[]>();
  for (const e of visEdges) (inc.get(e.to) ?? inc.set(e.to, []).get(e.to)!).push(e.from);
  const memo = new Map<string, number>();
  const depth = (id: string, seen = new Set<string>()): number => {
    if (memo.has(id)) return memo.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const ps = inc.get(id) ?? [];
    const d = ps.length ? 1 + Math.max(...ps.map((p) => depth(p, new Set(seen)))) : 0;
    memo.set(id, d); return d;
  };
  const cols: Node[][] = [];
  for (const n of vis) { const d = depth(n.id); (cols[d] ||= []).push(n); }
  const maxRows = Math.max(1, ...cols.map((c) => (c ? c.length : 0)));
  const W = PAD * 2 + cols.length * NW + (cols.length - 1) * HGAP;
  const H = PAD * 2 + maxRows * NH + (maxRows - 1) * VGAP;
  cols.forEach((c, di) => {
    if (!c) return;
    const colH = c.length * NH + (c.length - 1) * VGAP;
    const y0 = PAD + (H - PAD * 2 - colH) / 2;
    c.forEach((n, ri) => { n.x = PAD + di * (NW + HGAP); n.y = y0 + ri * (NH + VGAP); });
  });
  // choke points: a *pass-through* asset that ≥2 visible chains converge on AND that
  // still feeds something downstream (has an outgoing edge). A leaf target (e.g. a
  // business asset every path simply ends at) is the objective, not a choke point.
  const hasOut = new Set(visEdges.map((e) => e.from));
  const choke = (n: Node) => n.kind !== "step" && [...n.chains].filter(visibleChain).length >= 2 && hasOut.has(n.id);
  const chokeCount = vis.filter(choke).length;

  const toggle = (id: string) => setHidden((h) => { const n = new Set(h); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const anchor = (id: string, side: "l" | "r") => { const n = nodes.get(id)!; return { x: side === "r" ? n.x + NW : n.x, y: n.y + NH / 2 }; };

  return (
    <div className="panel ws-accent ap-wrap" style={{ ["--ws-color" as string]: color, marginBottom: 20 }}>
      <button className="panel-head ap-head" onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed}>
        <svg className={"ap-chevron" + (collapsed ? "" : " open")} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        <h3>Attack paths</h3>
        <span className="panel-sub">read-only projection of all kill chains onto the target assets</span>
        <span className="spacer" />
        {chokeCount > 0 && <span className="ap-choketag">{chokeCount} choke point{chokeCount === 1 ? "" : "s"}</span>}
      </button>
      {!collapsed && (
      <div className="panel-body ap-body">

      <div className="ap-toolbar">
        <span className="ap-tb-label">Chains</span>
        {ops.map((o) => (
          <button key={o.id} className={"ap-chip" + (visibleChain(o.id) ? "" : " off")} onClick={() => toggle(o.id)}>
            <span className="sw" style={{ background: chainColor.get(o.id) }} />{chainName.get(o.id)}
          </button>
        ))}
      </div>

      <div className="ap-stage">
        <div className="ap-scroll">
          <div className="ap-graph" style={{ width: W, height: H }}>
            <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="ap-edges">
              <defs>
                <marker id="ap-ar" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto"><path d="M0 0 L9 4.5 L0 9 z" fill="var(--fg-subtle)" /></marker>
                <marker id="ap-arA" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="var(--color-workshop-1)" /></marker>
                <marker id="ap-arX" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto"><path d="M0 0 L9 4.5 L0 9 z" fill="var(--chainB, #7d5bd0)" /></marker>
              </defs>
              {visEdges.map((e, i) => {
                const a = anchor(e.from, "r"), b = anchor(e.to, "l"), mx = (a.x + b.x) / 2;
                const d = `M${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x - 2} ${b.y}`;
                const st = e.kind === "asset" ? { stroke: "var(--color-workshop-1)", w: 2.4, dash: "", m: "url(#ap-arA)", op: 0.75 }
                  : e.kind === "cross" ? { stroke: "var(--chainB, #7d5bd0)", w: 1.7, dash: "5 4", m: "url(#ap-arX)", op: 0.85 }
                  : { stroke: "var(--fg-subtle)", w: 1.5, dash: "", m: "url(#ap-ar)", op: 0.65 };
                return <path key={i} d={d} fill="none" stroke={st.stroke} strokeWidth={st.w} strokeDasharray={st.dash} markerEnd={st.m} opacity={st.op} />;
              })}
            </svg>
            {vis.map((n) => {
              const col = n.kind === "biz" ? "var(--color-workshop-1)" : n.kind === "asset" ? "var(--amber-bright, #dd9a33)" : chainColor.get([...n.chains][0]!);
              const cls = "ap-node " + n.kind + (choke(n) ? " choke" : "");
              return (
                <div key={n.id} className={cls} title={n.kind === "step" ? "Open step" : "Open asset"}
                  style={{ left: n.x, top: n.y, width: NW, ["--nc" as string]: col }}
                  onClick={() => n.rec && setOpenRec(n.rec)}>
                  {n.kind === "step" && <span className={"ap-dot " + (n.mit ? "ok" : "gap")} />}
                  {choke(n) && <span className="ap-choke-badge">choke</span>}
                  <div className="ap-tac">{n.tactic || (n.kind === "step" ? "Step" : "Asset")}</div>
                  <div className="ap-nm">{n.label}</div>
                  {n.tech && <span className="ap-tt">{n.tech}</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="ap-legend">
        <span className="it"><span className="ap-dot ok" style={{ position: "static" }} /> step mitigated</span>
        <span className="it"><span className="ap-dot gap" style={{ position: "static" }} /> coverage gap</span>
        <span className="it"><span className="sw asset" /> supporting asset</span>
        <span className="it"><span className="sw biz" /> business asset</span>
        <span className="it"><span className="k dash" /> cross-chain link (explicit)</span>
        <span className="it"><span className="sw choke" /> choke point</span>
      </div>

      <div className="ap-note">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.01" /></svg>
        <div>
          <strong>Choke points</strong> are assets that more than one kill chain has to pass through to reach its target.
          Because several attack paths converge on them, a single control placed there mitigates multiple scenarios at once —
          making them the highest-leverage place to invest. Toggle a chain above to isolate its paths; click any node to open the underlying step or asset.
        </div>
      </div>

      </div>
      )}
      {openRec && <EntityModal type={getType(tax, openRec.type)!} tax={tax} study={study} record={openRec} onClose={() => setOpenRec(null)} />}
    </div>
  );
}
