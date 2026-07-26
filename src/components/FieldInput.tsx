// Renders a single taxonomy field as the appropriate input control.
import type { FieldDef, FieldValue } from "../domain/types";
import { scaleLabel, scaleMax } from "../domain/taxonomy";
import { MultiSelect, ScaleInput } from "./ui";

export interface RefOption { id: string; label: string }

export function FieldInput({
  field, value, onChange, refOptions,
}: {
  field: FieldDef;
  value: FieldValue;
  onChange: (v: FieldValue) => void;
  refOptions: (typeKey: string) => RefOption[];
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
      return (
        <select value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">{field.required ? "select …" : "— none —"}</option>
          {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      );
    }

    case "multiref":
      return (
        <MultiSelect options={refOptions(field.refType ?? "")}
          selected={Array.isArray(value) ? (value as string[]) : []}
          onChange={(ids) => onChange(ids)} emptyHint="no entities to link yet" />
      );

    default:
      return <input value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
  }
}
