// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// The pictures of the STIX import that are not the columns: the bundle's facts, the
// workshop strip, and the landing, where the chosen records are shown in the study's
// terms. The mechanics live in domain/stix.ts and StixImport.tsx; these only draw.
import { useMemo, useState } from "react";
import { t as tr, tn } from "../domain/i18n";
import type { Study, Taxonomy } from "../domain/types";
import { getType, groupLabel, recordTitle, typeLabel } from "../domain/taxonomy";
import { weave, hops, labelOf, extId, tacticsOf, type StixIndex, type Projected, type Touch, type StixRule } from "../domain/stix";
import { TACTICS } from "../domain/mitre";

/** The colour of the workshop a STIX type lands in; unmapped types are grey. */
export function colourOf(tax: Taxonomy, rule: StixRule | undefined): string {
  const t = rule && getType(tax, rule.entityType);
  return (t && tax.groups.find((g) => g.key === t.group)?.color) || "var(--fg-subtle)";
}

// ── the bundle's facts, for the panel on the ring ─────────────────────────────

export function BundleFacts({ ix }: { ix: StixIndex }) {
  const facts = useMemo(() => {
    const dates: string[] = []; const sectors = new Set<string>(); let author = "";
    for (const o of ix.objects.values()) {
      for (const k of ["first_seen", "last_seen", "published", "valid_from"]) if (typeof o[k] === "string") dates.push(String(o[k]).slice(0, 10));
      if (o.type === "identity") for (const s of (o.sectors as string[]) ?? []) sectors.add(s);
    }
    const by = new Map<string, number>();
    for (const o of ix.objects.values()) if (typeof o.created_by_ref === "string") by.set(o.created_by_ref, (by.get(o.created_by_ref) ?? 0) + 1);
    const top = [...by.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) author = ix.objects.get(top[0])?.name ?? "";
    const marks = [...ix.objects.values()].filter((o) => o.type === "marking-definition").map((o) => o.name ?? String(o.definition_type)).filter(Boolean);
    dates.sort();
    const rels = [...ix.edges.values()].reduce((n, l) => n + l.filter((e) => e.dir === "out").length, 0);
    return { span: dates.length ? `${dates[0]} → ${dates[dates.length - 1]}` : "", sectors: [...sectors], author, marks, rels };
  }, [ix]);
  return (
    <div className="stix-facts">
      {facts.span && <span><b>{tr("ui.stix.fact-when", "When")}</b> {facts.span}</span>}
      {facts.sectors.length > 0 && <span><b>{tr("ui.stix.fact-sectors", "Sectors")}</b> {facts.sectors.join(", ")}</span>}
      {facts.author && <span><b>{tr("ui.stix.fact-author", "Author")}</b> {facts.author}</span>}
      {facts.marks.length > 0 && <span><b>{tr("ui.stix.fact-marking", "Marking")}</b> {facts.marks.join(", ")}</span>}
      <span><b>{tr("ui.stix.fact-edges", "Relationships")}</b> {facts.rels}</span>
    </div>
  );
}

// ── the landing: workshops, the chain as lanes, and what is touched ────────────

