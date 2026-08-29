// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Taking a record out of scope, and what that drags with it.
//
// A study is not edited only by adding: half way through, a scenario turns out not to
// apply, or a group of assets leaves the perimeter. Deleting them is the wrong answer -
// the analysis said something about them, and that judgement is part of the record. They
// are SET BACK instead: still there, not in play, ignored by every figure. That mechanism
// already exists per record (see taxonomy.ts, `isSetBack`); what was missing is the
// question this module answers, which is what happens to everything hanging off it.
//
// Three relationships, three different answers:
//
//  · CARRIED. A record that cannot stand without this one - it holds a REQUIRED reference
//    to it - goes with it. An operational scenario without its strategic scenario is not a
//    remainder, it is a fragment. This is recursive: the kill-chain steps go with the
//    operational scenario, and so on down.
//  · BLOCKED. A record that stays in play and points here through a single reference of
//    its own. Nothing dangles technically - a set-back record is still there to point at -
//    but a study that says "this step targets an asset we no longer consider" is saying
//    two things at once. The answer is to refuse and name them, not to fix them silently.
//  · WEAKENED. A record that points here among several - a measure covering six steps, one
//    of which is going. It keeps standing, with one less reason to. It is only carried
//    along when the closure takes its LAST reason: a measure that covers nothing is a
//    measure nobody needs, which is exactly what the analyst meant to express.
//
// Everything here is a QUESTION. Nothing is written; the caller shows the answer and asks.
import type { EntityRecord, Study, Taxonomy } from "./types";
import { getType, isSetBack, refFields, toggleStates } from "./taxonomy";

export interface ScopeChange {
  /** The record asked about, plus everything that cannot stand without it. */
  carried: EntityRecord[];
  /** In play, points here through a single reference, and would be left saying so. */
  blocked: { record: EntityRecord; field: string }[];
  /** In play, points here among others - keeps standing, with one less reason to. */
  weakened: { record: EntityRecord; field: string; left: number }[];
  /** Everything that would have to go with it if the analyst overrules the refusal: the
   *  closure of `carried` AND `blocked`, taken until it stops growing. A record that stands
   *  in the way can be taken out too - it is a judgement about the perimeter, not a
   *  technical impossibility - but then whatever stands in ITS way has to go as well, or
   *  the same contradiction reappears one step further out. Includes the record asked
   *  about; equals `carried` when nothing is in the way. */
  forced: EntityRecord[];
  /** False when the taxonomy has no switch for one of the types involved. */
  possible: boolean;
}

const idsOf = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string")
    : typeof v === "string" && v ? [v] : [];

