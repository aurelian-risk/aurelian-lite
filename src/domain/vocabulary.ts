// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Refreshing a taxonomy's vocabularies from the catalogue that defines them.
//
// A profile that works to a published ruleset carries lists the publisher owns: the
// practices a requirement can belong to, the object categories it applies to, the modal
// verbs it uses. Typed into the taxonomy by hand, those lists are a copy that ages
// silently — nothing fails when the publisher adds a category, the value simply never
// appears in the picker.
//
// A field says where its values come from (`FieldDef.vocabulary`, see types.ts), and this
// module reads them back out of a parsed catalogue. The engine knows the mechanism; which
// fields take part, and from which property, is the taxonomy's business.
//
// Two rules the merge follows:
//  · A value a record still holds is never dropped. The catalogue may have retired it;
//    the study has not, and an option that vanishes takes the record's value with it.
//  · Values that stay keep their position. The publisher's document order is an accident
//    of where a term happens to appear first; the profile's order is a decision.
import type { EntityRecord, Taxonomy, FieldDef } from "./types";
import { fieldLabel, typeLabel } from "./taxonomy";
import type { Framework } from "./frameworks";

/** The label of the catalogue's top-level grouping, as a vocabulary source. */
export const GROUPS_VOCABULARY = "@groups";

/** The top-level group an item sits under, or "" when the catalogue is flat. */
export function topGroupOf(section: string | undefined): string {
  return (section ?? "").split(" / ")[0]?.trim() ?? "";
}

/** Distinct values per vocabulary source, in the order the catalogue first shows them.
 *
 *  A property that lists several terms carries them comma-separated — OSCAL allows the
 *  property to repeat, and oscal.ts joins repetitions the same way. Splitting therefore
 *  recovers the individual terms. It is applied only to sources a field declares, so a
 *  prose property that happens to contain a comma is never cut up. */
export function catalogVocabularies(fw: Framework, sources: Iterable<string>): Record<string, string[]> {
  const wanted = new Set(sources);
  const out: Record<string, Set<string>> = {};
  const add = (key: string, raw: string) => {
    for (const part of raw.split(",")) {
      const v = part.trim();
      if (v) (out[key] ??= new Set()).add(v);
    }
  };
  for (const it of fw.items) {
    if (wanted.has(GROUPS_VOCABULARY)) {
      const g = topGroupOf(it.section);
      if (g) (out[GROUPS_VOCABULARY] ??= new Set()).add(g);
    }
    for (const [name, value] of Object.entries(it.props ?? {})) {
      if (wanted.has(name) && value) add(name, value);
    }
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v]]));
}

export interface VocabularyChange {
  typeKey: string;
  typeLabel: string;
  fieldKey: string;
  fieldLabel: string;
  /** The property name (or "@groups") the values were read from. */
  source: string;
  current: string[];
  /** Adding what the catalogue has and keeping everything else. The safe reading, and the
   *  only correct one for a catalogue that covers part of the field - an unrelated
   *  ruleset lists none of these terms without that meaning they were retired. */
  merged: string[];
  /** Taking the catalogue's list as the whole truth: what it does not list goes, unless a
   *  record holds it. Right for the ruleset the field belongs to, wrong for any other. */
  mergedReplacing: string[];
  added: string[];
  /** In the taxonomy, absent from the catalogue - dropped only when replacing. */
  removed: string[];
  /** Of `removed`, the ones a record still holds. Kept even when replacing. */
  keptInUse: string[];
}

/** Add what the catalogue has, or take its list as the whole truth. */
export type VocabularyMode = "add" | "replace";

/** Does this catalogue carry any of the vocabularies the taxonomy draws on? Distinguishes
 *  "checked, and the lists already agree" from "this file says nothing about them" - which
 *  an empty change list alone cannot, and the difference is the whole answer to whether
 *  the build is current. */
