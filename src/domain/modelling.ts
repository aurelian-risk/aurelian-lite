// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Deriving the requirements that apply to a record, from the catalogue that states them.
//
// A publisher that classifies its requirements — "this one applies to network connections"
// — has already written down which requirements reach which object. The work then is not
// to decide, but to apply: classify the object, widen the class along the publisher's own
// hierarchy, collect, and de-duplicate. That is mechanical, and doing it by hand over a
// thousand requirements is where the errors come from.
//
// Nothing here knows a method. It works from two declarations in the taxonomy:
//
//   · a field on some type whose `vocabulary` names a source (the object's class),
//   · a field on the catalogue-backed type whose `vocabulary` names the same source
//     (the classes a catalogue item applies to),
//
// plus, optionally, that vocabulary's hierarchy (Taxonomy.vocabularyHierarchy), which says
// which class is a special case of which. Declare none of it and nothing is derived.
import type { EntityRecord, FieldDef, Study, Taxonomy } from "./types";
import type { Framework, FrameworkItem } from "./frameworks";
import { catalogTargets } from "./catalog";

/** The two ends of a classification: what an object is, and what an item applies to. */
export interface ClassificationLink {
  source: string;
  /** The type whose records carry a class (assets, systems, …). */
  objectType: string;
  objectField: FieldDef;
  /** The catalogue-backed type whose items name the classes they apply to. */
  itemType: string;
  itemField: FieldDef;
}

/** Find the classification the taxonomy declares, if it declares one.
 *
 *  Two fields naming the same vocabulary are not automatically the two ends of one: a
 *  catalogue item may also carry a class of its OWN — which chapter it belongs to, say —
 *  and a record elsewhere may carry that same class. What separates the two cases is
 *  cardinality. A record IS one class, so its field is an enum; an item APPLIES TO
 *  several, so its field is a list. Pairing an enum with an enum would derive from
 *  whichever type happened to be declared first. */
export function classificationLink(tax: Taxonomy): ClassificationLink | null {
  for (const t of catalogTargets(tax)) {
    for (const itemField of t.type.fields) {
      if (!itemField.vocabulary || itemField.type === "enum") continue;
      for (const ot of tax.entityTypes) {
        if (ot.key === t.type.key) continue;
        const objectField = ot.fields.find((f) => f.vocabulary === itemField.vocabulary && f.type === "enum");
        if (objectField) {
          return { source: itemField.vocabulary, objectType: ot.key, objectField, itemType: t.type.key, itemField };
        }
      }
    }
  }
  return null;
}

/** A class and every class above it, up to the root. Deterministic, because the hierarchy
 *  is fixed; a cycle in a hand-edited taxonomy stops rather than hanging. */
export function withAncestors(tax: Taxonomy, source: string, classes: string[]): string[] {
  const parent = tax.vocabularyHierarchy?.[source] ?? {};
  const out: string[] = [];
  for (const start of classes) {
    let c: string | undefined = start;
    while (c && !out.includes(c)) { out.push(c); c = parent[c]; }
  }
  return out;
}

const listOf = (v: unknown): string[] =>
  (Array.isArray(v) ? v.map(String) : v == null ? [] : String(v).split(","))
    .map((s) => s.trim()).filter(Boolean);

export interface PackagedItem {
  item: FrameworkItem;
  /** Why it is in the package — one line per rule that put it there. Kept in full: an
   *  item reached through several objects is carried once, and an audit asks which. */
  reasons: string[];
  /** Already recorded in the study. */
  present: boolean;
}

export interface RequirementPackage {
  link: ClassificationLink;
  /** Objects that carry a class, with the classes they inherit. */
  objects: { record: EntityRecord; name: string; own: string[]; inherited: string[]; count: number }[];
  /** Objects with no class at all — nothing can be derived for them, and that is a finding
   *  rather than an empty result. */
  unclassified: EntityRecord[];
  items: PackagedItem[];
  /** Catalogue items that name no class. They cannot be derived, and a method may well
   *  require a decision on each; counted here so they are not silently lost. */
  unclassifiedItems: number;
}

/** What the catalogue says applies to the objects recorded in this study. */
export function requirementPackage(tax: Taxonomy, study: Study, fw: Framework, opts: { titleField?: string } = {}): RequirementPackage | null {
  const link = classificationLink(tax);
  if (!link) return null;

  const target = catalogTargets(tax).find((t) => t.type.key === link.itemType);
  const existing = study.entities.filter((e) => e.type === link.itemType);
  const already = new Set(existing.map((e) => String(e.values.ref_id ?? "")).filter(Boolean));

  const records = study.entities.filter((e) => e.type === link.objectType);
  const objects: RequirementPackage["objects"] = [];
  const unclassified: EntityRecord[] = [];
  const byRef = new Map<string, PackagedItem>();
  let unclassifiedItems = 0;

  const nameOf = (r: EntityRecord) => String(r.values[opts.titleField ?? "name"] ?? r.id);

  for (const r of records) {
    const own = listOf(r.values[link.objectField.key]);
    if (!own.length) { unclassified.push(r); continue; }
    const all = withAncestors(tax, link.source, own);
    const inherited = all.filter((c) => !own.includes(c));
    let count = 0;
    for (const item of fw.items) {
      const classes = listOf(item.props?.[link.itemField.key]);
      const hit = classes.find((c) => all.includes(c));
      if (!hit) continue;
      count++;
      const why = `${nameOf(r)} — ${hit}${inherited.includes(hit) ? " (inherited)" : ""}`;
      const seen = byRef.get(item.ref_id);
      if (seen) { if (!seen.reasons.includes(why)) seen.reasons.push(why); continue; }
      byRef.set(item.ref_id, { item, reasons: [why], present: already.has(item.ref_id) });
    }
    objects.push({ record: r, name: nameOf(r), own, inherited, count });
  }

  for (const item of fw.items) if (!listOf(item.props?.[link.itemField.key]).length) unclassifiedItems++;

  void target;
  return { link, objects, unclassified, items: [...byRef.values()], unclassifiedItems };
}