/** What taking `id` out of scope would take with it, and what stands in the way. */
export function scopeChange(tax: Taxonomy, study: Study, id: string): ScopeChange {
  const byId = new Map(study.entities.map((e) => [e.id, e]));
  const start = byId.get(id);
  if (!start) return { carried: [], blocked: [], weakened: [], possible: false, forced: [] };

  // ── the closure: this record, and what cannot stand without it ──────────────
  const carried = new Map<string, EntityRecord>([[start.id, start]]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const e of study.entities) {
      if (carried.has(e.id) || isSetBack(tax, e)) continue;
      const t = getType(tax, e.type); if (!t) continue;
      const needs = refFields(t).some((f) =>
        f.required && f.type === "ref" && idsOf(e.values[f.key]).some((r) => carried.has(r)));
      if (needs) { carried.set(e.id, e); grew = true; }
    }
    // A record whose every reason is inside the closure goes too - the measure that would
    // be left covering nothing. Done in the same loop so it can cascade further.
    //
    // SELF-REFERENCES ARE NOT REASONS. A kill-chain step points at the steps before it;
    // that is an ordering, not a dependence, and reading it as one made the first version
    // of this carry an entire chain out of scope because its first step went - measured on
    // the sample: one step asked about, six carried. A relation within a type describes its
    // internal structure; only a relation to ANOTHER type says what a record is for.
    for (const e of study.entities) {
      if (carried.has(e.id) || isSetBack(tax, e)) continue;
      const t = getType(tax, e.type); if (!t) continue;
      const multi = refFields(t).filter((f) => f.type === "multiref" && f.refType !== t.key);
      if (!multi.length) continue;
      const targets = multi.flatMap((f) => idsOf(e.values[f.key]));
      if (targets.length && targets.every((r) => carried.has(r))) { carried.set(e.id, e); grew = true; }
    }
  }

  // ── what is left pointing at the closure from outside it ────────────────────
  //
  // A SECOND PASS over the same references, and that is where a rule can end up living in
  // one place and not the other - the gap named at the `refType === t.key` line below. It
  // could be avoided by deriving this list from the traversal that built the closure, so
  // there is no second place for a rule to be missing from. It is not done that way because
  // this function ANSWERS BEFORE ANYTHING IS WRITTEN: the caller shows the answer and the
  // analyst can decline. A diff against the previous state - which is how the fork does it,
  // and it cannot diverge - needs the state to have changed already. Worth doing if the gap
  // ever has something in it; today the taxonomy has nothing of that shape, and a test says
  // so by name.

  const blocked: ScopeChange["blocked"] = [];
  const weakened: ScopeChange["weakened"] = [];
  for (const e of study.entities) {
    if (carried.has(e.id) || isSetBack(tax, e)) continue;
    const t = getType(tax, e.type); if (!t) continue;
    for (const f of refFields(t)) {
      // Self-references are left out here for the same reason they are left out of the
      // closure above: a step pointing at the step before it states an ORDER, not a need.
      // Listing them told a reader that four unrelated records were affected when the only
      // thing that changed was where a chain starts.
      //
      // That is a heuristic, not a law. It holds for an ordering; it would NOT hold for a
      // hierarchy - a sub-record that is meaningless without its parent should be carried,
      // and the closure above does carry it, because a required single reference is followed
      // whatever it points at. What this line cannot express is an OPTIONAL parent link:
      // neither carried nor named. The taxonomy declares no single-valued self-reference
      // today and a test says so by name if one ever appears (scripts/scope-test.mjs), so
      // the choice is made deliberately rather than silently inherited.
      if (f.refType === t.key) continue;
      const targets = idsOf(e.values[f.key]);
      const hit = targets.filter((r) => carried.has(r));
      if (!hit.length) continue;
      if (f.type === "ref") blocked.push({ record: e, field: f.label });
      else weakened.push({ record: e, field: f.label, left: targets.length - hit.length });
    }
  }

  // Every type in the closure needs a switch of its own; without one there is nowhere to
  // record the state, and saying so is better than writing it into a field that is not there.
  const possible = [...carried.values()].every((e) => {
    const t = getType(tax, e.type);
    return !!(t && toggleStates(t));
  });
  // The override closure: keep adding what is carried and what is in the way until it
  // stops growing. Same two rules as above, applied to a set that is allowed to grow past
  // a refusal instead of stopping at it.
  const forced = new Map(carried);
  for (let grew = true; grew; ) {
    grew = false;
    for (const e of study.entities) {
      if (forced.has(e.id) || isSetBack(tax, e)) continue;
      const t = getType(tax, e.type); if (!t) continue;
      const hit = refFields(t).some((f) => {
        if (f.type !== "ref" || f.refType === t.key) return false;
        const v = e.values[f.key];
        return typeof v === "string" && forced.has(v);
      }) || refFields(t).some((f) =>
        f.required && f.type === "ref" && idsOf(e.values[f.key]).some((r) => forced.has(r)));
      if (hit) { forced.set(e.id, e); grew = true; }
    }
  }
  return { carried: [...carried.values()], blocked, weakened, possible, forced: [...forced.values()] };
}

/** The values that put a record out of / back into play, for the caller to write. */
export function scopeValue(tax: Taxonomy, r: EntityRecord, inPlay: boolean): { key: string; value: string } | null {
  const t = getType(tax, r.type); if (!t) return null;
  const st = toggleStates(t); if (!st) return null;
  return { key: st.field.key, value: inPlay ? st.on : st.off };
}