export function catalogDefinesVocabulary(tax: Taxonomy, fw: Framework): boolean {
  const sources = vocabularyFields(tax).map((f) => f.field.vocabulary!);
  return Object.values(catalogVocabularies(fw, sources)).some((v) => v.length > 0);
}

/** Every field of the taxonomy that declares where its values come from. */
function vocabularyFields(tax: Taxonomy): { typeKey: string; typeLabel: string; field: FieldDef }[] {
  const out: { typeKey: string; typeLabel: string; field: FieldDef }[] = [];
  for (const t of tax.entityTypes) {
    for (const f of t.fields) if (f.vocabulary) out.push({ typeKey: t.key, typeLabel: typeLabel(t), field: f });
  }
  return out;
}

/** What refreshing the vocabularies from this catalogue would change, field by field.
 *  Fields the catalogue says nothing about are left out entirely - an absent property is
 *  a catalogue that does not carry the vocabulary, not a vocabulary that became empty. */
export function planVocabularyUpdate(tax: Taxonomy, fw: Framework, entities: EntityRecord[] = []): VocabularyChange[] {
  const fields = vocabularyFields(tax);
  const vocab = catalogVocabularies(fw, fields.map((f) => f.field.vocabulary!));
  const changes: VocabularyChange[] = [];

  for (const { typeKey, typeLabel, field } of fields) {
    const incoming = vocab[field.vocabulary!];
    if (!incoming?.length) continue;
    const current = field.options ?? [];
    const inc = new Set(incoming);

    const held = new Set<string>();
    for (const e of entities) {
      if (e.type !== typeKey) continue;
      const v = e.values[field.key];
      for (const one of Array.isArray(v) ? v : v == null ? [] : [String(v)]) {
        for (const part of String(one).split(",")) { const s = part.trim(); if (s) held.add(s); }
      }
    }

    const removed = current.filter((v) => !inc.has(v));
    const keptInUse = removed.filter((v) => held.has(v));
    const added = incoming.filter((v) => !current.includes(v));
    // Order: what stays keeps its place, what is new is appended in the catalogue's order,
    // and a retired value a record still holds is kept at the end rather than lost.
    const merged = [...current, ...added];
    const mergedReplacing = [
      ...current.filter((v) => inc.has(v)),
      ...added,
      ...keptInUse,
    ];
    if (!added.length && !removed.length) continue;
    changes.push({ typeKey, typeLabel, fieldKey: field.key, fieldLabel: fieldLabel(field),
      source: field.vocabulary!, current, merged, mergedReplacing, added, removed, keptInUse });
  }
  return changes;
}

/** Apply the picked changes, and stamp the taxonomy with what it was refreshed from.
 *
 *  `mode` defaults to adding. Replacing is right only for the ruleset a field's vocabulary
 *  belongs to; any other catalogue lists none of these terms without that meaning the
 *  publisher retired them, and taking its silence for a retirement empties the field. */
export function applyVocabularyUpdate(tax: Taxonomy, changes: VocabularyChange[], picked: Iterable<string>, fw?: Framework, at = new Date().toISOString(), mode: VocabularyMode = "add"): Taxonomy {
  const take = new Set(picked);
  const by = new Map(changes.filter((c) => take.has(`${c.typeKey}.${c.fieldKey}`)).map((c) => [`${c.typeKey}.${c.fieldKey}`, c]));
  if (!by.size) return tax;
  return {
    ...tax,
    entityTypes: tax.entityTypes.map((t) => ({
      ...t,
      fields: t.fields.map((f) => {
        const c = by.get(`${t.key}.${f.key}`);
        return c ? { ...f, options: mode === "replace" ? c.mergedReplacing : c.merged } : f;
      }),
    })),
    ...(fw ? { vocabularySource: { name: fw.name, version: versionOf(fw), at } } : {}),
  };
}

/** The catalogue's own version, as parseOscalCatalog records it in `source`. */
function versionOf(fw: Framework): string | undefined {
  return /version ([^\s·]+)/.exec(fw.source)?.[1];
}
