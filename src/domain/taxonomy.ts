// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// The generic meta-schema: how to read, validate and reconcile records against a
// taxonomy - independent of WHICH taxonomy. The taxonomy itself is a product
// decision and lives in src/profile.
import type {
  EntityRecord, EntityTypeDef, FieldDef, FieldValue, Study, Taxonomy,
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

/** What to show for an enum value: the field's label for it, or the value itself. */
export function optionLabel(f: FieldDef, value: string): string {
  const i = f.options?.indexOf(value) ?? -1;
  return (i >= 0 ? f.optionLabels?.[i] : undefined) ?? value;
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

/** The two-state field a type is switched by, if it declares one. */
export function toggleField(t: EntityTypeDef): FieldDef | undefined {
  return t.fields.find((f) => f.toggle && f.type === "enum" && f.options?.length === 2);
}

/** A record that is present but not in play: its switch STANDS RECORDED on the first
 *  option. A type without a switch is always in play, so this stays false for every other
 *  table.
 *
 *  A record that says nothing counts as in play. Silence is not a decision to set it
 *  back: a study written before the switch existed carries no value for it, and reading
 *  that as "not in use" would quietly empty the coverage matrix, the radar and the
 *  quantification of an existing study on the first load after an upgrade. What arrives
 *  set back arrives that way because something wrote it - a catalogue seeding an entry
 *  nobody has adopted yet. */
export function isSetBack(tax: Taxonomy, r: EntityRecord): boolean {
  const t = getType(tax, r.type);
  return t ? isSetBackIn(t, r) : false;
}

/** The same question where the caller already holds the type - a view that was handed one
 *  type and its records has no reason to be handed the whole taxonomy as well. */
export function isSetBackIn(t: EntityTypeDef, r: EntityRecord): boolean {
  const f = toggleField(t);
  if (!f?.options) return false;
  const v = r.values[f.key];
  if (v == null || v === "") return false;
  return String(v) === f.options[0];
}

/** A type's switch and the two values it stands on: `off` is the first option, `on` the
 *  second, as the toggle contract says. Null for a type without a switch, so a caller can
 *  spread the result and stay generic. */
export function toggleStates(t: EntityTypeDef): { field: FieldDef; on: string; off: string } | null {
  const f = toggleField(t);
  const [off, on] = f?.options ?? [];
  return f && on && off ? { field: f, on, off } : null;
}

/** Why the switch may not be set back right now, or null. Reading, not enforcing: the
 *  caller disables the control and shows the reason.
 *
 *  The message NAMES what holds the record - two of them and a count beyond that. A field
 *  label and a number ("through \"Acts on attack steps\" (1)") leaves the reader to go and
 *  find which one, which is the work the message was supposed to save. */
export function setBackBlocked(tax: Taxonomy, study: Study, r: EntityRecord): string | null {
  const t = getType(tax, r.type);
  const f = t && toggleField(t);
  if (!t || !f?.lockedWhile?.length) return null;
  for (const key of f.lockedWhile) {
    const fld = t.fields.find((x) => x.key === key);
    const v = r.values[key];
    const held = Array.isArray(v) ? v.map(String).filter(Boolean)
      : v == null || v === "" ? [] : [String(v)];
    if (!held.length) continue;
    const named = (fld?.type === "ref" || fld?.type === "multiref")
      ? held.map((id) => {
        const ref = study.entities.find((e) => e.id === id);
        const rt = ref && getType(tax, ref.type);
        return ref && rt ? recordTitle(rt, ref) : null;
      }).filter((x): x is string => !!x)
      : held;
    const rest = Math.max(0, named.length - 2);
    const what = named.length
      ? `${named.slice(0, 2).join(", ")}${rest > 0 ? ` and ${rest} more` : ""}`
      : String(held.length);
    return `In use: ${(fld?.relation ?? fld?.label ?? key).toLowerCase()} ${what}. Take it off there first.`;
  }
  return null;
}
