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

/** The zoom ratio the browser has ACTUALLY applied to `el`, measured rather than intended.
 *  `zoomRef` is written synchronously on the wheel event and runs a frame or two ahead of
 *  the paint; anything that mixes screen pixels with layout pixels has to divide by what is
 *  on screen NOW, or it computes for a zoom the cards do not have yet. */
function appliedZoom(el: HTMLElement): number {
  const w = el.offsetWidth;
  return w > 0 ? el.getBoundingClientRect().width / w : 1;
}

export function CanvasView({ tax, study }: { tax: Taxonomy; study: Study }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focused, setFocused] = useState<string | null>(null);
  const [modal, setModal] = useState<{ typeKey: string; record: EntityRecord | null } | null>(null);
  const lanesRef = useRef<HTMLDivElement>(null);
  const ribbonSvgRef = useRef<SVGSVGElement>(null);
  const warmedRef = useRef(false);
  const centerRafRef = useRef(0);
  const roRef = useRef<ResizeObserver | null>(null);
  const scrollLeftRef = useRef(0);   // user's horizontal scroll, captured on click to survive the refine re-render
  // Zoom, and the pan that goes with it. CSS `zoom` rather than `transform: scale`:
  // measured (harness), zoom shrinks the scrollable area on BOTH axes while a transform
  // leaves the height standing, so with a transform there is no way to scroll to what was
  // pushed out of view. What zoom does NOT change is `offsetTop`/`offsetLeft` - those stay
  // in unzoomed pixels while every getBoundingClientRect is zoomed, which is exactly the
  // mixture the FLIP flight below computes with. Hence `/ z` at each screen-derived value.
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  zoomRef.current = zoom;
  const panRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<{ px: number; py: number; cx: number; cy: number } | null>(null);
  const placeRef = useRef<((why: "select" | "zoom" | "rescroll") => void) | null>(null);
  const clearRef = useRef<(() => void) | null>(null);
  const anchoredRef = useRef<{ startX: number; centerY: number } | null>(null);

  // Applied after the DOM carries the new zoom and before it is painted, so the zoom and
  // the scroll that keeps the pointer's spot under the pointer land in the same frame.
  // Setting it from a requestAnimationFrame instead showed the new zoom for one frame with
  // the old scroll still in place, which is a visible lurch under the pointer.
  //
  // The horizontal anchor is exact - measured over four notches to 1.46x, wanted 35.9px,
  // applied 36. The vertical is a few pixels short (30.6 wanted, 27 held) and no amount of
  // re-applying fixes it, because `zoom` is a LAYOUT scale: the text inside a card rebreaks
  // and the card came out 1.509x taller against a 1.464x zoom. A point in reflowing text
  // has no fixed place to be anchored to.
  useLayoutEffect(() => {
    const sc = scrollRef.current, a = anchorRef.current;
    if (!sc || !a) return;
    anchorRef.current = null;
    sc.scrollLeft = a.px * zoom - a.cx;
    sc.scrollTop = a.py * zoom - a.cy;
  }, [zoom]);

  // The wheel listener is attached by hand, NOT through onWheel: React registers wheel
  // handlers as PASSIVE, where preventDefault does nothing but log a warning - so the view
  // would zoom AND scroll at the same time. Measured in the e2e run before this comment
  // existed: six "Unable to preventDefault inside passive event listener invocation".
  useEffect(() => {
    const sc = scrollRef.current; if (!sc) return;
    const onWheel = (e: WheelEvent) => {
      const z0 = zoomRef.current;
      const z1 = Math.min(1.6, Math.max(0.35, z0 * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
      if (z1 === z0) return;                       // at the stops, let the page scroll
      e.preventDefault();
      // Zoom about the pointer: what was under it stays under it. Without that the view
      // walks away from whatever the reader was looking at on every notch.
      // `scrollLeft` belongs to the layout as PAINTED, so it converts to card space with
      // the applied ratio - not with z0, which two wheel notches inside one frame leave
      // running ahead of the screen. The step above uses z0: that chain is about intent.
      const r = sc.getBoundingClientRect();
      const zNow = lanesRef.current ? appliedZoom(lanesRef.current) : z0;
      const px = (sc.scrollLeft + e.clientX - r.left) / zNow;
      const py = (sc.scrollTop + e.clientY - r.top) / zNow;
      zoomRef.current = z1;
      // Where the scroll has to land, handed to the layout effect above.
      anchorRef.current = { px, py, cx: e.clientX - r.left, cy: e.clientY - r.top };
      setZoom(z1);
    };
    sc.addEventListener("wheel", onWheel, { passive: false });
    return () => sc.removeEventListener("wheel", onWheel);
  }, []);

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
      // Measured, not intended - see appliedZoom. Dividing by the ref instead left the
      // ribbons up to 228px away from their cards for the frames a zoom takes to land.
      const base = el.getBoundingClientRect();
      const z = appliedZoom(el);
      const cache = new Map<string, { l: number; r: number; t: number; h: number } | null>();
      const rectFor = (k: string) => {
        if (cache.has(k)) return cache.get(k)!;
        const node = el.querySelector(`[data-nk="${CSS.escape(k)}"]`) as HTMLElement | null;
        const r = node ? (() => { const b = node.getBoundingClientRect();
          return { l: (b.left - base.left) / z, r: (b.right - base.left) / z, t: (b.top - base.top) / z, h: b.height / z }; })() : null;
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
    placeRef.current = null; clearRef.current = null; anchoredRef.current = null;
    const cards = Array.from(el.querySelectorAll<HTMLElement>("[data-nk]"));
    const headers = Array.from(el.querySelectorAll<HTMLElement>(".lane-header[data-lane]"));
    const reset = (c: HTMLElement) => { c.style.transform = ""; c.style.animationDelay = ""; c.classList.remove("ef-floating"); };
    const resetHeader = (h: HTMLElement) => { h.style.transform = ""; h.classList.remove("ef-lane-flown"); };
    if (!availableSet || selected.size === 0) {
      cards.forEach(reset); headers.forEach(resetHeader);
      el.style.minHeight = "";        // the sheet goes back to its own height
      return;
    }
    headers.forEach(resetHeader);
    // Horizontal scroll: keep where the reader was, on every selecting click including
    // the first. The React commit resets the scroller to the left, which throws the view
    // while someone is reading across it - so restore the position captured at click time.
    //
    // The first click used to be exempt, to reveal the re-laid tree from its start. That
    // only holds if the tree then fits, and it does not: measured on the sample at 1280
    // and 1680 px, the lanes still overflow by 1052 and 652 px after the click. Snapping
    // to 0 therefore did not show the whole tree, it only moved the reader away from the
    // node they had just clicked. (harness/flow-scroll.mjs)
    const scroller = el.parentElement;
    // THE VIEW MOVES TO THE TREE, THE TREE DOES NOT MOVE TO THE VIEW. Selecting used to try
    // to carry the reader's horizontal scroll across the re-render, and that is where this
    // view kept breaking: the offset had to be remembered somewhere (it was captured on
    // pointer-down, so a wheel scroll was missed - 1331 snapped back to 430), restored
    // against a sheet that changes width for a few frames, and agreed with by a tree placed
    // with transforms, which do not move the scrollable area at all. Six defects came out of
    // those three facts. The tree now has a fixed place in the sheet and the view is scrolled
    // so the clicked card sits in the middle of it.
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
    // The scroller is OUTSIDE the zoomed element, so its client box is real pixels while
    // the cards are laid out in unzoomed ones. Everything below works in card space.
    const vGap = 44, colW = 200, colGap = 58;
    // The viewport this flight has to aim at is the one AFTER the dock has opened, not the
    // one it is measured in. The dock is added in the same commit and rises over 0.32s, so
    // the scroller here is still at its full height and the tree was aimed 186px too low -
    // then corrected in one late jump once the dock settled. Its final height is knowable
    // rather than guessable: the animation ends at max-height 40vh, so the dock will be as
    // tall as its content or 40vh, whichever is less.
    const dock = el.closest(".diagram-dock-layout")?.querySelector<HTMLElement>(".detail-dock") ?? null;
    // How tall the scroller will be once the dock has finished rising. Both the placement
    // and the correction below ask this, so neither is answering a question whose answer is
    // still moving - once the dock stands, the prediction IS the live value and a real
    // window drag behaves exactly as before.
    const settledH = () => {
      const live = scroller ? scroller.clientHeight : el.clientHeight;
      if (!dock) return live;
      const grow = Math.min(dock.scrollHeight, window.innerHeight * 0.4) - dock.getBoundingClientRect().height;
      return live - Math.max(0, grow);
    };
    // Everything from here is what a ZOOM needs again and nothing else. A zoom does not
    // change which cards fly or where their lanes are; it changes where the browser has put
    // them, because `zoom` is a layout scale and the text inside the cards rebreaks. Running
    // the whole effect for that cost 4.7-10.5ms per notch on a 16.7ms budget - re-querying
    // the sheet, resetting sixty-two cards, rebuilding the observer, all to move twenty-six.
    // So the placement is kept as a function and a zoom calls just this.
    // Three reasons to place the tree, and they differ in exactly two ways: whether the
    // horizontal anchor is recomputed, and whether the move is animated.
    //   "select"   a new selection - centred in the reader's window, and it flies there
    //   "zoom"     the ground rescaled under it - same anchor, no animation, no re-centring
    //   "rescroll" the reachable offset moved while the sheet settled - new anchor, no
    //              animation, because there is nothing to show
    const place = (why: "select" | "zoom" | "rescroll") => {
    const fromZoom = why !== "select";
    const moving = lanesSorted.flatMap((li) => byLane.get(li)!);
    // A correction of a few pixels has nothing to show, so a zoom re-places without the
    // 0.55s transition; a selection keeps it, because that flight is the point.
    if (fromZoom) for (const c of moving) c.style.transition = "none";
    const z = appliedZoom(el);
    const viewW = (scroller ? scroller.clientWidth : el.clientWidth) / z;
    const viewH = settledH() / z;
    // EVERY MEASUREMENT FIRST, THEN EVERY WRITE. The placement used to read a card's offsets
    // and write its transform in the same turn of the loop, and a style write invalidates
    // the layout the next read needs - twenty-six cards meant twenty-six forced layouts of
    // a sheet the browser had just re-laid for the zoom. Measured while zooming with a
    // selection: p95 32.6ms, four frames of sixty-nine over 32ms. Reading in one pass and
    // writing in another leaves the browser one layout to do.
    const M = new Map<HTMLElement, { w: number; h: number; l: number; t: number }>();
    for (const c of moving) M.set(c, { w: c.offsetWidth, h: c.offsetHeight, l: c.offsetLeft, t: c.offsetTop });
    const laneHeads = new Map<number, { el: HTMLElement; w: number; l: number; h: number }>();
    for (const li of byLane.keys()) {
      const laneKey = tax.entityTypes[li]?.key;
      const h = laneKey ? el.querySelector<HTMLElement>(`.lane-header[data-lane="${CSS.escape(laneKey)}"]`) : null;
      if (h) laneHeads.set(li, { el: h, w: h.offsetWidth, l: h.offsetLeft, h: h.offsetHeight });
    }
    const colHeight = (g: HTMLElement[]) => g.reduce((s, c) => s + M.get(c)!.h + vGap, -vGap);
    // Build the flown tree centred on the CURRENT viewport, and - when a node is
    // focused - shift it vertically so that node lands on the viewport's vertical
    // centre. The scroller only scrolls horizontally, so a tree placed at the
    // cards' natural top can fly off-screen with no way to scroll to it; anchoring
    // it to the viewport centre here keeps the clicked node (and its tree) in view.
    // viewMidY is the viewport centre expressed in the cards' offsetTop space
    // (offsetParent = .flow-lanes), i.e. corrected by the lane container's offset.
    const laneOffset = scroller ? (el.getBoundingClientRect().top - scroller.getBoundingClientRect().top) / z : 0;
    const viewMidY = viewH / 2 - laneOffset;
    // THE CARD THAT WAS CLICKED DOES NOT MOVE. The tree used to be hung on the viewport's
    // centre, which meant the clicked card travelled to get there - measured on the sample,
    // 124px at zoom 1 and, because the tree is laid out in card space and so grows on screen
    // with the zoom while the viewport does not, 215px in the median at 1.6. That travel is
    // what reads as the view snapping away under the click. Anchoring on the clicked card
    // instead costs nothing in reachability: it is the one card that is certainly on screen,
    // because the reader just pointed at it.
    // Where the clicked card is ON SCREEN, expressed in card space. That is the anchor the
    // reader can see: entering highlight mode collapses the sheet - measured, it then fits
    // the viewport entirely and the horizontal scroll has nowhere to go but 0 - so an anchor
    // written in layout coordinates moves under them anyway. This one does not.
    const seen = (c: HTMLElement) => {
      if (!scroller) return null;
      const r = c.getBoundingClientRect(), sr = scroller.getBoundingClientRect();
      return { x: (r.left - sr.left) / z, y: (r.top - sr.top) / z + scroller.scrollTop / z };
    };
    let centerY = viewMidY;
    let focusSeen: { x: number; y: number } | null = null;
    if (focused && availableSet.has(focused)) {
      const fgroup = byLane.get(laneIndexOf(focused));
      const fidx = fgroup ? fgroup.findIndex((c) => c.dataset.nk === focused) : -1;
      if (fgroup && fidx >= 0) {
        const fc = fgroup[fidx], fm = M.get(fc)!;
        focusSeen = seen(fc);
        let prefix = 0; for (let j = 0; j < fidx; j++) prefix += M.get(fgroup[j])!.h + vGap;
        const wantTop = focusSeen ? focusSeen.y : fm.t;
        centerY = wantTop + colHeight(fgroup) / 2 - prefix;
        // Unless it would leave the card outside the viewport it has to stay visible in -
        // the dock takes the lower part of it, and a card sitting there would be covered.
        const onScreen = wantTop - (scroller ? scroller.scrollTop / z : 0), lo = 8, hi = viewH - fm.h - 8;
        if (hi > lo) centerY += Math.min(hi, Math.max(lo, onScreen)) - onScreen;
      }
    }
    // NOTHING SITS UNDER THE LANE HEADINGS. They are sticky at the top of the scroller, so
    // they stay put while the tree is placed around them - a column whose first card is
    // higher than the heading is drawn behind it and cannot be read. The whole tree is
    // pushed down by however much the topmost card falls short, which keeps the columns
    // aligned with each other; nudging one column would break the rows.
    // THE CEILING. Nothing in the flown tree may be drawn above this line, and it is not a
    // correction applied afterwards but the floor every column starts from - because a
    // transform does not grow the scrollable area, so anything pushed above the top edge is
    // not merely hidden behind the sticky headings, it is UNREACHABLE. Measured from the
    // headings' real lower edge (offsetHeight is 5px short of it - the lane body's padding)
    // and kept in screen pixels, since 20 card pixels read as 7 at zoom 0.35 and 32 at 1.6.
    const ceiling = 8;          // a top margin in the SHEET, independent of where the view is
    // ROOM ABOVE THE TREE, so that centring the clicked card is actually reachable. The view
    // can only scroll to what exists: with the tree hard against the top of the sheet, a card
    // in its first rows cannot be brought to the middle and lands 73-154px above it. Half a
    // viewport of margin costs nothing but empty sheet, and makes the rule hold.
    if (focused && availableSet.has(focused)) {
      const fgroup = byLane.get(laneIndexOf(focused));
      const fidx = fgroup ? fgroup.findIndex((c) => c.dataset.nk === focused) : -1;
      if (fgroup && fidx >= 0) {
        let prefix = 0; for (let j = 0; j < fidx; j++) prefix += M.get(fgroup[j])!.h + vGap;
        const fh = M.get(fgroup[fidx])!.h;
        const focusTop = centerY - colHeight(fgroup) / 2 + prefix;
        const wanted = (viewH - fh) / 2;
        if (focusTop < wanted) centerY += wanted - focusTop;
      }
    }
    const totalW = lanesSorted.length * colW + (lanesSorted.length - 1) * colGap;
    // WHERE the tree sits is decided once, when it is selected. A zoom must not decide it
    // again: viewW and viewH are the viewport IN CARD SPACE, so they shrink as the zoom
    // grows - at high zoom the centring ran into the `8` floor and the whole tree jumped to
    // the left and up. The re-place exists to follow the reflow, nothing else, so it keeps
    // the anchor it was given and only recomputes the offsets underneath it.
    // Centred in what the reader is LOOKING AT, not in the sheet. Laying the tree out from
    // the sheet's left edge put it off-screen for anyone scrolled to the right - and then
    // the browser scrolled the focused card back into view, which drags the whole sheet
    // sideways: measured at high zoom, scrollLeft 326 → 0 in the frame after the click,
    // and held there. That is the same rule as the vertical anchor, on the other axis.
    // The REMEMBERED scroll, not the live one: the React commit has already reset the
    // scroller to the left by the time this runs, which is why that value is captured on
    // pointer-down in the first place. A zoom does not go through a commit like that, so
    // there the live value is the true one.
    const scrollX = 0;
    // Centred in the window the reader is looking THROUGH - the same clamped offset the
    // scroll is restored to, so the two cannot disagree. Hanging it on the clicked card's
    // own column instead was tried and measured: with several columns to its left the
    // column runs off the sheet, the clamp pulls it back, and the card lands a few pixels
    // outside the viewport - at which point the browser scrolls the focused button into
    // view and drags the whole sheet with it (326 → 0 in one frame).
    // ROOM TO THE LEFT, for the same reason as the room above: the view can only scroll to
    // what exists. Measured with the tree hard against the left edge, centring the clicked
    // card wanted scrollLeft 660 where the sheet offered 536, and it came to rest 212px off.
    // Half a window of margin makes it reachable - bounded so the tree still ends inside the
    // sheet, since a transform does not widen it.
    const focusCol = focused ? lanesSorted.indexOf(laneIndexOf(focused)) : -1;
    const room = Math.max(0, (viewW - colW) / 2 - (focusCol > 0 ? focusCol * (colW + colGap) : 0));
    const sheetW = el.offsetWidth;
    const startX = why === "zoom" && anchoredRef.current ? anchoredRef.current.startX
      : Math.min(Math.max(8, scrollX + Math.max(8, (viewW - totalW) / 2) + room),
                 Math.max(8, sheetW - totalW - 8));
    if (why === "zoom" && anchoredRef.current) centerY = anchoredRef.current.centerY;
    else anchoredRef.current = { startX, centerY };
    const flown: { c: HTMLElement; dx: number; dy: number }[] = [];
    lanesSorted.forEach((li, idx) => {
      const group = byLane.get(li)!;
      const colX = startX + idx * (colW + colGap);
      // The lane header flies to sit centred above its (relocated) column.
      const h = laneHeads.get(li);
      if (h) {
        h.el.style.transform = `translateX(${(colX + (colW - h.w) / 2 - h.l).toFixed(1)}px)`;
        h.el.classList.add("ef-lane-flown");
      }
      let cy = Math.max(centerY - colHeight(group) / 2, ceiling);
      for (const c of group) {
        const m = M.get(c)!;
        const dx = colX + (colW - m.w) / 2 - m.l;
        const dy = cy - m.t;
        // A card only FLIES if the flight fits on the screen. Zoomed out, the sheet holds
        // the cards far apart and the tree gathers them from all of it: a card at the far
        // edge would sweep right across the view, which reads as the whole thing being
        // thrown about rather than as one arrangement forming. Past the visible window the
        // card is simply drawn in its place. The threshold is the window itself, so it
        // follows the zoom without a second number to keep in step.
        const far = Math.abs(dx) > viewW || Math.abs(dy) > viewH;
        if (far) c.style.transition = "none";
        c.style.transform = `translate(${dx}px, ${dy}px) scale(1.05)`;
        if (far) { void c.offsetHeight; c.style.transition = ""; }
        c.style.animationDelay = `${((m.t % 700) / 700).toFixed(2)}s`;
        c.classList.add("ef-floating");
        flown.push({ c, dx, dy });
        cy += m.h + vGap;
      }
    });
    cur = { flown, M };
    // THE SHEET GROWS TO HOLD THE TREE. A transform does not extend the scrollable area, so a
    // column that reaches past the content's own height hangs where no scrolling can follow -
    // measured at zoom 0.35, six cards overhanging by up to 406px. The ceiling keeps the top
    // inside; this keeps the bottom inside, by making the container as tall as what it is
    // showing. Layout, not a transform, so the scroll range really does grow.
    {
      const low = flown.reduce((m, g) => Math.max(m, g.dy + M.get(g.c)!.t + M.get(g.c)!.h), 0);
      el.style.minHeight = low > 0 ? `${Math.ceil(low + 24)}px` : "";
    }
    // The transition comes back once the corrected transforms are in place. Restoring it in
    // the same frame would let the browser animate them after all.
    if (fromZoom) requestAnimationFrame(() => { for (const c of moving) c.style.transition = ""; });
    };
    let cur: { flown: { c: HTMLElement; dx: number; dy: number }[]; M: Map<HTMLElement, { w: number; h: number; l: number; t: number }> } = { flown: [], M: new Map() };
    placeRef.current = place;
    place("select");
    // THE CLICKED CARD LANDS IN THE MIDDLE. Done by scrolling, which is the honest way: it
    // moves the view, the browser clamps it to what exists, and the arrangement is left
    // alone. Shifting every card by a delta instead - which is what this did - moves things
    // to where the scroll cannot follow, because a transform does not grow the scrollable
    // area. The headings stay stuck to the top edge, so the card is nudged clear of them.
    const centreOnFocus = () => {
      if (!scroller || !focused) return;
      const g = cur.flown.find((x) => x.c.dataset.nk === focused);
      if (!g || !g.c.isConnected || !scroller.isConnected) return;
      const r = g.c.getBoundingClientRect(), sr = scroller.getBoundingClientRect();
      const wantX = scroller.scrollLeft + (r.left - sr.left) - (scroller.clientWidth - r.width) / 2;
      let wantY = scroller.scrollTop + (r.top - sr.top) - (scroller.clientHeight - r.height) / 2;
      const heads = Array.from(el.querySelectorAll<HTMLElement>(".lane-header[data-lane]"));
      const hb = heads.length ? Math.max(...heads.map((h) => h.getBoundingClientRect().bottom)) - sr.top : 0;
      const topAfter = (r.top - sr.top) - (wantY - scroller.scrollTop);
      if (topAfter < hb + 14) wantY -= (hb + 14) - topAfter;
      scroller.scrollLeft = Math.max(0, wantX);
      scroller.scrollTop = Math.max(0, wantY);
    };
    centreOnFocus();
    // ...and once more when the sheet has settled its width. The call is idempotent - it
    // computes an absolute target, so a second one either changes nothing or finishes the
    // job the first could not, because the sheet was momentarily narrower.
    centerRafRef.current = requestAnimationFrame(() => requestAnimationFrame(centreOnFocus));
    // After a zoom the view stays where the pointer put it - re-centring there would fight
    // the wheel's own anchor. It only has to be nudged far enough that the clicked card is
    // not left behind the headings: measured at 106px under them before this.
    clearRef.current = () => {
      if (!scroller || !focused) return;
      const g = cur.flown.find((x) => x.c.dataset.nk === focused);
      if (!g || !g.c.isConnected) return;
      const r = g.c.getBoundingClientRect(), sr = scroller.getBoundingClientRect();
      const heads = Array.from(el.querySelectorAll<HTMLElement>(".lane-header[data-lane]"));
      const hb = heads.length ? Math.max(...heads.map((h) => h.getBoundingClientRect().bottom)) - sr.top : 0;
      const top = r.top - sr.top, bottom = r.bottom - sr.top;
      if (top < hb + 14) scroller.scrollTop = Math.max(0, scroller.scrollTop - ((hb + 14) - top));
      else if (bottom > scroller.clientHeight - 8) scroller.scrollTop += bottom - (scroller.clientHeight - 8);
    };
    if (scroller && focused) {
      // The dock rises under the view and the window can be dragged; both change how much
      // there is to see, so the card is put back in the middle of it.
      const ro = new ResizeObserver(() => centreOnFocus());
      ro.observe(scroller);
      roRef.current = ro;
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableSet, selected, study.entities]);

  // A zoom moves the ground the flown tree stands on, so the tree is placed again - only
  // the placement, none of the work around it.
  useLayoutEffect(() => { placeRef.current?.("zoom"); clearRef.current?.(); }, [zoom]);

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
    // The scroll position was captured on pointer-down, before the browser moved it.
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
        {zoom !== 1 && (
          <button className="btn ghost sm" onClick={() => { zoomRef.current = 1; setZoom(1); }}
            title="Back to 100% — the wheel zooms, dragging the background pans">{Math.round(zoom * 100)}%</button>
        )}
        {selected.size > 0 && <button className="btn sm" onClick={() => { setSelected(new Set()); setFocused(null); }}>Clear ({selected.size})</button>}
      </div>
      {/* Where the reader is, captured before the click and not during it: pressing a
          node focuses it, and the browser scrolls a focused element into view - so a
          position read inside the click handler is already the browser's, not theirs. */}
      <div className="flow-scroll" ref={scrollRef} onPointerDownCapture={(e) => { scrollLeftRef.current = e.currentTarget.scrollLeft; }}
        onPointerDown={(e) => {
          // Drag the background to pan. A card handles its own pointer events, so a drag
          // that starts on one is a click on that card, not a pan.
          if (e.button !== 0 || (e.target as HTMLElement).closest("[data-nk], .lane-header, button")) return;
          const sc = e.currentTarget;
          panRef.current = { x: e.clientX, y: e.clientY, left: sc.scrollLeft, top: sc.scrollTop };
          sc.setPointerCapture(e.pointerId);
          sc.classList.add("panning");
        }}
        onPointerMove={(e) => {
          const p = panRef.current; if (!p) return;
          const sc = e.currentTarget;
          sc.scrollLeft = p.left - (e.clientX - p.x);
          sc.scrollTop = p.top - (e.clientY - p.y);
        }}
        onPointerUp={(e) => {
          if (!panRef.current) return;
          panRef.current = null;
          e.currentTarget.classList.remove("panning");
        }}>
        <div className="flow-topmask" aria-hidden />
        <div className={"flow-lanes" + (zoom === 1 ? " ef-fly" : "")} ref={lanesRef} style={{ zoom }}>
          {activeRibbons.length > 0 && (
            <svg ref={ribbonSvgRef} className="ribbons" preserveAspectRatio="none">
              {activeRibbons.map((r) => (
                <path key={r.key} data-ribbon={r.key} fill="none" stroke={r.color} strokeWidth={1.1} strokeOpacity={0.75} strokeLinecap="round" />
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
