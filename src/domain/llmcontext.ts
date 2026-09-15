// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// The part of a study a language model is asked about, in the shape the application
// stores it - so the answer can come back in that same shape and be pasted into the
// import dialog as an additive import.
//
// The prose exports (workshopMarkdown, quantLlmMarkdown) read well and resolve every
// reference to a name, which is what makes them unusable as input: a name is not an id,
// "high" is not 3, and a record without a type key belongs nowhere. This block is the
// other half: the data model excerpt the records are written against, as the taxonomy
// file spells it, and the records as the bundle file spells them. The same block will be
// the study context of a system prompt once an API is attached; a prompt that carries
// the schema the answer has to fit is the whole of what makes the answer importable.
import yaml from "js-yaml";
import type { EntityRecord, EntityTypeDef, FieldDef, Study, Taxonomy } from "./types";
import { getType, recordTitle } from "./taxonomy";

/** The keys of `seed` plus every type they point at through a ref field - one hop, so the
 *  targets of a reference are described, but not the targets of those. */
export function relevantTypes(tax: Taxonomy, seed: string[]): EntityTypeDef[] {
  const keys = new Set(seed);
  for (const k of seed) for (const f of getType(tax, k)?.fields ?? []) if (f.refType) keys.add(f.refType);
  return tax.entityTypes.filter((t) => keys.has(t.key));
}

/** A field as the taxonomy file writes it, reduced to what decides whether a value is
 *  valid: type, options, scale, target, requirement - and the help text, which is the
 *  one sentence that says what the field is FOR. Presentation keys (column, toggle,
 *  colour polarity) say nothing about a value and are left out. */
function fieldExcerpt(f: FieldDef): Record<string, unknown> {
  const out: Record<string, unknown> = { key: f.key, label: f.label, type: f.type };
  if (f.required) out.required = true;
  if (f.type === "enum" && f.options) out.options = f.options;
  if (f.type === "scale" && f.scaleLabels) out.scaleLabels = f.scaleLabels;
  if ((f.type === "ref" || f.type === "multiref") && f.refType) out.refType = f.refType;
  if (f.help) out.help = f.help;
  return out;
}

function typeExcerpt(t: EntityTypeDef): Record<string, unknown> {
  const out: Record<string, unknown> = { key: t.key, label: t.label, labelPlural: t.labelPlural, group: t.group };
  if (t.titleField) out.titleField = t.titleField;
  out.fields = t.fields.map(fieldExcerpt);
  return out;
}

/** A record as the bundle file writes it: id, type, values. The timestamps and the
 *  provenance stay out - the import fills what is missing, and a model asked to write
 *  records has no business inventing dates. */
const recordExcerpt = (e: EntityRecord) => ({ id: e.id, type: e.type, values: e.values });

const DUMP: yaml.DumpOptions = { lineWidth: 100, noRefs: true, sortKeys: false };

/** The block appended to an LLM export.
 *
 *  `seed` names the types the export is about; their records go in full. Records those
 *  point at through a ref field are listed OUTSIDE the YAML, as id and title only: a
 *  model echoes what it is given, and a reduced record echoed back would overwrite the
 *  full one on import. Types the seed points at are still described in the model excerpt,
 *  so a reference can be added to a record of a kind the model has not seen in full. */
export function llmContext(tax: Taxonomy, study: Study, seed: string[]): string {
  const types = relevantTypes(tax, seed);
  const seedSet = new Set(seed);
  const own = study.entities.filter((e) => seedSet.has(e.type));
  const ownIds = new Set(own.map((e) => e.id));
  // Everything a seed record points at that is not itself in the block.
  const refd = new Map<string, EntityRecord>();
  for (const e of own) {
    const t = getType(tax, e.type);
    for (const f of t?.fields ?? []) {
      if (f.type !== "ref" && f.type !== "multiref") continue;
      const v = e.values[f.key];
      for (const id of Array.isArray(v) ? v : typeof v === "string" ? [v] : []) {
        if (ownIds.has(id) || refd.has(id)) continue;
        const r = study.entities.find((x) => x.id === id);
        if (r) refd.set(id, r);
      }
    }
  }
  const groups = tax.groups.filter((g) => types.some((t) => t.group === g.key))
    .map((g) => ({ key: g.key, label: g.label, ...(g.description ? { description: g.description } : {}) }));

  const L: string[] = [];
  L.push("## Context for an additive import", "");
  L.push("The records this export describes, and the part of the data model they are written",
    "against, as the application stores them. An answer in the shape of the **Records**",
    "document can be pasted into *Import → Additive*: keep the study `id`, list only the",
    "records to add or change, give a new record a fresh unique `id` (any string not in use),",
    "and refer to other records by their `id`. An `enum` holds one of its `options` verbatim;",
    "a `scale` holds the number of its label, counted from 1; a `ref` holds one id and a",
    "`multiref` a list of ids. Records not listed in the answer are left as they are.", "");
  L.push("### Data model (excerpt - for reference, not part of the answer)", "");
  // Option and scale lists in flow style: `[low, moderate, high]` reads as one line, and
  // depth 5 is exactly where those lists sit in the excerpt.
  L.push("```yaml", yaml.dump({ groups, entityTypes: types.map(typeExcerpt) }, { ...DUMP, flowLevel: 5 }).trimEnd(), "```", "");
  L.push("### Records", "");
  L.push("```yaml", yaml.dump({ studies: [{
    id: study.id, name: study.name,
    ...(study.organization ? { organization: study.organization } : {}),
    ...(study.scope ? { scope: study.scope } : {}),
    entities: own.map(recordExcerpt),
  }] }, DUMP).trimEnd(), "```", "");
  if (refd.size) {
    L.push("### Referenced records (ids for the `ref` fields above - not part of the answer)", "");
    for (const r of refd.values()) {
      const t = getType(tax, r.type);
      L.push(`- \`${r.id}\` - ${t ? recordTitle(t, r) : r.id} (${t?.label ?? r.type})`);
    }
    L.push("");
  }
  return L.join("\n");
}

/** The types the quantification reads: the scenario that carries a chain, the step, and
 *  whatever defends a step - found by shape, as quantModel finds them. */
export function quantSeed(tax: Taxonomy): string[] {
  const op = tax.entityTypes.find((t) => t.fields.some((f) => f.key === "difficulty"));
  const step = tax.entityTypes.find((t) => t.fields.some((f) => f.type === "ref" && f.refType) && t.fields.some((f) => f.type === "number"));
  const defenders = step ? tax.entityTypes.filter((t) => t.fields.some((f) => f.type === "multiref" && f.refType === step.key)) : [];
  return [op, step, ...defenders].filter((t): t is EntityTypeDef => !!t).map((t) => t.key);
}
