// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Search, facets and grouping for the entity tables.
//
// The rule under test is that all three are derived from the DATA. A requirement's
// framework and category are plain text fields, not enums, and they are exactly what an
// analyst wants to group by - so anything keyed off the schema would offer nothing here.
//
// Run: npm run test:tablefilter
import { pathToFileURL } from "node:url";

const need = (n) => { const v = process.env[n]; if (!v) { console.error(`set ${n}`); process.exit(2); } return v; };
const { facetsOf, filterItems, groupItems, matchesQuery, haystack, activeCount, TOOLBAR_MIN_ROWS } =
  await import(pathToFileURL(need("MOD_TF")).href);

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? (pass++, console.log("✓", name)) : (fail++, console.log("✗", name, extra)); };

// A requirement type as the app defines it: every filterable field is free text.
const TYPE = {
  key: "requirement", label: "Requirement", labelPlural: "Requirements", group: "compliance",
  fields: [
    { key: "name", label: "Title", type: "text", required: true },
    { key: "ref_id", label: "Reference ID", type: "text" },
    { key: "framework", label: "Framework", type: "text" },
    { key: "category", label: "Category", type: "text" },
    { key: "description", label: "Description", type: "textarea" },
    { key: "priority", label: "Priority", type: "scale", scaleLabels: ["low", "moderate", "high", "critical"] },
  ],
};
const display = (f, v) => {
  if (v == null || v === "") return "";
  if (f.type === "scale") return typeof v === "number" ? (f.scaleLabels?.[v - 1] ?? String(v)) : "";
  if (f.type === "ref" || f.type === "multiref") return "";
  return String(v);
};
const rec = (id, values) => ({ id, type: "requirement", values, createdAt: "", updatedAt: "" });

const ITEMS = [
  rec("1", { name: "Risk analysis", ref_id: "21(2)(a)", framework: "NIS2", category: "Governance", priority: 4, description: "Policies for risk analysis." }),
  rec("2", { name: "Incident handling", ref_id: "21(2)(b)", framework: "NIS2", category: "Operations", priority: 3 }),
  rec("3", { name: "Business continuity", ref_id: "21(2)(c)", framework: "NIS2", category: "Resilience", priority: 3 }),
  rec("4", { name: "Supply chain security", ref_id: "21(2)(d)", framework: "NIS2", category: "Supply chain", priority: 2 }),
  rec("5", { name: "Data Security", ref_id: "PR.DS", framework: "NIST CSF", category: "Protect", priority: 4 }),
  rec("6", { name: "Continuous Monitoring", ref_id: "DE.CM", framework: "NIST CSF", category: "Detect", priority: 3 }),
  rec("7", { name: "Access Control", ref_id: "AC", framework: "NIST 800-53", category: "Control family", priority: 4 }),
  rec("8", { name: "Audit and Accountability", ref_id: "AU", framework: "NIST 800-53", category: "Control family", priority: 2 }),
  rec("9", { name: "Uncategorised one", ref_id: "X1", framework: "NIST 800-53", category: "", priority: 1 }),
];

// ── what is offered ──────────────────────────────────────────────────────
const facets = facetsOf(TYPE, ITEMS, display);
const keys = facets.map((f) => f.field.key);
ok("offers the free-text fields whose values repeat", keys.includes("framework") && keys.includes("category"), keys.join(","));
ok("offers a scale field by its label", keys.includes("priority"), keys.join(","));
ok("never offers the title", !keys.includes("name"), keys.join(","));
ok("never offers free description text", !keys.includes("description"), keys.join(","));
ok("drops an identifier column, where every row differs", !keys.includes("ref_id"), keys.join(","));

const fw = facets.find((f) => f.field.key === "framework");
ok("counts each value", fw.values.find((v) => v.value === "NIS2").count === 4 && fw.values.find((v) => v.value === "NIST CSF").count === 2,
  JSON.stringify(fw.values));
ok("puts the commonest value first", fw.values[0].value === "NIS2", fw.values[0].value);
ok("a scale reads as its label, not its number",
  facets.find((f) => f.field.key === "priority").values.some((v) => v.value === "critical"));

{
  // One value everywhere is no choice; a value per row is a haystack of its own.
  const same = ITEMS.map((r) => rec(r.id, { ...r.values, framework: "NIS2" }));
  ok("a field with one value is not offered", !facetsOf(TYPE, same, display).some((f) => f.field.key === "framework"));
  const many = Array.from({ length: 30 }, (_, i) => rec(String(i), { name: `n${i}`, framework: `FW${i}` }));
  ok("a field with too many values is not offered", !facetsOf(TYPE, many, display).some((f) => f.field.key === "framework"));
}

// ── search ───────────────────────────────────────────────────────────────
ok("all words must appear, in any order and any field",
  matchesQuery(haystack(TYPE, ITEMS[0], display), "nis2 risk") && !matchesQuery(haystack(TYPE, ITEMS[0], display), "nis2 backup"));
ok("quotes keep a phrase together",
  matchesQuery(haystack(TYPE, ITEMS[3], display), '"supply chain"') && !matchesQuery(haystack(TYPE, ITEMS[3], display), '"chain supply"'));
ok("search covers the description too", filterItems(ITEMS, TYPE, "policies", {}, display).length === 1);
ok("an empty query changes nothing", filterItems(ITEMS, TYPE, "   ", {}, display).length === ITEMS.length);
ok("search is case-insensitive", filterItems(ITEMS, TYPE, "NIST csf", {}, display).length === 2);

// ── filtering ────────────────────────────────────────────────────────────
ok("values within one field are alternatives",
  filterItems(ITEMS, TYPE, "", { framework: ["NIS2", "NIST CSF"] }, display).length === 6);
ok("different fields must all hold",
  filterItems(ITEMS, TYPE, "", { framework: ["NIS2"], category: ["Operations"] }, display).length === 1);
ok("search and filters combine",
  filterItems(ITEMS, TYPE, "security", { framework: ["NIS2"] }, display).length === 1);
ok("an empty selection on a field is no filter",
  filterItems(ITEMS, TYPE, "", { framework: [] }, display).length === ITEMS.length);
ok("a filter matching nothing yields nothing, rather than everything",
  filterItems(ITEMS, TYPE, "", { framework: ["ISO 27001"] }, display).length === 0);
ok("counts what is active", activeCount({ framework: ["NIS2", "NIST CSF"], category: ["Protect"] }) === 3);

// ── grouping ─────────────────────────────────────────────────────────────
{
  const groups = groupItems(ITEMS, TYPE.fields.find((f) => f.key === "framework"), display);
  ok("groups by the displayed value", groups.length === 3, `${groups.length}`);
  ok("the biggest group comes first", groups[0].key === "NIS2" && groups[0].items.length === 4);
  ok("no row is lost", groups.reduce((n, g) => n + g.items.length, 0) === ITEMS.length);
}
{
  // A row with no value must not vanish - that would read as data loss.
  const groups = groupItems(ITEMS, TYPE.fields.find((f) => f.key === "category"), display);
  const blank = groups.find((g) => g.key === "");
  ok("rows without a value form their own group", !!blank && blank.items.length === 1);
  ok("that group comes last", groups[groups.length - 1].key === "");
}
ok("grouping by nothing yields one group", groupItems(ITEMS, null, display).length === 1);

ok("the toolbar threshold is a small table, not a large one", TOOLBAR_MIN_ROWS >= 5 && TOOLBAR_MIN_ROWS <= 15, String(TOOLBAR_MIN_ROWS));

console.log(`\n${pass}/${pass + fail} table-filter assertions passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
