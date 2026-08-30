// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
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
  /** A circle with a bar through it: not gone, not in play. */
  ban: () => P("M12 3a9 9 0 100 18 9 9 0 000-18zM5.6 5.6l12.8 12.8"),
  canvas: () => (
    <svg className="inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="7" height="5" rx="1.5" /><rect x="14" y="15" width="7" height="5" rx="1.5" />
      <path d="M6.5 9v3a2 2 0 0 0 2 2h9" /></svg>
  ),
  search: () => (
    <svg className="inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" /></svg>
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

// Colour a scale value on a good→bad ramp (green → amber → orange → red), the
// same ramp as the kill-chain implementation bar. `positive` flips the direction:
// for positive properties (implementation, resistance, …) a HIGH value is good.
function sevColor(value: number, max: number, positive = false): string {
  const r = (value - 1) / Math.max(1, max - 1);
  const bad = positive ? 1 - r : r; // 0 = good, 1 = bad
  if (bad < 0.25) return "var(--color-state-success)";
  if (bad < 0.5) return "var(--color-state-warning)";
  if (bad < 0.75) return "color-mix(in oklch, var(--color-state-warning) 45%, var(--color-state-error))";
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

export function ScaleBadge({ value, max, label, positive }: { value: number; max: number; label: string; positive?: boolean }) {
  const color = sevColor(value, max, positive);
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

// Horizontal track-and-fill bar for a scale value (the "treatment roadmap" format
// from the viz demo): length encodes the value, colour follows the polarity ramp.
// Used in the expanded detail view so the same indicator isn't shown twice as the
// row's horizontal badge.
export function ScaleBars({ value, max, label, positive }: { value: number; max: number; label: string; positive?: boolean }) {
  const color = sevColor(value, max, positive);
  return (
    <span className="scalebars-wrap" title={label}>
      <span className="hbar"><span className="hbar-fill" style={{ width: `${(value / max) * 100}%`, background: color }} /></span>
      <span className="scalebars-lbl">{label}</span>
    </span>
  );
}

// Render a flat option list as <optgroup>s, preserving first-seen group order.
function groupOptions(opts: { id: string; label: string; group?: string }[]) {
  const order: string[] = [];
  const by = new Map<string, { id: string; label: string }[]>();
  for (const o of opts) {
    const g = o.group ?? "";
    if (!by.has(g)) { by.set(g, []); order.push(g); }
    by.get(g)!.push(o);
  }
  return order.map((g) =>
    g ? <optgroup key={g} label={g}>{by.get(g)!.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</optgroup>
      : by.get(g)!.map((o) => <option key={o.id} value={o.id}>{o.label}</option>),
  );
}

/** The value the action entry carries. Not a record id, so it cannot collide with one. */
const ADD_NEW = "__multiselect_action__";

/** Escape closes it, and the backdrop is inert to the keyboard.
 *
 *  Every drop-down here lays a full-screen catcher over the page so a click anywhere
 *  dismisses it. A catcher takes clicks and nothing else: with no key handler the menu
 *  survives Escape, and a reader who reaches for the habitual way out finds the page
 *  apparently frozen - and, in a test, a later interaction failing somewhere unrelated.
 *  One hook, used by every one of them, so the habit does not have to be remembered. */
export function useDismissOnEscape(open: boolean, close: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, close]);
}

/** The backdrop every dialog here shares. It used to take the click and ignore the key:
 *  ten dialogs swallowed Escape, while the three menus beside them closed on it. The
 *  dismissal belongs to the backdrop, not to each dialog's own copy of it. */
export function Overlay({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useDismissOnEscape(true, onClose);
  return <div className="overlay" onMouseDown={onClose}>{children}</div>;
}

export function MultiSelect({
  options, selected, onChange, placeholder = "add …", emptyHint, onClickChip, renderChipExtra, action,
}: {
  options: { id: string; label: string; group?: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  emptyHint?: string;
  /** When set, the chip label becomes a button that opens the referenced entity. */
  onClickChip?: (id: string) => void;
  /** Optional extra content rendered inside each chip (e.g. a status mini-bar). */
  renderChipExtra?: (id: string) => import("react").ReactNode;
  /** One more entry at the foot of the list, for what is NOT in it yet - a catalogue to
   *  choose from, say. Belongs here rather than beside the control: the list is where
   *  someone looks for a thing, so it is where "not there? get one" has to be. */
  action?: { label: string; onPick: () => void };
}) {
  const avail = options.filter((o) => !selected.includes(o.id));
  const labelOf = (id: string) => options.find((o) => o.id === id)?.label ?? "(?)";
  return (
    <div className="multi">
      {selected.map((id) => (
        <span className={"chip" + (onClickChip ? " clickable" : "")} key={id}
          role={onClickChip ? "button" : undefined} tabIndex={onClickChip ? 0 : undefined}
          title={onClickChip ? "Open" : undefined}
          onClick={onClickChip ? () => onClickChip(id) : undefined}
          onKeyDown={onClickChip ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClickChip(id); } } : undefined}>
          <span className="chip-lbl">{labelOf(id)}</span>
          {renderChipExtra?.(id)}
          <button type="button" onClick={(e) => { e.stopPropagation(); onChange(selected.filter((x) => x !== id)); }} aria-label="remove">×</button>
        </span>
      ))}
      {options.length === 0 && !action ? (
        <span className="hint">{emptyHint ?? "no options"}</span>
      ) : (
        <select value="" style={{ width: "auto", minWidth: 160 }}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            if (v === ADD_NEW) action?.onPick();
            else onChange([...selected, v]);
          }}>
          <option value="">{placeholder}</option>
          {avail.some((o) => o.group) ? groupOptions(avail) : avail.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          {action && avail.length > 0 && <option disabled>──────────</option>}
          {action && <option value={ADD_NEW}>{action.label}</option>}
        </select>
      )}
    </div>
  );
}