export function WorkshopStrip({ tax, study, records, onlyGaining }: { tax: Taxonomy; study: Study; records: Projected[]; onlyGaining?: boolean }) {
  const byGroup = new Map<string, number>();
  for (const r of records) { const g = getType(tax, r.type)?.group; if (g) byGroup.set(g, (byGroup.get(g) ?? 0) + 1); }
  const have = new Map<string, number>();
  for (const e of study.entities) { const g = getType(tax, e.type)?.group; if (g) have.set(g, (have.get(g) ?? 0) + 1); }
  // In the tray only the workshops that gain something, as they come: a row of six cells
  // with dashes in five of them said nothing and took the room.
  if (onlyGaining) return (
    <span className="stix-ws-inline">
      {tax.groups.filter((g) => (byGroup.get(g.key) ?? 0) > 0).map((g) => (
        <span key={g.key} className="stix-ws-pill" style={{ ["--ws-color" as string]: g.color }} title={`${groupLabel(g)}: ${have.get(g.key) ?? 0} ${tr("ui.stix.ws-have", "there")}`}>
          {groupLabel(g)} <b>+{byGroup.get(g.key)}</b>
        </span>
      ))}
    </span>
  );
  return (
    <div className="stix-ws">
      {tax.groups.filter((g) => g.key !== "quant").map((g) => {
        const add = byGroup.get(g.key) ?? 0;
        const there = have.get(g.key) ?? 0;
        return (
          <div key={g.key} className={"stix-ws-cell" + (add ? " on" : "")} style={{ ["--ws-color" as string]: g.color }}
            title={`${groupLabel(g)}: ${add ? tn("ui.stix.ws-new", add, "{0} new record from this import", "{0} new records from this import") : tr("ui.stix.ws-nothing", "nothing from this import")} · ${tn("ui.stix.ws-there", there, "{0} record already in the study", "{0} records already in the study")}`}>
            <span className="stix-ws-label">{groupLabel(g)}</span>
            <span className="stix-ws-add">{add ? `+${add} ${tr("ui.stix.ws-new-word", "new")}` : "—"}</span>
            <span className="stix-ws-have">{there} {tr("ui.stix.ws-there-word", "there")}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Landing({ tax, study, records, touchList, resolve, setResolve, dropped, toggleDrop, lanesOnly, touchesOnly }: {
  tax: Taxonomy; study: Study; records: Projected[]; touchList: Touch[];
  resolve: Record<string, string>; setResolve: (recordId: string, existingId: string) => void;
  dropped: Set<string>; toggleDrop: (id: string) => void; lanesOnly?: boolean; touchesOnly?: boolean;
}) {
  const steps = records.filter((r) => r.type === "kill_chain_step");
  const lanes = getType(tax, "kill_chain_step")?.fields.find((f) => f.key === "tactic")?.options ?? [...TACTICS];
  const titleOf = (id: string) => { const e = study.entities.find((x) => x.id === id); const t = e && getType(tax, e.type); return e && t ? recordTitle(t, e) : id; };
  return (
    <div className="stix-landing">
      {steps.length > 0 && !touchesOnly && (() => {
        // The chain as a sequence, not as fifteen lanes: only the tactics that hold a
        // step, in matrix order, each a card wide enough to read; the tactics skipped
        // between two cards are a small connector that names them on hover.
        const used = lanes.filter((tac) => steps.some((s) => s.values.tactic === tac));
        const ordered = [...steps].sort((a, b) => Number(a.values.step_order ?? 0) - Number(b.values.step_order ?? 0));
        return (
          <div className="stix-chain" title={tr("ui.stix.lanes-title", "The chain these steps make, in tactic order - press a step to leave it out")}>
            {used.map((tac, i) => {
              const prev = i ? lanes.indexOf(used[i - 1]) : -1, here = lanes.indexOf(tac);
              const skipped = lanes.slice(prev + 1, here);
              return (
                <div key={tac} className="stix-chain-seg">
                  {i > 0 && (
                    <div className={"stix-chain-link" + (skipped.length ? " skip" : "")} title={skipped.length ? `${tr("ui.stix.skipped", "no step under")}: ${skipped.join(", ")}` : ""}>
                      {skipped.length ? `⋯ ${skipped.length} ⋯` : "→"}
                    </div>
                  )}
                  <div className="stix-chain-card">
                    <div className="stix-chain-head">{tac}</div>
                    {ordered.filter((s) => s.values.tactic === tac).map((s) => (
                      <button key={s.id} className={"stix-chain-step" + (dropped.has(s.id) ? " off" : "")} onClick={() => toggleDrop(s.id)} title={dropped.has(s.id) ? tr("ui.stix.step-back-in", "left out - press to take it back in") : tr("ui.stix.step-leave-out", "press to leave it out")}>
                      <span className="stix-chain-n">{String(s.values.step_order ?? "")}</span>
                      <span className="stix-chain-name">{String(s.values.name ?? "")}</span>
                      <span className="mono stix-chain-id">{String(s.values.technique ?? "").split(" ")[0]}</span>
                    </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}
      {touchList.length > 0 && !lanesOnly && (
        <div className="stix-touches">
          {touchList.map((t) => {
            const rec = records.find((r) => r.id === t.recordId); if (!rec || dropped.has(rec.id)) return null;
            const rt = getType(tax, rec.type)!;
            return (
              <div key={t.recordId + t.existing.id} className="stix-touch">
                <span><b>{String(rec.values.name ?? "")}</b> <span className="stix-rec-type">{typeLabel(rt)}</span> — {tr("ui.stix.touch-existing", "existing")} <b>{titleOf(t.existing.id)}</b> {t.why}</span>
                {t.kind === "same-name" ? (
                  <span className="stix-touch-choice">
                    <label><input type="radio" name={"res-" + t.recordId} checked={!resolve[t.recordId]} onChange={() => setResolve(t.recordId, "")} /> {tr("ui.stix.create-beside", "create beside it")}</label>
                    <label><input type="radio" name={"res-" + t.recordId} checked={resolve[t.recordId] === t.existing.id} onChange={() => setResolve(t.recordId, t.existing.id)} /> {tr("ui.stix.update-existing", "update the existing record")}</label>
                  </span>
                ) : <span className="menu-hint">{tr("ui.stix.touch-info", "noted; both are kept")}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── the chosen objects, as the bundle connects them ───────────────────────────

/** The chosen objects drawn by what the bundle says about them: one row per connected
 *  component, its objects in reading order - actors and campaigns first, then steps in
 *  tactic order, then measures - and the relationships between them as arcs above the
 *  row, named. A component of one stands in its own row, marked disjoint: the bundle
 *  connects it to nothing else chosen. That is the picture to check before importing a
 *  selection as if it belonged together. */
export function Weave({ ix, tax, ids, ruleFor }: { ix: StixIndex; tax: Taxonomy; ids: string[]; ruleFor: (t: string) => StixRule | undefined }) {
  const w = useMemo(() => weave(ix, ids), [ix, ids]);
  // Layers, left to right: who acts, in what campaign, by which techniques (in tactic
  // order, top to bottom), against which mitigations - and whatever else was chosen.
  const layerOf = (id: string) => {
    const t = ix.objects.get(id)!.type;
    return ["threat-actor", "intrusion-set"].includes(t) ? 0 : t === "campaign" ? 1 : t === "attack-pattern" ? 2 : t === "course-of-action" ? 3 : 4;
  };
  const within = (id: string) => {
    const o = ix.objects.get(id)!;
    return o.type === "attack-pattern" ? Math.max(0, TACTICS.indexOf(tacticsOf(o)[0])) * 1000 + labelOf(o).charCodeAt(0) : labelOf(o).toLowerCase().charCodeAt(0);
  };
  const BW = 200, BH = 36, GX = 100, GY = 10, PAD = 16, HEAD = 22, LANES = 26;
  const layout = useMemo(() => {
    const pos = new Map<string, { x: number; y: number }>();
    const blocks: { y0: number; y1: number; ids: string[]; disjoint: boolean }[] = [];
    let y = PAD;
    for (const c of w.components) {
      const layers = new Map<number, string[]>();
      for (const id of c) { const l = layerOf(id); const arr = layers.get(l) ?? []; arr.push(id); layers.set(l, arr); }
      const used = [...layers.keys()].sort((a, b) => a - b);
      const tallest = Math.max(...used.map((l) => layers.get(l)!.length));
      const blockH = tallest * (BH + GY) - GY;
      used.forEach((l, li) => {
        const arr = layers.get(l)!.sort((a, b) => within(a) - within(b));
        const h = arr.length * (BH + GY) - GY;
        arr.forEach((id, i) => pos.set(id, { x: PAD + li * (BW + GX), y: y + (blockH - h) / 2 + i * (BH + GY) }));
      });
      blocks.push({ y0: y, y1: y + blockH, ids: c, disjoint: c.length === 1 });
      y += blockH + HEAD + 8 + LANES;
    }
    const layersMax = Math.max(1, ...w.components.map((c) => new Set(c.map(layerOf)).size));
    return { pos, blocks, W: PAD * 2 + layersMax * BW + (layersMax - 1) * GX, H: y - HEAD };
  }, [w, ix]);   // eslint-disable-line react-hooks/exhaustive-deps
  const disjoint = w.components.filter((c) => c.length === 1).length;
  /** The box pressed: its card and its connections are shown under the picture, its
   *  edges lit, the others faded. */
  const [focus, setFocus] = useState<string | null>(null);
  const touching = (e: { from: string; to: string }) => !focus || e.from === focus || e.to === focus;
  const card = useMemo(() => {
    if (!focus) return null;
    const o = ix.objects.get(focus)!;
    const inSet = w.edges.filter((e) => e.from === focus || e.to === focus);
    const chosen = new Set(ids);
    // What the bundle knows beyond the selection: the same groups, minus what is chosen.
    const groups = hops(ix, focus).map((h) => ({ ...h, items: h.items.filter((x) => !chosen.has(x.id)) })).filter((h) => h.items.length);
    return { o, inSet, beyond: groups.reduce((n, h) => n + h.items.length, 0), groups };
  }, [focus, ix, w]);
  return (
    <div className="stix-weave">
      <div className="stix-weave-scroll">
        <svg viewBox={`0 0 ${layout.W} ${layout.H}`} width={layout.W} height={layout.H} className="stix-weave-svg" role="img" aria-label={tr("ui.stix.weave-alt", "The chosen objects and the relationships the bundle records between them")}>
          <defs><marker id="stix-warrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="var(--fg-muted)" /></marker></defs>
          {layout.blocks.map((b, i) => i > 0 && <line key={"sep" + i} x1={PAD} y1={b.y0 - LANES - HEAD / 2 - 4} x2={layout.W - PAD} y2={b.y0 - LANES - HEAD / 2 - 4} stroke="var(--hairline)" strokeDasharray="4 4" />)}
          {w.edges.map((e, i) => {
            const a = layout.pos.get(e.from)!, b = layout.pos.get(e.to)!;
            const la = layerOf(e.from), lb = layerOf(e.to);
            const forward = a.x < b.x, same = a.x === b.x;
            const x1 = same || forward ? a.x + BW : a.x, y1 = a.y + BH / 2;
            const x2 = same ? b.x + BW : forward ? b.x : b.x + BW, y2 = b.y + BH / 2;
            const from = ix.objects.get(e.from)!;
            const block = layout.blocks.find((bl) => bl.ids.includes(e.from))!;
            // A relation that skips a layer would run straight through the boxes in
            // between; it goes over the top of the block instead, in a lane of its own
            // per source, and comes down to its target.
            const skip = Math.abs(lb - la) > 1;
            const lane = block.y0 - 8 - (block.ids.indexOf(e.from) % 4) * 6;
            let d: string;
            if (same) d = `M ${x1} ${y1} C ${x1 + 40} ${y1}, ${x2 + 40} ${y2}, ${x2} ${y2}`;
            else if (skip) {
              const dir = forward ? 1 : -1;
              const xa = x1 + dir * 22, xb = x2 - dir * 22;
              d = `M ${x1} ${y1} C ${xa} ${y1}, ${xa} ${lane}, ${xa + dir * 18} ${lane} L ${xb - dir * 18} ${lane} C ${xb} ${lane}, ${xb} ${y2}, ${x2} ${y2}`;
            } else { const bend = (x2 - x1) / 2; d = `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`; }
            const labelled = w.edges.findIndex((x) => x.from === e.from && x.rel === e.rel) === i;
            // The label sits in the gap between the two boxes, never on one: at the lane
            // for a relation routed over the top, mid-gap otherwise.
            const lx = skip ? x1 + (forward ? 1 : -1) * 48 : same ? x1 + 46 : (x1 + x2) / 2;
            const ly = skip ? lane - 3 : forward || same ? y1 - 5 : y1 + 13;
            const anchor = skip ? (forward ? "start" : "end") : same ? "start" : "middle";
            return (
              <g key={i}>
                <path d={d} fill="none" stroke={colourOf(tax, ruleFor(from.type))} strokeOpacity={touching(e) ? (focus ? 0.9 : 0.6) : 0.12} strokeWidth={touching(e) && focus ? 2.2 : 1.5} markerEnd="url(#stix-warrow)" />
                {labelled && <text x={lx} y={ly} textAnchor={anchor} className="stix-weave-rel" paintOrder="stroke" stroke="var(--bg-panel)" strokeWidth={3}>{e.rel}</text>}
              </g>
            );
          })}
          {[...layout.pos.entries()].map(([id, p], i) => {
            const o = ix.objects.get(id)!;
            const col = colourOf(tax, ruleFor(o.type));
            const sub = o.type === "attack-pattern" ? tacticsOf(o)[0] ?? "" : o.type;
            const alone = layout.blocks.some((b) => b.disjoint && b.ids[0] === id);
            const head = extId(o) ? `${extId(o)} ` : "";
            // Fit by measure, not by count: the id is mono at ~7 px a glyph, the name
            // sans at ~7.3 px at this size; the box has 182 px for both. The clip is the
            // belt to this brace.
            const full = o.name ?? labelOf(o);
            const max = Math.max(4, Math.floor((184 - head.length * 7.0) / 6.9));
            const name = full.length > max ? full.slice(0, max - 1) + "…" : full;
            return (
              <g key={id} transform={`translate(${p.x} ${p.y})`} className={"stix-weave-box" + (focus === id ? " focus" : "")} onClick={() => setFocus((f) => (f === id ? null : id))} style={{ cursor: "pointer" }}>
                <clipPath id={"stix-clip-" + i}><rect width={BW - 10} height={BH} rx={7} /></clipPath>
                <rect width={BW} height={BH} rx={7} fill="var(--bg-panel)" stroke={focus === id ? "var(--fg)" : alone ? "var(--fg-subtle)" : "var(--hairline)"} strokeWidth={focus === id ? 1.8 : 1} strokeDasharray={alone ? "4 3" : undefined}>
                  <title>{labelOf(o)}{alone ? ` · ${tr("ui.stix.disjoint-title", "the bundle connects this to nothing else chosen")}` : ""}</title>
                </rect>
                <rect width={4} height={BH} rx={2} fill={col} />
                <g clipPath={`url(#stix-clip-${i})`}>
                  <text x={12} y={15} className="stix-weave-label"><tspan className="mono">{head}</tspan>{name}</text>
                  <text x={12} y={28} className="stix-weave-sub">{sub}</text>
                </g>
              </g>
            );
          })}
        </svg>
      </div>
      {card && (
        <div className="stix-weave-card">
          <div className="stix-weave-card-head">
            <span className="mono stix-node-type">{card.o.type}</span>
            <strong>{labelOf(card.o)}</strong>
            <span className="stix-becomes">{ruleFor(card.o.type) ? `→ ${typeLabel(getType(tax, ruleFor(card.o.type)!.entityType)!)}` : tr("ui.stix.not-mapped", "not mapped")}</span>
            <button className="btn ghost sm" onClick={() => setFocus(null)} aria-label={tr("ui.ui.close", "Close")}>×</button>
          </div>
          {card.o.description && <p className="stix-desc">{String(card.o.description).slice(0, 320)}{String(card.o.description).length > 320 ? "…" : ""}</p>}
          <div className="stix-weave-rels">
            {card.inSet.length === 0 && <span className="menu-hint">{tr("ui.stix.weave-none", "no relationship to anything else chosen")}</span>}
            {card.inSet.map((e, i) => {
              const out = e.from === focus;
              const other = ix.objects.get(out ? e.to : e.from)!;
              return (
                <button key={i} className="stix-weave-rel-row" onClick={() => setFocus(other.id)} title={tr("ui.stix.click-open", "click: open")}>
                  <span className="mono stix-rel">{out ? `${e.rel} →` : `← ${e.rel}`}</span>
                  <span className="stix-dot" style={{ background: colourOf(tax, ruleFor(other.type)) }} />
                  <span>{labelOf(other)}</span>
                </button>
              );
            })}
          </div>
          {card.beyond > 0 && <p className="menu-hint">{tn("ui.stix.weave-beyond", card.beyond, "+ {0} relationship in the bundle to objects not chosen", "+ {0} relationships in the bundle to objects not chosen").replace("{0}", String(card.beyond))}: {card.groups.map((h) => `${h.dir === "out" ? h.rel + " →" : "← " + h.rel} ${h.type} ${h.items.length}`).join(" · ")}</p>}
        </div>
      )}
      <p className="menu-hint">
        {tn("ui.stix.weave-summary", w.components.length, "{0} connected group", "{0} connected groups").replace("{0}", String(w.components.length))}
        {disjoint ? ` · ${tn("ui.stix.weave-disjoint", disjoint, "{0} object the bundle connects to nothing else chosen", "{0} objects the bundle connects to nothing else chosen").replace("{0}", String(disjoint))}` : ""}
        {` · ${tn("ui.stix.weave-edges", w.edges.length, "{0} relationship", "{0} relationships").replace("{0}", String(w.edges.length))}`}
      </p>
    </div>
  );
}
