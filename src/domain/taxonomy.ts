// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// The generic meta-schema: how to read, validate and reconcile records against a
// taxonomy - independent of WHICH taxonomy. The taxonomy itself is a product
// decision and lives in src/profile.
import type {
  EntityRecord, EntityTypeDef, FieldDef, FieldValue, Taxonomy,
} from "./types";
import { DEFAULT_TAXONOMY, TAXONOMY_SCHEMA_VERSION } from "../profile";

export { DEFAULT_TAXONOMY, TAXONOMY_SCHEMA_VERSION };

// ── Helpers ────────────────────────────────────────────────────────────

export function getType(tax: Taxonomy, key: string): EntityTypeDef | undefined {
  return tax.entityTypes.find((t) => t.key === key);
}

export function getGroup(tax: Taxonomy, key: string) {
  return tax.groups.find((g) => g.key === key);
}

export function titleField(t: EntityTypeDef): string {
  return t.titleField ?? (t.fields.find((f) => f.type === "text")?.key ?? "name");
}

export function recordTitle(t: EntityTypeDef, r: EntityRecord): string {
  const v = r.values[titleField(t)];
  return typeof v === "string" && v.trim() ? v : "(untitled)";
}

/** Fields shown as table columns: everything non-textarea except the title. */
export function columnFields(t: EntityTypeDef): FieldDef[] {
  const title = titleField(t);
  return t.fields.filter(
    (f) => f.key !== title && f.type !== "textarea" && f.column !== false,
  );
}

export function refFields(t: EntityTypeDef): FieldDef[] {
  return t.fields.filter((f) => f.type === "ref" || f.type === "multiref");
}

export function emptyValues(t: EntityTypeDef): Record<string, FieldValue> {
  const v: Record<string, FieldValue> = {};
  for (const f of t.fields) {
    switch (f.type) {
      case "scale": v[f.key] = 2; break;
      case "number": v[f.key] = 0; break;
      case "boolean": v[f.key] = false; break;
      case "multiref": v[f.key] = []; break;
      case "ref": v[f.key] = null; break;
      case "enum": v[f.key] = f.options?.[0] ?? ""; break;
      default: v[f.key] = "";
    }
  }
  return v;
}

export function validateRecord(t: EntityTypeDef, values: Record<string, FieldValue>): string | null {
  for (const f of t.fields) {
    if (!f.required) continue;
    const v = values[f.key];
    const empty =
      v == null || v === "" || (Array.isArray(v) && v.length === 0);
    if (empty) return `"${f.label}" is required.`;
  }
  return null;
}

export function scaleMax(f: FieldDef): number {
  return f.scaleLabels?.length ?? 4;
}

export function scaleLabel(f: FieldDef, value: number): string {
  return f.scaleLabels?.[value - 1] ?? String(value);
}

/** Additively bring a stored taxonomy in line with the default one: enum fields whose
 *  vocabulary the default has since grown gain the missing options, and a field the
 *  default has since told where its values come from gains that declaration. Applied on
 *  load and on import, so an existing study picks up a new option (e.g. a further measure
 *  effect class) without the user having to reset the taxonomy and lose their
 *  customisations.
 *
 *  Runs at most once per stored taxonomy, gated on `schemaVersion` - so an option the
 *  user deliberately deleted is not resurrected on every load. Only enum vocabularies
 *  that still overlap the default one are extended; a taxonomy whose options were
 *  replaced wholesale is treated as user-owned and left alone. Nothing else is touched:
 *  no types, fields, labels or orders are added, removed or reordered.
 *
 *  `vocabulary` is carried over even where the options were replaced: it says where the
 *  values come from, which is the publisher's business rather than the user's, and a
 *  field that has lost it can no longer be refreshed from the source at all.
 *
 *  Returns the input unchanged when there is nothing to do. */
export function reconcileTaxonomy(tax: Taxonomy): Taxonomy {
  if ((tax.schemaVersion ?? 0) >= TAXONOMY_SCHEMA_VERSION) return tax;
  const entityTypes = tax.entityTypes.map((t) => {
    const def = DEFAULT_TAXONOMY.entityTypes.find((d) => d.key === t.key);
    if (!def) return t;
    let typeChanged = false;
    const fields = t.fields.map((f) => {
      const defF = def.fields.find((d) => d.key === f.key);
      let next = f;
      if (defF?.vocabulary && !f.vocabulary) { next = { ...next, vocabulary: defF.vocabulary }; typeChanged = true; }
      const opts = f.options;
      if (f.type !== "enum" || !opts) return next;
      const defOpts = defF?.type === "enum" ? defF.options : undefined;
      // No overlap at all = the user replaced this vocabulary with their own.
      if (!defOpts || !opts.some((o) => defOpts.includes(o))) return next;
      const missing = defOpts.filter((o) => !opts.includes(o));
      if (!missing.length) return next;
      typeChanged = true;
      return { ...next, options: [...opts, ...missing] };
    });
    return typeChanged ? { ...t, fields } : t;
  });
  return { ...tax, schemaVersion: TAXONOMY_SCHEMA_VERSION, entityTypes };
}
