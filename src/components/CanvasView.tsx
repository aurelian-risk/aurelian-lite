// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Event flow — the parent app's engine, adopted as-is (frontend/src/components/
// workshop/event-flow.tsx): rich per-scenario chains, availableSet AND-filter
// with click-lockout, Sankey ribbons between highlighted cards (rAF-tracked),
// and the FLIP flight that centres the connected cards into a column tree.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { EntityRecord, Study, Taxonomy } from "../domain/types";
import { getType, recordTitle, refFields } from "../domain/taxonomy";
import { EntityInfoPanel } from "./EntityInfoPanel";
import { EntityModal } from "./EntityModal";
import { Icon } from "./ui";

const EBIOS = ["strategic_scenario", "operational_scenario", "kill_chain_step", "business_asset", "supporting_asset", "feared_event", "risk_origin", "target_objective", "stakeholder", "security_measure"];
const badgeOf = (label: string) => label.split(/[\s-]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

export function CanvasView({ tax, study }: { tax: Taxonomy; study: Study }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focused, setFocused] = useState<string | null>(null);
  const [modal, setModal] = useState<{ typeKey: string; record: EntityRecord | null } | null>(null);
  const lanesRef = useRef<HTMLDivElement>(null);
  const ribbonSvgRef = useRef<SVGSVGElement>(null);
  const warmedRef = useRef(false);
  const wasSelectingRef = useRef(false);
  const centerRafRef = useRef(0);
  const roRef = useRef<ResizeObserver | null>(null);
  const scrollLeftRef = useRef(0);   // user's horizontal scroll, captured on click to survive the refine re-render

  const byId = useMemo(() => new Map(study.entities.map((e) => [e.id, e])), [study.entities]);
  const groupColor = (typeKey: string | undefined) => tax.groups.find((g) => g.key === getType(tax, typeKey ?? "")?.group)?.color ?? "var(--border-strong)";
  const laneIndexOf = (id: string) => tax.entityTypes.findIndex((t) => t.key === byId.get(id)?.type);

  const links = useMemo(() => {
    const out: { source: string; target: string }[] = [];
    for (const e of study.entities) {
      const t = getType(tax, e.type); if (!t) continue;
      for (const f of refFields(t)) {
        const v = e.values[f.key];
        const ids = f.type === "multiref" ? (Array.isArray(v) ? (v as string[]) : []) : v ? [v as string] : [];
        for (const to of ids) if (byId.has(to)) out.push({ source: e.id, target: to });
      }
    }
    return out;
  }, [study.entities, tax, byId]);

  // === Pre-compute event chains — exact port of the parent's traversal. ===
  const eventChains = useMemo(() => {
    const has = new Set(tax.entityTypes.map((t) => t.key));
    const of = (type: string) => study.entities.filter((e) => e.type === type);
    const arr = (id: string, k: string) => { const v = byId.get(id)?.values[k]; return Array.isArray(v) ? (v as string[]) : v ? [v as string] : []; };
    const chains: Set<string>[] = [];
    if (EBIOS.every((k) => has.has(k))) {
      for (const ss of of("strategic_scenario")) {
        const c = new Set<string>([ss.id]);
        const ros = arr(ss.id, "risk_origin"); ros.forEach((k) => c.add(k));
        arr(ss.id, "stakeholder").forEach((k) => c.add(k));
        const fes = arr(ss.id, "feared_event"); fes.forEach((k) => c.add(k));
        for (const ro of ros) for (const to of of("target_objective")) if (to.values.risk_origin === ro) c.add(to.id);
        for (const id of [...c]) if (byId.get(id)?.type === "target_objective") arr(id, "aims_at").forEach((k) => c.add(k));
        for (const fe of fes) arr(fe, "business_asset").forEach((k) => c.add(k));
        for (const ba of [...c].filter((id) => byId.get(id)?.type === "business_asset")) for (const sa of of("supporting_asset")) if ((sa.values.supports as string[] | undefined ?? []).includes(ba)) c.add(sa.id);
        arr(ss.id, "stakeholder").forEach((sh) => arr(sh, "provides_access_to").forEach((k) => c.add(k)));
        for (const os of of("operational_scenario").filter((o) => o.values.strategic_scenario === ss.id)) {
          c.add(os.id);
          for (const st of of("kill_chain_step").filter((k) => k.values.operational_scenario === os.id)) { c.add(st.id); for (const sm of of("security_measure")) if ((sm.values.covers as string[] | undefined ?? []).includes(st.id)) c.add(sm.id); }
        }
        chains.push(c);
      }
      return chains;
    }
    const aOut = new Map<string, Set<string>>(), aIn = new Map<string, Set<string>>();
    const add = (m: Map<string, Set<string>>, a: string, b: string) => { if (!m.has(a)) m.set(a, new Set()); m.get(a)!.add(b); };
    for (const l of links) { add(aOut, l.source, l.target); add(aIn, l.target, l.source); }
    const closure = (s: string, adj: Map<string, Set<string>>) => { const seen = new Set([s]), st = [s]; while (st.length) { const n = st.pop()!; for (const m of adj.get(n) ?? []) if (!seen.has(m)) { seen.add(m); st.push(m); } } return seen; };
    const stepType = tax.entityTypes.find((t) => t.fields.some((f) => f.type === "ref" && f.refType) && t.fields.some((f) => f.type === "number"));
    const opType = stepType?.fields.find((f) => f.type === "ref" && f.refType)?.refType ?? null;
    const rootType = opType ? (getType(tax, opType)?.fields.find((f) => f.type === "ref" && f.refType && f.refType !== opType)?.refType ?? opType) : null;
    for (const r of rootType ? of(rootType) : []) chains.push(new Set<string>([...closure(r.id, aOut), ...closure(r.id, aIn)]));
    return chains;
  }, [study.entities, tax, byId, links]);

  const inAnyChain = useMemo(() => { const s = new Set<string>(); for (const c of eventChains) for (const k of c) s.add(k); return s; }, [eventChains]);

  const availableSet = useMemo(() => {
    if (selected.size === 0) return null;
    const matching = eventChains.filter((c) => { for (const s of selected) if (!c.has(s)) return false; return true; });
    const av = new Set<string>(selected);
    for (const c of matching) for (const k of c) av.add(k);
    return av;
  }, [selected, eventChains]);

  const activeRibbons = useMemo(() => {
    if (!availableSet || availableSet.size < 2) return [] as { key: string; color: string; source: string; target: string }[];
    const out: { key: string; color: string; source: string; target: string }[] = [];
    for (const l of links) if (availableSet.has(l.source) && availableSet.has(l.target))
      out.push({ key: `${l.source}-${l.target}`, color: groupColor(byId.get(l.source)?.type), source: l.source, target: l.target });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableSet, links, byId, tax]);

  // Ribbon `d` tracked each frame (imperative) so lines follow the flying cards.
  useLayoutEffect(() => {
    const el = lanesRef.current, svg = ribbonSvgRef.current;
    if (!el || !svg || activeRibbons.length === 0) return;
    let raf = 0, running = true;
    const update = () => {
      if (!running) return;
      const base = el.getBoundingClientRect();
      const cache = new Map<string, { l: number; r: number; t: number; h: number } | null>();
      const rectFor = (k: string) => {
        if (cache.has(k)) return cache.get(k)!;
        const node = el.querySelector(`[data-nk="${CSS.escape(k)}"]`) as HTMLElement | null;
        const r = node ? (() => { const b = node.getBoundingClientRect(); return { l: b.left - base.left, r: b.right - base.left, t: b.top - base.top, h: b.height }; })() : null;
        cache.set(k, r); return r;
      };
      const writes: [SVGPathElement, string][] = [];
      for (const rb of activeRibbons) {
        const path = svg.querySelector(`[data-ribbon="${CSS.escape(rb.key)}"]`) as SVGPathElement | null;
        if (!path) continue;
        const ra = rectFor(rb.source), rc = rectFor(rb.target);
        if (!ra || !rc) { writes.push([path, ""]); continue; }
        const aLeft = ra.l + ra.r <= rc.l + rc.r;
        const from = aLeft ? ra : rc, to = aLeft ? rc : ra;
        const sx = from.r, sy = from.t + from.h / 2, tx = to.l, ty = to.t + to.h / 2, mx = sx + (tx - sx) * 0.5;
        writes.push([path, `M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ty}, ${tx} ${ty}`]);
      }
      for (const [p, d] of writes) p.setAttribute("d", d);
      raf = requestAnimationFrame(update);
    };
    update();
    return () => { running = false; cancelAnimationFrame(raf); };
  }, [activeRibbons]);

  // FLIP: connected cards fly into a centred column tree (parent port). The
  // scroller is reset to the left so the tree is always visible from its start.
  useLayoutEffect(() => {
    const el = lanesRef.current;
    if (!el) return;
    roRef.current?.disconnect(); roRef.current = null; cancelAnimationFrame(centerRafRef.current);
    const cards = Array.from(el.querySelectorAll<HTMLElement>("[data-nk]"));
    const headers = Array.from(el.querySelectorAll<HTMLElement>(".lane-header[data-lane]"));
    const reset = (c: HTMLElement) => { c.style.transform = ""; c.style.animationDelay = ""; c.classList.remove("ef-floating"); };
    const resetHeader = (h: HTMLElement) => { h.style.transform = ""; h.classList.remove("ef-lane-flown"); };
    if (!availableSet || selected.size === 0) { cards.forEach(reset); headers.forEach(resetHeader); wasSelectingRef.current = false; return; }
    headers.forEach(resetHeader);
    // Horizontal scroll: reveal the centred tree from its start only when FIRST
    // entering highlight mode. On a refining click the React commit resets the
    // scroller to the left, which yanks the view while the user is scrolling
    // around - so restore the position captured at click time instead.
    const scroller = el.parentElement;
    if (scroller) scroller.scrollLeft = wasSelectingRef.current ? scrollLeftRef.current : 0;
    wasSelectingRef.current = true;
    const byLane = new Map<number, HTMLElement[]>();
    cards.forEach((c) => {
      const nk = c.dataset.nk || "";
      if (!availableSet.has(nk)) { reset(c); return; }
      const li = laneIndexOf(nk);
      if (li < 0) { reset(c); return; }
      (byLane.get(li) ?? byLane.set(li, []).get(li)!).push(c);
    });
    const lanesSorted = [...byLane.keys()].sort((a, b) => a - b);
    if (!lanesSorted.length) return;
    const viewW = scroller ? scroller.clientWidth : el.clientWidth;
    const viewH = scroller ? scroller.clientHeight : el.clientHeight;
    const vGap = 44, colW = 200, colGap = 58;
    const colHeight = (g: HTMLElement[]) => g.reduce((s, c) => s + c.offsetHeight + vGap, -vGap);
    // Build the flown tree centred on the CURRENT viewport, and - when a node is
    // focused - shift it vertically so that node lands on the viewport's vertical
    // centre. The scroller only scrolls horizontally, so a tree placed at the
    // cards' natural top can fly off-screen with no way to scroll to it; anchoring
    // it to the viewport centre here keeps the clicked node (and its tree) in view.
    // viewMidY is the viewport centre expressed in the cards' offsetTop space
    // (offsetParent = .flow-lanes), i.e. corrected by the lane container's offset.
    const laneOffset = scroller ? el.getBoundingClientRect().top - scroller.getBoundingClientRect().top : 0;
    const viewMidY = viewH / 2 - laneOffset;
    let centerY = viewMidY;
    if (focused && availableSet.has(focused)) {
      const fgroup = byLane.get(laneIndexOf(focused));
      const fidx = fgroup ? fgroup.findIndex((c) => c.dataset.nk === focused) : -1;
      if (fgroup && fidx >= 0) {
        let prefix = 0; for (let j = 0; j < fidx; j++) prefix += fgroup[j].offsetHeight + vGap;
        centerY = viewMidY + colHeight(fgroup) / 2 - prefix - fgroup[fidx].offsetHeight / 2;
      }
    }
    const totalW = lanesSorted.length * colW + (lanesSorted.length - 1) * colGap;
    const startX = Math.max(8, (viewW - totalW) / 2);
    const flown: { c: HTMLElement; dx: number; dy: number }[] = [];
    lanesSorted.forEach((li, idx) => {
      const group = byLane.get(li)!;
      const colX = startX + idx * (colW + colGap);
      // The lane header flies to sit centred above its (relocated) column.
      const laneKey = tax.entityTypes[li]?.key;
      const header = laneKey ? el.querySelector<HTMLElement>(`.lane-header[data-lane="${CSS.escape(laneKey)}"]`) : null;
      if (header) {
        header.style.transform = `translateX(${(colX + (colW - header.offsetWidth) / 2 - header.offsetLeft).toFixed(1)}px)`;
        header.classList.add("ef-lane-flown");
      }
      let cy = centerY - colHeight(group) / 2;
      for (const c of group) {
        const dx = colX + (colW - c.offsetWidth) / 2 - c.offsetLeft;
        const dy = cy - c.offsetTop;
        c.style.transform = `translate(${dx}px, ${dy}px) scale(1.05)`;
        c.style.animationDelay = `${((c.offsetTop % 700) / 700).toFixed(2)}s`;
        c.classList.add("ef-floating");
        flown.push({ c, dx, dy });
        cy += c.offsetHeight + vGap;
      }
    });
    // The detail dock opens on the same click and GROWS over ~0.32s, shrinking the
    // scroller after this layout pass. Re-centre the clicked node whenever the
    // scroller's size settles (a ResizeObserver covers the whole dock animation and
    // any window resize): shift every flown card so the node lands on the viewport's
    // vertical centre, keeping it and its tree from flying off-screen. The shift is
    // geometric - a card whose flown top is `cy` in .flow-lanes space renders at
    // viewportY = laneTop + cy, so the clicked card is centred when
    // cy = viewH/2 - laneOffset - h/2 - and measures only stable elements, so the
    // running fly transition never corrupts the result.
    const fc = flown.find((x) => x.c.dataset.nk === focused);
    if (scroller && fc) {
      const recenter = () => {
        if (!fc.c.isConnected || !scroller.isConnected) return;
        const laneOffset = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        const cyWanted = scroller.clientHeight / 2 - laneOffset - fc.c.offsetHeight / 2;
        const delta = cyWanted - (fc.dy + fc.c.offsetTop);
        for (const g of flown) g.c.style.transform = `translate(${g.dx}px, ${(g.dy + delta).toFixed(1)}px) scale(1.05)`;
      };
      const ro = new ResizeObserver(recenter);   // fires once immediately, then on every size change
      ro.observe(scroller);
      roRef.current = ro;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableSet, selected, study.entities]);

  // Tear down the re-centre observer / frame on unmount.
  useEffect(() => () => { roRef.current?.disconnect(); cancelAnimationFrame(centerRafRef.current); }, []);

  // Escape clears the current selection (same as the Clear button).
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") { setSelected((prev) => (prev.size ? new Set() : prev)); setFocused(null); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // Mount warm-up so the first flight doesn't stutter (parent port).
  useLayoutEffect(() => {
    const el = lanesRef.current;
    if (!el || warmedRef.current || study.entities.length === 0) return;
    const cards = Array.from(el.querySelectorAll<HTMLElement>("[data-nk]")).slice(0, 16);
    if (!cards.length) return;
    warmedRef.current = true;
    const r1 = requestAnimationFrame(() => {
      for (const c of cards) { c.style.transition = "none"; c.classList.add("ef-pop", "ef-floating"); c.style.transform = "translate(0px,0px) scale(1)"; void c.offsetHeight; }
      requestAnimationFrame(() => { for (const c of cards) { c.classList.remove("ef-pop", "ef-floating"); c.style.transform = ""; c.style.transition = ""; } });
    });
    return () => cancelAnimationFrame(r1);
  }, [study.entities]);

  // Click: always show details below; toggle selection only on valid picks.
  const clickNode = (id: string) => {
    // Remember the current horizontal scroll so a refining click can restore it
    // (the re-render otherwise snaps the scroller back to the left).
    const sc = lanesRef.current?.parentElement;
    if (sc) scrollLeftRef.current = sc.scrollLeft;
    setFocused(id);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (prev.size === 0 || availableSet?.has(id)) next.add(id);
      return next;
    });
  };
  const openEdit = (id: string) => { const r = byId.get(id); if (r) setModal({ typeKey: r.type, record: r }); };
  const nodeState = (id: string): "selected" | "available" | "normal" =>
    selected.has(id) ? "selected" : selected.size === 0 ? "normal" : availableSet?.has(id) ? "available" : "normal";

  return (
    <div className="diagram-dock-layout">
      <div className="flow-main">
      <div className="flow-toolbar">
        <span className="hint">Click a node to trace its chains — pick several to narrow many paths to one.</span>
        <span style={{ flex: 1 }} />
        {selected.size > 0 && <button className="btn sm" onClick={() => { setSelected(new Set()); setFocused(null); }}>Clear ({selected.size})</button>}
      </div>
      <div className="flow-scroll">
        <div className="flow-topmask" aria-hidden />
        <div className="flow-lanes" ref={lanesRef}>
          {activeRibbons.length > 0 && (
            <svg ref={ribbonSvgRef} className="ribbons" preserveAspectRatio="none">
              {activeRibbons.map((r) => (
                <path key={r.key} data-ribbon={r.key} fill="none" stroke={r.color} strokeWidth={1.7} strokeOpacity={0.9} strokeLinecap="round" />
              ))}
            </svg>
          )}
          {tax.entityTypes.map((type) => {
            const items = study.entities.filter((e) => e.type === type.key);
            if (items.length === 0) return null;
            // In highlight mode, drop whole columns that hold no available data.
            if (availableSet && !items.some((e) => availableSet.has(e.id))) return null;
            const color = groupColor(type.key);
            const badge = badgeOf(type.label);
            return (
              <div className="flow-lane" key={type.key}>
                <div className="lane-header" data-lane={type.key} style={{ borderColor: color }}>
                  <span className="lane-dot" style={{ background: color }} />
                  <span className="lane-label">{type.labelPlural}</span>
                  <span className="lane-count" style={{ color, borderColor: `color-mix(in oklch, ${color} 45%, transparent)` }}>{items.length}</span>
                  <button className="lane-add" title={`New ${type.label}`} onClick={() => setModal({ typeKey: type.key, record: null })}><Icon.plus /></button>
                </div>
                <div className="lane-body">
                  {items.map((e) => {
                    const st = nodeState(e.id);
                    const active = st === "selected" || st === "available";
                    const orphan = !inAnyChain.has(e.id);
                    const cls = "flow-node ef-card " + (st === "normal" ? "z0" : "z30")
                      + (active ? " ef-pop" : "") + (st === "selected" ? " selected" : "")
                      + (orphan && st === "normal" ? " ef-orphan" : "")
                      + (!orphan && st === "normal" && selected.size > 0 ? " ef-dimmed" : "");
                    const bg = active
                      ? `linear-gradient(color-mix(in oklch, ${color} ${st === "selected" ? 22 : 14}%, transparent), color-mix(in oklch, ${color} ${st === "selected" ? 22 : 14}%, transparent)), var(--bg-raised)`
                      : `color-mix(in oklch, ${color} 8%, transparent)`;
                    return (
                      <button key={e.id} data-nk={e.id} className={cls}
                        style={{ borderColor: active ? "transparent" : `color-mix(in oklch, ${color} 26%, transparent)`, background: bg }}
                        // Focus the card without the browser scrolling it into view - that
                        // scroll is what yanked the swimlane horizontally back to the left.
                        onMouseDown={(ev) => { ev.preventDefault(); ev.currentTarget.focus({ preventScroll: true }); }}
                        onClick={() => clickNode(e.id)}>
                        <span className="node-badge" style={{ background: color }}>{badge}</span>
                        <span className="node-name">{recordTitle(type, e)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      </div>

      {focused && (
        <div className="detail-dock">
          <EntityInfoPanel tax={tax} study={study} id={focused}
            onSelect={(id) => setFocused(id)} onEdit={openEdit} onClose={() => setFocused(null)} />
        </div>
      )}
      {modal && <EntityModal type={getType(tax, modal.typeKey)!} tax={tax} study={study} record={modal.record} onClose={() => setModal(null)} />}
    </div>
  );
}
