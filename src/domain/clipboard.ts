// Builds an LLM-friendly, taxonomy-valid text dump of one workshop (group):
// the schema (entity types + fields) followed by the data (entities with
// relationships resolved to names). Paste into an LLM chat as grounded context.
import type { EntityRecord, FieldDef, FieldValue, Study, Taxonomy } from "./types";
import { getType, recordTitle, scaleLabel } from "./taxonomy";

function fieldSpec(f: FieldDef, tax: Taxonomy): string {
  const parts: string[] = [f.type];
  if (f.type === "enum" && f.options) parts.push(`options: ${f.options.join(" | ")}`);
  if (f.type === "scale" && f.scaleLabels) parts.push(`scale: ${f.scaleLabels.join(" < ")}`);
  if ((f.type === "ref" || f.type === "multiref") && f.refType) {
    const rt = getType(tax, f.refType);
    parts.push(`→ ${rt?.label ?? f.refType}${f.type === "multiref" ? " (many)" : ""}`);
  }
  if (f.required) parts.push("required");
  return `\`${f.key}\` (${parts.join(", ")})`;
}

function valueMd(f: FieldDef, v: FieldValue, tax: Taxonomy, study: Study): string {
  const nameOf = (id: string) => {
    const r = study.entities.find((e) => e.id === id);
    const t = r && getType(tax, r.type);
    return r && t ? recordTitle(t, r) : "?";
  };
  if (v == null || v === "") return "—";
  switch (f.type) {
    case "scale": return typeof v === "number" ? scaleLabel(f, v) : String(v);
    case "boolean": return v ? "yes" : "no";
    case "ref": return typeof v === "string" ? nameOf(v) : "—";
    case "multiref": return Array.isArray(v) && v.length ? (v as string[]).map(nameOf).join(", ") : "—";
    default: return String(v);
  }
}

export function workshopMarkdown(tax: Taxonomy, study: Study, groupKey: string): string {
  const group = tax.groups.find((g) => g.key === groupKey);
  const types = tax.entityTypes.filter((t) => t.group === groupKey);
  const L: string[] = [];

  L.push(`# EBIOS RM-inspired — ${group?.label ?? groupKey}`);
  if (group?.description) L.push(`_${group.description}_`);
  L.push("");
  L.push(`**Study:** ${study.name}${study.organization ? ` (${study.organization})` : ""}`);
  if (study.scope) L.push(`**Scope:** ${study.scope}`);
  L.push("");

  L.push("## Schema (valid taxonomy for this workshop)");
  for (const t of types) {
    L.push(`### ${t.label} \`${t.key}\``);
    for (const f of t.fields) L.push(`- ${f.label}: ${fieldSpec(f, tax)}`);
    L.push("");
  }

  L.push("## Data");
  for (const t of types) {
    const items = study.entities.filter((e) => e.type === t.key);
    L.push(`### ${t.labelPlural} (${items.length})`);
    if (items.length === 0) L.push("_none_");
    items.forEach((e: EntityRecord, i) => {
      L.push(`${i + 1}. **${recordTitle(t, e)}**`);
      for (const f of t.fields) {
        if (f.key === (t.titleField ?? "name")) continue;
        const val = valueMd(f, e.values[f.key] ?? null, tax, study);
        if (val !== "—") L.push(`   - ${f.label}: ${val}`);
      }
    });
    L.push("");
  }

  return L.join("\n").trim() + "\n";
}

/** Copy text to clipboard, with a file:// / non-secure-context fallback. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
