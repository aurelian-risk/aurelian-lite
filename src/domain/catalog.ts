// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// One shared definition of the two catalog "targets" — requirement and security
// measure — so the bundled-seed picker (CatalogAdd, on the tables) and the
// semi-deterministic table import (Documents) treat them analogously: same catalog
// shape, same value-mapping and de-dup, only the target entity type differs.
import type { EntityRecord, EntityTypeDef, FieldValue, Taxonomy } from "./types";
import type { Framework, FrameworkItem } from "./frameworks";
import { requirementValues, measureValues } from "./frameworks";
import { GROUPS_VOCABULARY, topGroupOf } from "./vocabulary";
import { toggleStates } from "./taxonomy";
import { BUNDLED_FRAMEWORKS, BUNDLED_MEASURE_CATALOGS } from "../profile";

/** Write a catalogue item's extra properties into the entity, for every property whose
 *  name matches a field the taxonomy declares. Values the primary mapping already set
 *  win, so a `category` property cannot displace the item's own category.
 *
 *  This is what lets a profile absorb a publisher's vocabulary without the engine
 *  knowing it: declare a field keyed `effort_level`, and an OSCAL catalogue carrying
 *  that property fills it. Declare nothing, and the property is simply not used. */
function withProps(type: EntityTypeDef, base: Record<string, FieldValue>, it: FrameworkItem): Record<string, FieldValue> {
  // A catalogue entry is what a publisher wrote down, not what this study has adopted, so
  // it arrives switched off - and says so in writing. A record that leaves the field empty
  // counts as in play, which is right for one somebody typed in and wrong for a library of
  // several hundred nobody has looked at yet.
  const t = toggleStates(type);
  const out = { ...(t ? { [t.field.key]: t.off } : {}), ...base };
  for (const f of type.fields) {
    // A field may instead name where its value comes from when the catalogue carries it
    // as structure rather than as a property: "@groups" is the top-level grouping the
    // item sits under, which is how a catalogue states the chapter — practice, family,
    // domain — a control belongs to. Without this the field stays empty however
    // faithfully the catalogue was read.
    const raw = f.vocabulary === GROUPS_VOCABULARY ? topGroupOf(it.section) : it.props?.[f.key];
    if (raw == null || raw === "") continue;
    const set = out[f.key];
    if (set != null && set !== "" && !(Array.isArray(set) && set.length === 0)) continue;
    switch (f.type) {
      case "number": case "scale": {
        const n = Number(raw);
        if (Number.isFinite(n)) out[f.key] = n;
        break;
      }
      case "boolean":
        out[f.key] = !/^(0|false|nein|no)$/i.test(raw.trim());
        break;
      case "ref": case "multiref":
        break;                                    // a property is text; it cannot name a record id
      default:
        out[f.key] = raw;                         // text, textarea, enum - kept verbatim
    }
  }
  return out;
}

export interface CatalogTarget {
  kind: "requirement" | "measure";
  type: EntityTypeDef;
  bundled: Framework[];
  toValues: (fw: Framework, it: FrameworkItem) => Record<string, FieldValue>;
  /** true if an equivalent entity already exists in the study (de-dup). */
  exists: (existing: EntityRecord[], fw: Framework, it: FrameworkItem) => boolean;
}

// Taxonomy-driven detection (no hard-coded type keys):
//  · requirement = a type carrying both `framework` and `ref_id` fields;
//  · measure     = a type with a multiref back to the kill-chain step type (`covers`).
export function catalogTargets(tax: Taxonomy): CatalogTarget[] {
  const out: CatalogTarget[] = [];

  const reqType = tax.entityTypes.find((t) => t.fields.some((f) => f.key === "framework") && t.fields.some((f) => f.key === "ref_id"));
  if (reqType) out.push({
    kind: "requirement", type: reqType, bundled: BUNDLED_FRAMEWORKS,
    toValues: (fw, it) => withProps(reqType, requirementValues(fw, it), it),
    exists: (ex, fw, it) => ex.some((r) => String(r.values.framework ?? "") === fw.name && String(r.values.ref_id ?? "") === it.ref_id),
  });

  const stepType = tax.entityTypes.find((t) => t.fields.some((f) => f.type === "ref" && f.refType) && t.fields.some((f) => f.type === "number"));
  const measureType = tax.entityTypes.find((t) => t.key !== stepType?.key && t.fields.some((f) => f.type === "multiref" && f.refType === stepType?.key));
  if (measureType) out.push({
    kind: "measure", type: measureType, bundled: BUNDLED_MEASURE_CATALOGS,
    toValues: (fw, it) => withProps(measureType, measureValues(fw, it), it),
    // measures carry no ref_id/framework, so de-dup on the (case-insensitive) name.
    exists: (ex, _fw, it) => ex.some((m) => String(m.values.name ?? "").trim().toLowerCase() === it.title.trim().toLowerCase()),
  });

  return out;
}

export function targetByKind(tax: Taxonomy, kind: "requirement" | "measure"): CatalogTarget | undefined {
  return catalogTargets(tax).find((t) => t.kind === kind);
}
