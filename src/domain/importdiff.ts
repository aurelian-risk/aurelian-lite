// Diff an incoming bundle's studies against the current ones, so an import can be
// reviewed (added / changed / removed entities, with per-field changes) before it
// is applied. Deterministic and offline; matching is by entity id.
import type { EntityRecord, FieldChange, FieldValue, Study, Taxonomy } from "./types";
import { getType, recordTitle } from "./taxonomy";
import { appendChange, diffValues } from "./audit";

export interface FieldDelta { field: string; label: string; from: FieldValue; to: FieldValue }
export interface LastChange { ts: string; editor: string; comment?: string }
export interface EntityDiff { id: string; type: string; typeLabel: string; label: string; kind: "added" | "changed" | "removed"; fields?: FieldDelta[]; last?: LastChange }
export interface StudyDiff { id: string; name: string; isNew: boolean; added: EntityDiff[]; changed: EntityDiff[]; removed: EntityDiff[] }

export function diffBundle(tax: Taxonomy, current: Study[], incoming: Study[]): StudyDiff[] {
  const curById = new Map(current.map((s) => [s.id, s]));
  const typeLabel = (t: string) => getType(tax, t)?.label ?? t;
  const flabel = (t: string, k: string) => getType(tax, t)?.fields.find((f) => f.key === k)?.label ?? k;
  const elabel = (e: EntityRecord) => { const t = getType(tax, e.type); return t ? recordTitle(t, e) : e.id; };
  const lastOf = (e: EntityRecord): LastChange | undefined => {
    const h = e.history?.[e.history.length - 1];
    return h ? { ts: h.ts, editor: h.editor, comment: h.comment } : undefined;
  };
  const mk = (e: EntityRecord, kind: EntityDiff["kind"], fields?: FieldDelta[]): EntityDiff =>
    ({ id: e.id, type: e.type, typeLabel: typeLabel(e.type), label: elabel(e), kind, fields, last: lastOf(e) });

  return incoming.map((inc) => {
    const cur = curById.get(inc.id);
    const added: EntityDiff[] = [], changed: EntityDiff[] = [], removed: EntityDiff[] = [];
    if (!cur) {
      for (const e of inc.entities) added.push(mk(e, "added"));
      return { id: inc.id, name: inc.name, isNew: true, added, changed, removed };
    }
    const curEnts = new Map(cur.entities.map((e) => [e.id, e]));
    for (const e of inc.entities) {
      const c = curEnts.get(e.id);
      if (!c) { added.push(mk(e, "added")); continue; }
      const fd = diffValues(c.values, e.values);
      if (fd.length) changed.push(mk(e, "changed", fd.map((x) => ({ ...x, label: flabel(e.type, x.field) }))));
    }
    const incIds = new Set(inc.entities.map((e) => e.id));
    for (const e of cur.entities) if (!incIds.has(e.id)) removed.push(mk(e, "removed"));
    return { id: inc.id, name: inc.name, isNew: false, added, changed, removed };
  });
}

export const diffTotals = (d: StudyDiff[]) => d.reduce(
  (a, s) => ({ added: a.added + s.added.length, changed: a.changed + s.changed.length, removed: a.removed + s.removed.length }),
  { added: 0, changed: 0, removed: 0 });

/** A modified copy of a study — for demoing the import diff without hand-editing a
 *  file: it changes a couple of entities, adds one, and removes one. */
export function demoRevision(study: Study): Study {
  const ts = new Date().toISOString();
  const ents = study.entities.map((e) => ({ ...e, values: { ...e.values } }));
  const notes = ["Adjusted after peer review.", "Refined wording following the workshop."];
  let n = 0;
  for (const e of ents) {
    if (n >= 2) break;
    const numKey = Object.keys(e.values).find((k) => typeof e.values[k] === "number");
    let change: FieldChange | null = null;
    if (numKey) { const v = e.values[numKey] as number, nv = v > 1 ? v - 1 : v + 1; e.values[numKey] = nv; change = { field: numKey, from: v, to: nv }; }
    else if (typeof e.values.description === "string") { const from = e.values.description as string, to = from + " (updated by a colleague)"; e.values.description = to; change = { field: "description", from, to }; }
    if (change) { e.history = appendChange(e.history, { editor: "Analyst B", kind: "update", ts, changes: [change], comment: notes[n] }); n++; }
  }
  const first = ents[0];
  if (first) ents.push({ ...first, id: "demo-" + Math.random().toString(36).slice(2, 10), source: undefined,
    values: { ...first.values, name: String(first.values.name ?? "Item") + " (added by a colleague)" },
    history: appendChange(undefined, { editor: "Analyst B", kind: "create", ts, comment: "New item proposed by a colleague." }) });
  if (ents.length > 3) ents.splice(ents.length - 2, 1);   // remove one original (not the just-added copy)
  return { ...study, entities: ents };
}