// ── Deleting: the same question, with a destructive answer ──────────────────
//
// Taking a record out of scope and deleting it walk the SAME references and part ways on
// what they do with them. Deleting is the one that cannot be undone, so it is the one that
// has to say what it will take - and the rule it announces must be the rule the store runs,
// or the dialog is a description of something else. Hence one traversal, used by both:
// `deleteChange` answers the question, and the store applies the result it returns.
//
// Three outcomes, matching the three shapes a reference can have:
//   REMOVED    a required single reference cannot survive its target; the record goes too,
//              recursively. Measured on the sample: deleting one risk source takes 13 of 62.
//   CLEARED    an optional single reference is set to null. The record stays, with a hole.
//   SHORTENED  a multi-valued reference loses one entry. The record stays, with one less.
//
// Unlike `scopeChange`, self-references are NOT skipped here. Within a type a reference is
// an ordering rather than a need, which is why setting a record back does not follow it -
// but a deleted predecessor is still a predecessor that is gone, and the reader should be
// told before it happens.
export interface DeleteChange {
  /** The record asked about, and everything the cascade takes with it. */
  removed: EntityRecord[];
  /** Survives, and loses a single reference to null. */
  cleared: { record: EntityRecord; field: string }[];
  /** Survives, and loses one entry from a list. */
  shortened: { record: EntityRecord; field: string; left: number }[];
  /** The study's records after the deletion - what the store writes. */
  entities: EntityRecord[];
  /** Records whose values changed, for the log. */
  touched: { before: EntityRecord; after: EntityRecord }[];
}

/** What deleting `id` would remove and what it would leave with a hole. */
export function deleteChange(tax: Taxonomy, study: Study, id: string, ts?: string): DeleteChange {
  const before = new Map(study.entities.map((e) => [e.id, e]));
  const gone = new Set<string>([id]);
  let entities = study.entities;

  for (let changed = true; changed; ) {
    changed = false;
    const next: EntityRecord[] = [];
    for (const r of entities) {
      if (gone.has(r.id)) continue;
      const t = getType(tax, r.type);
      if (!t) { next.push(r); continue; }
      let values = r.values;
      let dirty = false;
      for (const f of refFields(t)) {
        const v = values[f.key];
        if (f.type === "multiref" && Array.isArray(v)) {
          const kept = v.filter((x) => !gone.has(x as string));
          if (kept.length !== v.length) { values = { ...values, [f.key]: kept }; dirty = true; }
        } else if (f.type === "ref" && typeof v === "string" && gone.has(v)) {
          if (f.required) { gone.add(r.id); changed = true; break; }
          values = { ...values, [f.key]: null }; dirty = true;
        }
      }
      if (gone.has(r.id)) { changed = true; continue; }
      next.push(dirty ? { ...r, values, ...(ts ? { updatedAt: ts } : {}) } : r);
    }
    entities = next;
  }

  // What the survivors lost, named per field, for the dialog to show.
  const cleared: DeleteChange["cleared"] = [];
  const shortened: DeleteChange["shortened"] = [];
  for (const r of entities) {
    const was = before.get(r.id);
    if (!was || was === r) continue;
    const t = getType(tax, r.type); if (!t) continue;
    for (const f of refFields(t)) {
      const a = was.values[f.key], b = r.values[f.key];
      if (f.type === "ref" && typeof a === "string" && b == null) cleared.push({ record: was, field: f.label });
      else if (f.type === "multiref" && Array.isArray(a) && Array.isArray(b) && b.length < a.length)
        shortened.push({ record: was, field: f.label, left: b.length });
    }
  }
  return {
    removed: [...gone].map((g) => before.get(g)!).filter(Boolean),
    cleared, shortened, entities,
    touched: entities.filter((r) => before.get(r.id) && before.get(r.id) !== r)
      .map((r) => ({ before: before.get(r.id)!, after: r })),
  };
}
