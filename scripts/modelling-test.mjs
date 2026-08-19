// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Deriving requirements from the classes a catalogue states.
//
// The rules being pinned down: an object is read with its class AND every class above it;
// a requirement reaching an object twice is carried once but remembers each route; an
// object with no class yields nothing and says so; and a catalogue that classifies nothing
// derives nothing rather than everything.
//
// Method-neutral: an invented catalogue about buildings.
import assert from "node:assert";
import { pathToFileURL } from "node:url";

const MOD = process.env.MOD_M;
if (!MOD) { console.error("set MOD_M=<bundled modelling.mjs>"); process.exit(2); }
const { requirementPackage, classificationLink, withAncestors } = await import(pathToFileURL(MOD).href);

let pass = 0, fail = 0;
const ok = (name, fn) => { try { fn(); pass++; console.log("✓", name); }
  catch (e) { fail++; console.log("✗", name, "\n   ", e.message); } };

const tax = {
  schemaVersion: 1, name: "T", groups: [{ key: "g", label: "G", color: "#000" }],
  vocabularyHierarchy: { kind: { Cottage: "House", House: "Building", Shed: "Building" } },
  entityTypes: [
    { key: "place", label: "Place", labelPlural: "Places", group: "g", fields: [
      { key: "name", label: "Name", type: "text" },
      { key: "kind", label: "Kind", type: "enum", options: ["Building", "House", "Cottage", "Shed"], vocabulary: "kind" },
    ] },
    { key: "requirement", label: "Rule", labelPlural: "Rules", group: "g", fields: [
      { key: "name", label: "Name", type: "text" },
      { key: "ref_id", label: "Id", type: "text" },
      { key: "framework", label: "Set", type: "text" },
      { key: "description", label: "Text", type: "textarea" },
      { key: "applies_to", label: "Applies to", type: "text", vocabulary: "kind" },
      { key: "begruendung", label: "Why", type: "textarea" },
    ] },
  ],
};
const fw = { key: "f", name: "Building rules", source: "invented", items: [
  { ref_id: "B.1", title: "Every building", props: { applies_to: "Building" } },
  { ref_id: "H.1", title: "Houses only", props: { applies_to: "House" } },
  { ref_id: "C.1", title: "Cottages only", props: { applies_to: "Cottage" } },
  { ref_id: "S.1", title: "Sheds only", props: { applies_to: "Shed" } },
  { ref_id: "X.1", title: "Applies to nothing in particular" },
] };
const study = (records) => ({ id: "s", name: "S", createdAt: "", updatedAt: "", entities: records, log: [] });
const rec = (id, type, values) => ({ id, type, values, createdAt: "", updatedAt: "" });

ok("the classification is found from the two declarations", () => {
  const l = classificationLink(tax);
  assert.equal(l.source, "kind");
  assert.equal(l.objectType, "place");
  assert.equal(l.itemType, "requirement");
});

// The failure this guards against: a catalogue item also carries a class of its own —
// which chapter it belongs to — and some other type carries that same class. Pairing those
// would derive from whichever type was declared first.
ok("an item's OWN class is not mistaken for the classes it applies to", () => {
  const withChapter = {
    ...tax,
    entityTypes: [
      { key: "note", label: "Note", labelPlural: "Notes", group: "g", fields: [
        { key: "name", label: "Name", type: "text" },
        { key: "chapter", label: "Chapter", type: "enum", options: ["One"], vocabulary: "chapter" },
      ] },
      ...tax.entityTypes.map((t) => t.key !== "requirement" ? t : { ...t, fields: [
        // declared BEFORE applies_to, so first-match would pick it
        { key: "chapter", label: "Chapter", type: "enum", options: ["One"], vocabulary: "chapter" },
        ...t.fields,
      ] }),
    ],
  };
  const l = classificationLink(withChapter);
  assert.equal(l.objectType, "place", "the object is what a requirement applies to, not what it is filed under");
  assert.equal(l.itemField.key, "applies_to");
});

