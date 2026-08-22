// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// The derivation, shown before it is applied.
//
// A catalogue that classifies its requirements already says which of them reach which
// object. This panel performs that reading — classify, widen along the hierarchy, collect,
// de-duplicate — and shows the result as an account rather than a number: which object
// brought which requirement in, what it inherited, what is already recorded, and what the
// catalogue leaves undecided. Adding writes the requirements into the study's own table,
// each carrying the rule that put it there.
import { useMemo, useState } from "react";
import type { Study, Taxonomy } from "../domain/types";
import { requirementPackage } from "../domain/modelling";
import { catalogTargets } from "../domain/catalog";
import { BUNDLED_FRAMEWORKS } from "../profile";
import { useStore } from "../domain/store";
import { getType, optionLabel } from "../domain/taxonomy";
import { Icon } from "./ui";

export function ModellingPanel({ tax, study, color }: { tax: Taxonomy; study: Study; color: string }) {
  const addEntity = useStore((s) => s.addEntity);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [fwKey, setFwKey] = useState(BUNDLED_FRAMEWORKS[0]?.key ?? "");

  const fw = BUNDLED_FRAMEWORKS.find((f) => f.key === fwKey) ?? BUNDLED_FRAMEWORKS[0];
  const pkg = useMemo(() => (fw ? requirementPackage(tax, study, fw) : null), [tax, study, fw]);
  if (!fw || !pkg) return null;

  const objectType = getType(tax, pkg.link.objectType);
  const itemType = getType(tax, pkg.link.itemType);
  const target = catalogTargets(tax).find((t) => t.type.key === pkg.link.itemType);
  const missing = pkg.items.filter((i) => !i.present);
  const cls = (c: string) => optionLabel(pkg.link.objectField, c);

  const apply = () => {
    if (!target) return;
    for (const { item, reasons } of missing) {
      // The account of why this record is here travels with it - without it the package is
      // a list somebody has to take on trust. WHERE it goes is the taxonomy's to say: a
      // fixed field name here was one product's word in shared code.
      const account = pkg.link.accountField;
      addEntity(target.type.key, {
        ...target.toValues(fw, item),
        ...(account ? { [account.key]: `Modelled from: ${reasons.join("; ")}.` } : {}),
      });
    }
    setMsg(`${missing.length} added to ${itemType?.labelPlural ?? "the table"}, each carrying the rule that placed it.`);
  };

  return (
    <div className="panel ws-accent modelling" style={{ ["--ws-color" as string]: color, marginBottom: 20 }}>
      <div className="panel-head">
        <h3>Derived from the catalogue</h3>
        <span className="badge">{pkg.items.length}</span>
        <span className="spacer" />
        {BUNDLED_FRAMEWORKS.length > 1 && (
          <select value={fwKey} onChange={(e) => setFwKey(e.target.value)} style={{ width: "auto" }}>
            {BUNDLED_FRAMEWORKS.map((f) => <option key={f.key} value={f.key}>{f.name}</option>)}
          </select>
        )}
        <button className="btn ghost sm" onClick={() => setOpen((o) => !o)}>{open ? "Hide the account" : "Show the account"}</button>
      </div>
      <div className="panel-body" style={{ padding: "10px 0 14px" }}>
        <div className="guide" style={{ marginBottom: 10 }}>
          <b>{fw.name}</b> states, per requirement, which classes of object it applies to.
          Each {objectType?.label.toLowerCase() ?? "object"} below is read with its class and every
          class above it, the requirements of those classes are collected, and one reaching an
          object twice is carried once. {pkg.items.length} follow for this study
          {missing.length > 0 ? `, of which ${missing.length} are not yet recorded` : " and all are recorded"}.
          {pkg.unclassifiedItems > 0 && <> {pkg.unclassifiedItems} requirements of the catalogue name no class at
            all and cannot be derived — they need a decision of their own.</>}
        </div>

        {pkg.unclassified.length > 0 && (
          <div className="guide warn" style={{ marginBottom: 10 }}>
            {pkg.unclassified.length} {(objectType?.labelPlural ?? "records").toLowerCase()} carry no
            class, so nothing can be derived for them: {pkg.unclassified.map((r) => String(r.values.name ?? r.id)).join(", ")}.
          </div>
        )}

        <table className="tbl">
          <thead><tr>
            <th>{objectType?.label ?? "Object"}</th><th>Class</th><th>Inherited</th><th>Requirements</th>
          </tr></thead>
          <tbody>
            {pkg.objects.map((o) => (
              <tr key={o.record.id}>
                <td><span className="name">{o.name}</span></td>
                <td>{o.own.map((c) => <span className="badge" key={c} title={c}>{cls(c)}</span>)}</td>
                <td>{o.inherited.length
                  ? o.inherited.map((c) => <span className="chip" key={c} title={c}>{cls(c)}</span>)
                  : <span className="hint">—</span>}</td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>{o.count}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {open && (
          <div style={{ maxHeight: 320, overflow: "auto", marginTop: 10 }}>
            {pkg.items.slice(0, 400).map((i) => (
              <label key={i.item.ref_id} className="ex-cand">
                <span style={{ flex: 1 }}>
                  <span className="ex-cand-name">{i.item.ref_id} · {i.item.title}</span>
                  <span className="ex-cand-snip">{i.reasons.join(" · ")}</span>
                </span>
                {i.present && <span className="badge">recorded</span>}
              </label>
            ))}
            {pkg.items.length > 400 && <div className="hint" style={{ padding: "6px 4px" }}>+{pkg.items.length - 400} more…</div>}
          </div>
        )}

        {msg && <div className="guide warn" style={{ marginTop: 10 }}>{msg}</div>}
        <div style={{ marginTop: 10 }}>
          <button className="btn primary sm modelling-apply" disabled={!missing.length} onClick={apply}>
            <Icon.plus /> {missing.length ? `Add the ${missing.length} not yet recorded` : "Nothing left to add"}
          </button>
        </div>
      </div>
    </div>
  );
}
