// One shared definition of the two catalog "targets" — requirement and security
// measure — so the bundled-seed picker (CatalogAdd, on the tables) and the
// semi-deterministic table import (Documents) treat them analogously: same catalog
// shape, same value-mapping and de-dup, only the target entity type differs.
import type { EntityRecord, EntityTypeDef, FieldValue, Taxonomy } from "./types";
import type { Framework, FrameworkItem } from "./frameworks";
import { BUNDLED_FRAMEWORKS, BUNDLED_MEASURE_CATALOGS, requirementValues, measureValues } from "./frameworks";

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
    kind: "requirement", type: reqType, bundled: BUNDLED_FRAMEWORKS, toValues: requirementValues,
    exists: (ex, fw, it) => ex.some((r) => String(r.values.framework ?? "") === fw.name && String(r.values.ref_id ?? "") === it.ref_id),
  });

  const stepType = tax.entityTypes.find((t) => t.fields.some((f) => f.type === "ref" && f.refType) && t.fields.some((f) => f.type === "number"));
  const measureType = tax.entityTypes.find((t) => t.key !== stepType?.key && t.fields.some((f) => f.type === "multiref" && f.refType === stepType?.key));
  if (measureType) out.push({
    kind: "measure", type: measureType, bundled: BUNDLED_MEASURE_CATALOGS, toValues: measureValues,
    // measures carry no ref_id/framework, so de-dup on the (case-insensitive) name.
    exists: (ex, _fw, it) => ex.some((m) => String(m.values.name ?? "").trim().toLowerCase() === it.title.trim().toLowerCase()),
  });

  return out;
}

export function targetByKind(tax: Taxonomy, kind: "requirement" | "measure"): CatalogTarget | undefined {
  return catalogTargets(tax).find((t) => t.kind === kind);
}
