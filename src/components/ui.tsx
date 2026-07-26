// Dependency-free UI primitives (icons, dialog, scale, multi-select).
import { useEffect, type ReactNode } from "react";

const P = (d: string) => (
  <svg className="inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
export const Icon = {
  plus: () => P("M12 5v14M5 12h14"),
  trash: () => (
    <svg className="inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
  ),
  edit: () => P("M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"),
  close: () => P("M6 6l12 12M18 6L6 18"),
  download: () => P("M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"),
  upload: () => P("M12 21V9m0 0l-4 4m4-4l4 4M5 3h14"),
  graph: () => (
    <svg className="inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="6" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="12" cy="18" r="2" />
      <path d="M6.7 7.3 10.6 16M17.3 7.3 13.4 16" /></svg>
  ),
  schema: () => (
    <svg className="inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
      <path d="M10 6.5h4a3 3 0 0 1 3 3V14" /></svg>
  ),
  chevron: () => P("M9 6l6 6-6 6"),
  spark: () => P("M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"),
  doc: () => (
    <svg className="inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2h8l4 4v16H6z" /><path d="M14 2v4h4" /></svg>
  ),
  copy: () => (
    <svg className="inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
  ),
  check: () => P("M20 6L9 17l-5-5"),
  canvas: () => (
    <svg className="inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="7" height="5" rx="1.5" /><rect x="14" y="15" width="7" height="5" rx="1.5" />
      <path d="M6.5 9v3a2 2 0 0 0 2 2h9" /></svg>
  ),
};

export function Dialog({
  title, subtitle, children, onClose, wide,
}: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog" style={wide ? { maxWidth: 720 } : undefined} onMouseDown={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "start" }}>
          <div style={{ flex: 1 }}>
            <h2>{title}</h2>
            {subtitle && <div className="dialog-sub">{subtitle}</div>}
          </div>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close"><Icon.close /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function sevColor(value: number, max: number): string {
  const r = (value - 1) / Math.max(1, max - 1);
  if (r < 0.34) return "var(--color-state-success)";
  if (r < 0.67) return "var(--color-state-info)";
  if (r < 0.9) return "var(--color-state-warning)";
  return "var(--color-state-error)";
}

export function ScaleInput({
  value, max, onChange, label,
}: { value: number; max: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="multi">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button key={n} type="button" className={"btn sm" + (n === value ? " primary" : "")}
          onClick={() => onChange(n)}>{n}</button>
      ))}
      <span className="hint">{label}</span>
    </div>
  );
}

export function ScaleBadge({ value, max, label }: { value: number; max: number; label: string }) {
  const color = sevColor(value, max);
  return (
    <span className="badge" title={label}>
      <span className="scale">
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <i key={n} className={n <= value ? "on" : ""} style={{ ["--sev" as string]: color }} />
        ))}
      </span>
      {label}
    </span>
  );
}

export function MultiSelect({
  options, selected, onChange, placeholder = "add …", emptyHint,
}: {
  options: { id: string; label: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  emptyHint?: string;
}) {
  const avail = options.filter((o) => !selected.includes(o.id));
  const labelOf = (id: string) => options.find((o) => o.id === id)?.label ?? "—";
  return (
    <div className="multi">
      {selected.map((id) => (
        <span className="chip" key={id}>
          {labelOf(id)}
          <button type="button" onClick={() => onChange(selected.filter((x) => x !== id))} aria-label="remove">×</button>
        </span>
      ))}
      {options.length === 0 ? (
        <span className="hint">{emptyHint ?? "no options"}</span>
      ) : (
        <select value="" style={{ width: "auto", minWidth: 160 }}
          onChange={(e) => e.target.value && onChange([...selected, e.target.value])}>
          <option value="">{placeholder}</option>
          {avail.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      )}
    </div>
  );
}
