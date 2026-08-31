// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Taxonomy editor: view and edit the meta-schema — groups, entity types and
// their fields (including enums, scales and relationships). Import/export via
// the Data menu. This is the extensible taxonomy definition.
import { useState } from "react";
import { t as tr } from "../domain/i18n";
import type { EntityTypeDef, FieldDef, FieldType, Taxonomy } from "../domain/types";
import { useStore } from "../domain/store";
import { DataMenu } from "./DataMenu";
import { Dialog, Icon } from "./ui";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "field";
const FIELD_TYPES: FieldType[] = ["text", "textarea", "enum", "scale", "number", "boolean", "ref", "multiref"];

export function TaxonomyView() {
  const tax = useStore((s) => s.taxonomy);
  const setTaxonomy = useStore((s) => s.setTaxonomy);
  const resetTaxonomy = useStore((s) => s.resetTaxonomy);
  const [selected, setSelected] = useState<string | null>(tax.entityTypes[0]?.key ?? null);
  const [addingType, setAddingType] = useState(false);
  const [addingGroup, setAddingGroup] = useState(false);
  const [newType, setNewType] = useState({ label: "", group: tax.groups[0]?.key ?? "" });
  const [newGroup, setNewGroup] = useState({ label: "", color: "var(--color-workshop-4)" });

  const update = (fn: (t: Taxonomy) => Taxonomy) => setTaxonomy(fn(structuredClone(tax)));
  const type = tax.entityTypes.find((t) => t.key === selected) ?? null;

  const updateType = (key: string, fn: (t: EntityTypeDef) => void) =>
    update((t) => { const et = t.entityTypes.find((x) => x.key === key); if (et) fn(et); return t; });

  const addType = () => {
    if (!newType.label.trim()) return;
    let key = slug(newType.label);
    const taken = new Set(tax.entityTypes.map((t) => t.key));
    while (taken.has(key)) key += "_x";
    update((t) => {
      t.entityTypes.push({
        key, label: newType.label.trim(), labelPlural: newType.label.trim() + "s",
        group: newType.group || t.groups[0]?.key || "default",
        fields: [{ key: "name", label: "Name", type: "text", required: true }, { key: "description", label: "Description", type: "textarea" }],
      });
      return t;
    });
    setSelected(key); setNewType({ label: "", group: tax.groups[0]?.key ?? "" }); setAddingType(false);
  };

  const addGroup = () => {
    if (!newGroup.label.trim()) return;
    let key = slug(newGroup.label);
    const taken = new Set(tax.groups.map((g) => g.key));
    while (taken.has(key)) key += "_x";
    update((t) => { t.groups.push({ key, label: newGroup.label.trim(), color: newGroup.color }); return t; });
    setNewGroup({ label: "", color: "var(--color-workshop-4)" }); setAddingGroup(false);
  };

  const deleteType = (key: string) => {
    if (!confirm("Delete this entity type from the taxonomy?")) return;
    update((t) => { t.entityTypes = t.entityTypes.filter((x) => x.key !== key); return t; });
    setSelected(tax.entityTypes.find((x) => x.key !== key)?.key ?? null);
  };

  return (
    <div className="content">
      <div className="page-head">
        <div style={{ flex: 1 }}>
          <div className="eyebrow">{tr('ui.taxonomy.meta-schema', 'Meta-schema')}</div>
          <h1 className="grad-text">{tr('ui.taxonomy.taxonomy', 'Taxonomy')}</h1>
          <div className="meta" style={{ color: "var(--fg-subtle)" }}>{tax.name}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn sm" onClick={() => { if (confirm("Reset taxonomy to the built-in EBIOS RM-inspired default? Your entities are kept but may not match.")) resetTaxonomy(); }}>{tr('ui.taxonomy.reset-default', 'Reset default')}</button>
          <DataMenu label="Import / Export" />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 20, alignItems: "start" }}>
        {/* type list */}
        <div className="panel" style={{ padding: 8 }}>
          {tax.groups.map((g) => (
            <div key={g.key}>
              <div className="nav-section" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: g.color }} /> {g.label}
              </div>
              {tax.entityTypes.filter((t) => t.group === g.key).map((t) => (
                <button key={t.key} className={"nav-item" + (selected === t.key ? " active" : "")} onClick={() => setSelected(t.key)}>
                  {t.label} <span className="menu-hint" style={{ marginLeft: "auto" }}>{t.fields.length}f</span>
                </button>
              ))}
            </div>
          ))}
          <div className="menu-sep" />
          <button className="nav-item" onClick={() => setAddingType(true)}><Icon.plus /> {tr('ui.taxonomy.entity-type', 'Entity type')}</button>
          <button className="nav-item" onClick={() => setAddingGroup(true)}><Icon.plus /> {tr('ui.taxonomy.group', 'Group')}</button>
        </div>

        {/* type editor */}
        {type ? <TypeEditor key={type.key} type={type} tax={tax} updateType={updateType} onDelete={() => deleteType(type.key)} /> : (
          <div className="empty">{tr('ui.taxonomy.select-or-create-an', 'Select or create an entity type.')}</div>
        )}
      </div>

      {addingType && (
        <Dialog title={tr('ui.taxonomy.new-entity-type', 'New entity type')} onClose={() => setAddingType(false)}>
          <div className="field"><label>{tr('ui.taxonomy.label', 'Label')}</label>
            <input autoFocus value={newType.label} onChange={(e) => setNewType({ ...newType, label: e.target.value })} placeholder="e.g. Security Measure" /></div>
          <div className="field"><label>{tr('ui.taxonomy.group', 'Group')}</label>
            <select value={newType.group} onChange={(e) => setNewType({ ...newType, group: e.target.value })}>
              {tax.groups.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
            </select></div>
          <div className="dialog-actions">
            <button className="btn ghost" onClick={() => setAddingType(false)}>{tr('ui.taxonomy.cancel', 'Cancel')}</button>
            <button className="btn primary" onClick={addType} disabled={!newType.label.trim()}>{tr('ui.taxonomy.create', 'Create')}</button>
          </div>
        </Dialog>
      )}
      {addingGroup && (
        <Dialog title={tr('ui.taxonomy.new-group-tab', 'New group (tab)')} onClose={() => setAddingGroup(false)}>
          <div className="field"><label>{tr('ui.taxonomy.label', 'Label')}</label>
            <input autoFocus value={newGroup.label} onChange={(e) => setNewGroup({ ...newGroup, label: e.target.value })} placeholder="e.g. Operational Scenarios" /></div>
          <div className="field"><label>{tr('ui.taxonomy.accent-color-css', 'Accent color (CSS)')}</label>
            <input value={newGroup.color} onChange={(e) => setNewGroup({ ...newGroup, color: e.target.value })} /></div>
          <div className="dialog-actions">
            <button className="btn ghost" onClick={() => setAddingGroup(false)}>{tr('ui.taxonomy.cancel', 'Cancel')}</button>
            <button className="btn primary" onClick={addGroup} disabled={!newGroup.label.trim()}>{tr('ui.taxonomy.create', 'Create')}</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function TypeEditor({ type, tax, updateType, onDelete }: {
  type: EntityTypeDef;
  tax: Taxonomy;
  updateType: (key: string, fn: (t: EntityTypeDef) => void) => void;
  onDelete: () => void;
}) {
  const setField = (idx: number, patch: Partial<FieldDef>) =>
    updateType(type.key, (t) => { t.fields[idx] = { ...t.fields[idx], ...patch }; });
  const addField = () =>
    updateType(type.key, (t) => { t.fields.push({ key: "field_" + (t.fields.length + 1), label: "New field", type: "text" }); });
  const removeField = (idx: number) => updateType(type.key, (t) => { t.fields.splice(idx, 1); });

  return (
    <div className="panel" style={{ padding: 18 }}>
      <div className="row">
        <div className="field"><label>{tr('ui.taxonomy.label', 'Label')}</label>
          <input value={type.label} onChange={(e) => updateType(type.key, (t) => { t.label = e.target.value; })} /></div>
        <div className="field"><label>{tr('ui.taxonomy.plural', 'Plural')}</label>
          <input value={type.labelPlural} onChange={(e) => updateType(type.key, (t) => { t.labelPlural = e.target.value; })} /></div>
        <div className="field"><label>{tr('ui.taxonomy.group', 'Group')}</label>
          <select value={type.group} onChange={(e) => updateType(type.key, (t) => { t.group = e.target.value; })}>
            {tax.groups.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select></div>
      </div>
      <div className="meta mono" style={{ color: "var(--fg-subtle)", marginBottom: 12 }}>key: {type.key}</div>

      <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ fontSize: 13, flex: 1 }}>{tr('ui.taxonomy.fields', 'Fields')}</h3>
        <button className="btn sm" onClick={addField}><Icon.plus /> {tr('ui.taxonomy.field', 'Field')}</button>
      </div>

      {type.fields.map((f, idx) => (
        <div key={idx} className="field-row">
          <div className="row" style={{ gap: 8 }}>
            <input style={{ flex: "2 1 140px" }} value={f.label} onChange={(e) => setField(idx, { label: e.target.value, key: f.key })} placeholder={tr('ui.taxonomy.label', 'Label')} />
            <select style={{ flex: "1 1 110px" }} value={f.type} onChange={(e) => setField(idx, { type: e.target.value as FieldType })}>
              {FIELD_TYPES.map((ft) => <option key={ft} value={ft}>{ft}</option>)}
            </select>
            {(f.type === "ref" || f.type === "multiref") && (
              <select style={{ flex: "1 1 130px" }} value={f.refType ?? ""} onChange={(e) => setField(idx, { refType: e.target.value })}>
                <option value="">target type…</option>
                {tax.entityTypes.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            )}
            <label className="chip" style={{ cursor: "pointer" }}>
              <input type="checkbox" style={{ width: "auto" }} checked={!!f.required} onChange={(e) => setField(idx, { required: e.target.checked })} /> req
            </label>
            <button className="btn ghost sm danger" onClick={() => removeField(idx)} aria-label={tr('ui.taxonomy.remove-field', 'Remove field')}><Icon.trash /></button>
          </div>
          {f.type === "enum" && (
            <input className="mono" style={{ marginTop: 6, fontSize: 12 }} value={(f.options ?? []).join(", ")}
              onChange={(e) => setField(idx, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
              placeholder="comma,separated,options" />
          )}
          {f.type === "scale" && (
            <input className="mono" style={{ marginTop: 6, fontSize: 12 }} value={(f.scaleLabels ?? []).join(", ")}
              onChange={(e) => setField(idx, { scaleLabels: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
              placeholder="low, moderate, high, critical" />
          )}
        </div>
      ))}

      <div className="menu-sep" />
      <button className="btn ghost sm danger" onClick={onDelete}><Icon.trash /> {tr('ui.taxonomy.delete-entity-type', 'Delete entity type')}</button>
    </div>
  );
}