ok("a class is read with every class above it", () => {
  assert.deepEqual(withAncestors(tax, "kind", ["Cottage"]), ["Cottage", "House", "Building"]);
  assert.deepEqual(withAncestors(tax, "kind", ["Building"]), ["Building"]);
});

ok("a cycle in a hand-edited hierarchy stops instead of hanging", () => {
  const looped = { ...tax, vocabularyHierarchy: { kind: { A: "B", B: "A" } } };
  assert.deepEqual(withAncestors(looped, "kind", ["A"]), ["A", "B"]);
});

ok("inheritance decides what reaches an object", () => {
  const p = requirementPackage(tax, study([rec("1", "place", { name: "Rose Cottage", kind: "Cottage" })]), fw);
  assert.deepEqual(p.items.map((i) => i.item.ref_id).sort(), ["B.1", "C.1", "H.1"]);
  assert.equal(p.objects[0].count, 3);
  assert.deepEqual(p.objects[0].inherited, ["House", "Building"]);
});

ok("a requirement reaching two objects is carried once, remembering both", () => {
  const p = requirementPackage(tax, study([
    rec("1", "place", { name: "Rose Cottage", kind: "Cottage" }),
    rec("2", "place", { name: "Garden shed", kind: "Shed" }),
  ]), fw);
  const b1 = p.items.find((i) => i.item.ref_id === "B.1");
  assert.equal(p.items.filter((i) => i.item.ref_id === "B.1").length, 1);
  assert.equal(b1.reasons.length, 2);
  assert.ok(b1.reasons.every((r) => /\(inherited\)/.test(r)), b1.reasons.join(" | "));
});

ok("the route is named, and an inherited one is marked as inherited", () => {
  const p = requirementPackage(tax, study([rec("1", "place", { name: "Rose Cottage", kind: "Cottage" })]), fw);
  assert.equal(p.items.find((i) => i.item.ref_id === "C.1").reasons[0], "Rose Cottage — Cottage");
  assert.equal(p.items.find((i) => i.item.ref_id === "B.1").reasons[0], "Rose Cottage — Building (inherited)");
});

ok("an object with no class derives nothing, and is reported", () => {
  const p = requirementPackage(tax, study([rec("1", "place", { name: "Unknown", kind: "" })]), fw);
  assert.equal(p.items.length, 0);
  assert.deepEqual(p.unclassified.map((r) => r.values.name), ["Unknown"]);
  assert.deepEqual(p.objects, []);
});

ok("requirements the catalogue classifies nowhere are counted, not dropped in silence", () => {
  const p = requirementPackage(tax, study([rec("1", "place", { name: "A", kind: "Shed" })]), fw);
  assert.equal(p.unclassifiedItems, 1);
});

ok("what is already recorded is marked as recorded", () => {
  const p = requirementPackage(tax, study([
    rec("1", "place", { name: "A", kind: "Shed" }),
    rec("2", "requirement", { name: "Every building", ref_id: "B.1" }),
  ]), fw);
  assert.equal(p.items.find((i) => i.item.ref_id === "B.1").present, true);
  assert.equal(p.items.find((i) => i.item.ref_id === "S.1").present, false);
});

ok("a taxonomy declaring no classification derives nothing at all", () => {
  const bare = { ...tax, entityTypes: tax.entityTypes.map((t) => ({ ...t, fields: t.fields.map((f) => { const { vocabulary, ...rest } = f; return rest; }) })) };
  assert.equal(classificationLink(bare), null);
  assert.equal(requirementPackage(bare, study([]), fw), null);
});

ok("without a hierarchy only the class itself counts", () => {
  const flat = { ...tax, vocabularyHierarchy: undefined };
  const p = requirementPackage(flat, study([rec("1", "place", { name: "A", kind: "Cottage" })]), fw);
  assert.deepEqual(p.items.map((i) => i.item.ref_id), ["C.1"]);
});

console.log(`\n${pass}/${pass + fail} modelling assertions passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
