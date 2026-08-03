// Renders a single taxonomy field as the appropriate input control.
import type { FieldDef, FieldValue } from "../domain/types";
import { scaleLabel, scaleMax } from "../domain/taxonomy";
import { suggestTechniques, techniqueLabel } from "../domain/mitre";
import { MultiSelect, ScaleInput } from "./ui";

export interface RefOption { id: string; label: string; group?: string }

export function FieldInput({
  field, value, onChange, refOptions, siblings, suggested, multirefOptions,
}: {
  field: FieldDef;
  value: FieldValue;
  onChange: (v: FieldValue) => void;
  refOptions: (typeKey: string) => RefOption[];
  /** The record's other current field values (used to scope suggestions). */
  siblings?: Record<string, FieldValue>;
  /** ref: ids to surface first, in a "Scenario-linked" group (soft, non-restricting). */
  suggested?: Set<string>;
  /** multiref: grouped/filtered candidate override (e.g. kill-chain predecessors). */
  multirefOptions?: RefOption[];
}) {
  switch (field.type) {
    case "textarea":
      return <textarea value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;

    case "enum":
      return (
        <select value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
          {!field.required && <option value="">—</option>}
          {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );

    case "scale": {
      const max = scaleMax(field);
      const v = typeof value === "number" ? value : 1;
      return <ScaleInput value={v} max={max} onChange={onChange} label={scaleLabel(field, v)} />;
    }

    case "number":
      return <input type="number" value={Number(value ?? 0)} onChange={(e) => onChange(Number(e.target.value))} />;

    case "boolean":
      return (
        <label className="multi" style={{ cursor: "pointer" }}>
          <input type="checkbox" style={{ width: "auto" }} checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)} />
          <span className="hint">{value ? "yes" : "no"}</span>
        </label>
      );

    case "ref": {
      const opts = refOptions(field.refType ?? "");
      const sug = suggested && suggested.size ? opts.filter((o) => suggested.has(o.id)) : [];
      const grouped = sug.length > 0 && sug.length < opts.length; // only when it's a meaningful subset
      const rest = grouped ? opts.filter((o) => !suggested!.has(o.id)) : opts;
      const opt = (o: RefOption) => <option key={o.id} value={o.id}>{o.label}</option>;
      return (
        <select value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">{field.required ? "select …" : "(none)"}</option>
          {grouped ? (
            <>
              <optgroup label="Scenario-linked">{sug.map(opt)}</optgroup>
              <optgroup label="Other">{rest.map(opt)}</optgroup>
            </>
          ) : opts.map(opt)}
        </select>
      );
    }

    case "multiref":
      return (
        <MultiSelect options={multirefOptions ?? refOptions(field.refType ?? "")}
          selected={Array.isArray(value) ? (value as string[]) : []}
          onChange={(ids) => onChange(ids)} emptyHint={multirefOptions ? "no eligible steps — set this step's order and scenario first" : "no entities to link yet"} />
      );

    default:
      // TTP technique: a visible dropdown of the selected tactic's (kill-chain phase)
      // techniques to pick from, plus a free-text input (with datalist) for custom /
      // more specific TTPs. The suggestions are scoped to the chosen tactic.
      if (field.suggest === "mitre_technique") {
        const tactic = String(siblings?.tactic ?? "") || undefined;
        const techs = suggestTechniques(tactic);
        return (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input style={{ flex: 1 }} list="dl-mitre-technique" value={String(value ?? "")}
              placeholder="type or pick a TTP…" onChange={(e) => onChange(e.target.value)} />
            <select value="" style={{ width: "auto", flex: "none" }}
              title={tactic ? `${tactic} techniques` : "techniques"}
              onChange={(e) => { if (e.target.value) onChange(e.target.value); e.currentTarget.value = ""; }}>
              <option value="">{tactic ? `＋ ${tactic}…` : "＋ TTP…"}</option>
              {techs.map((t) => <option key={t.id} value={techniqueLabel(t)}>{techniqueLabel(t)}</option>)}
            </select>
            <datalist id="dl-mitre-technique">
              {techs.map((t) => <option key={t.id} value={techniqueLabel(t)} />)}
            </datalist>
          </div>
        );
      }
      return <input value={String(value ?? "")} placeholder={field.help} onChange={(e) => onChange(e.target.value)} />;
  }
}
