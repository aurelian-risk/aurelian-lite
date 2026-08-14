// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Refreshing a taxonomy's vocabularies from the catalogue that defines them.
//
// The point of the mechanism is that a hand-typed list of a publisher's terms ages
// without anything failing. These checks pin down the three things that make the refresh
// safe to run: it only touches fields that SAY where their values come from, it never
// drops a value a record still holds, and it leaves the order of what stays alone.
//
// Method-neutral: the fixture below is an invented catalogue with invented terms.
import assert from "node:assert";
import { pathToFileURL } from "node:url";

const MOD = process.env.MOD_V;
if (!MOD) { console.error("set MOD_V=<bundled vocabulary.mjs>"); process.exit(2); }
const { catalogVocabularies, planVocabularyUpdate, applyVocabularyUpdate, topGroupOf, GROUPS_VOCABULARY } = await import(pathToFileURL(MOD).href);

let pass = 0, fail = 0;
const ok = (name, fn) => {
  try { fn(); pass++; console.log("✓", name); }
  catch (e) { fail++; console.log("✗", name, "\n   ", e.message); }
};

// A catalogue with two top-level groups, a property listing one term and one listing two.
const fw = {
  key: "demo", name: "Demo catalogue", source: "OSCAL · version 2026-01-31",
  items: [
    { ref_id: "AA.1", title: "First", section: "AA Alpha", props: { colour: "red", applies_to: "Doors, Windows" } },
    { ref_id: "AA.2", title: "Second", section: "AA Alpha / AA.1 Sub", props: { colour: "blue", applies_to: "Doors" } },
    { ref_id: "BB.1", title: "Third", section: "BB Beta", props: { colour: "red", applies_to: "Roofs", prose: "a phrase, with a comma" } },
  ],
};

const tax = () => ({
  schemaVersion: 1, name: "Demo", groups: [{ key: "g", label: "G", color: "#000" }],
  entityTypes: [{
    key: "thing", label: "Thing", labelPlural: "Things", group: "g",
    fields: [
      { key: "name", label: "Name", type: "text" },
      { key: "chapter", label: "Chapter", type: "enum", options: ["AA Alpha", "CC Gamma"], vocabulary: GROUPS_VOCABULARY },
      { key: "colour", label: "Colour", type: "enum", options: ["red", "green"], vocabulary: "colour" },
      { key: "applies_to", label: "Applies to", type: "enum", options: ["Doors"], vocabulary: "applies_to" },
      { key: "prose", label: "Prose", type: "text" },                 // no vocabulary: not touched
      { key: "unrelated", label: "Unrelated", type: "enum", options: ["x"] },
    ],
  }],
});

ok("the top-level group is read off the item's path", () => {
  assert.equal(topGroupOf("AA Alpha / AA.1 Sub"), "AA Alpha");
  assert.equal(topGroupOf(undefined), "");
});

ok("values are collected per source, groups included", () => {
  const v = catalogVocabularies(fw, [GROUPS_VOCABULARY, "colour", "applies_to"]);
  assert.deepEqual(v[GROUPS_VOCABULARY], ["AA Alpha", "BB Beta"]);
  assert.deepEqual(v.colour, ["red", "blue"]);
  assert.deepEqual(v.applies_to, ["Doors", "Windows", "Roofs"]);   // a listing counts as each
});

ok("a source nobody asked for is not collected", () => {
  const v = catalogVocabularies(fw, ["colour"]);
  assert.deepEqual(Object.keys(v), ["colour"]);
});

ok("prose is never cut at its commas, because no field declares it", () => {
  const v = catalogVocabularies(fw, [GROUPS_VOCABULARY, "colour", "applies_to"]);
  assert.ok(!Object.values(v).flat().includes("a phrase"));
});

ok("the plan covers only fields that name a source", () => {
  const changes = planVocabularyUpdate(tax(), fw);
  assert.deepEqual(changes.map((c) => c.fieldKey).sort(), ["applies_to", "chapter", "colour"]);
});

ok("...naming what is added and what the catalogue no longer lists", () => {
  const c = planVocabularyUpdate(tax(), fw).find((x) => x.fieldKey === "colour");
  assert.deepEqual(c.added, ["blue"]);
  assert.deepEqual(c.removed, ["green"]);
  assert.equal(c.keptInUse.length, 0);
});

ok("what stays keeps its place; what is new is appended", () => {
  const c = planVocabularyUpdate(tax(), fw).find((x) => x.fieldKey === "applies_to");
  assert.deepEqual(c.merged, ["Doors", "Windows", "Roofs"]);
});

// The difference that decides whether an unrelated catalogue can empty a field.
ok("extending keeps what this catalogue does not mention", () => {
  const c = planVocabularyUpdate(tax(), fw).find((x) => x.fieldKey === "colour");
  assert.deepEqual(c.merged, ["red", "green", "blue"]);        // green stays
  assert.deepEqual(c.mergedReplacing, ["red", "blue"]);        // green goes
});

ok("a field the catalogue says nothing about is left alone", () => {
  const changes = planVocabularyUpdate(tax(), fw);
  assert.ok(!changes.some((c) => c.fieldKey === "unrelated"));
});

// The rule that makes this safe to press: a record holding a retired value keeps it.
const records = [
  { id: "r1", type: "thing", values: { name: "One", colour: "green" }, createdAt: "", updatedAt: "" },
  { id: "r2", type: "thing", values: { name: "Two", colour: "red" }, createdAt: "", updatedAt: "" },
];

ok("a retired value a record still holds survives even when replacing", () => {
  const c = planVocabularyUpdate(tax(), fw, records).find((x) => x.fieldKey === "colour");
  assert.deepEqual(c.removed, ["green"]);
  assert.deepEqual(c.keptInUse, ["green"]);
  assert.ok(c.mergedReplacing.includes("green"), "the option a record uses must survive the refresh");
  assert.deepEqual(c.mergedReplacing, ["red", "blue", "green"]);
});

ok("a record of another type does not keep a value alive", () => {
  const other = [{ id: "x", type: "elsewhere", values: { colour: "green" }, createdAt: "", updatedAt: "" }];
  const c = planVocabularyUpdate(tax(), fw, other).find((x) => x.fieldKey === "colour");
  assert.deepEqual(c.keptInUse, []);
  assert.ok(!c.mergedReplacing.includes("green"));
});

// The failure this guards against: a catalogue covering another subject lists none of the
// field's terms, and taking its silence for a retirement empties the field.
ok("adding is the default, so an unrelated catalogue cannot empty a field", () => {
  const t0 = tax();
  const changes = planVocabularyUpdate(t0, fw);
  const f = (t) => t.entityTypes[0].fields.find((x) => x.key === "colour").options;
  assert.deepEqual(f(applyVocabularyUpdate(t0, changes, ["thing.colour"], fw)), ["red", "green", "blue"]);
  assert.deepEqual(f(applyVocabularyUpdate(t0, changes, ["thing.colour"], fw, undefined, "replace")), ["red", "blue"]);
});

ok("applying writes only the picked fields", () => {
  const t0 = tax();
  const changes = planVocabularyUpdate(t0, fw);
  const next = applyVocabularyUpdate(t0, changes, ["thing.colour"], fw);
  const f = (t, k) => t.entityTypes[0].fields.find((x) => x.key === k);
  assert.deepEqual(f(next, "colour").options, ["red", "green", "blue"]);
  assert.deepEqual(f(next, "applies_to").options, ["Doors"], "an unpicked field must not move");
  assert.deepEqual(f(t0, "colour").options, ["red", "green"], "the input taxonomy must not be mutated");
});

ok("...and stamps where the vocabulary came from", () => {
  const t0 = tax();
  const next = applyVocabularyUpdate(t0, planVocabularyUpdate(t0, fw), ["thing.colour"], fw, "2026-08-14T00:00:00.000Z");
  assert.equal(next.vocabularySource.name, "Demo catalogue");
  assert.equal(next.vocabularySource.version, "2026-01-31");
  assert.equal(next.vocabularySource.at, "2026-08-14T00:00:00.000Z");
});

ok("picking nothing changes nothing", () => {
  const t0 = tax();
  assert.equal(applyVocabularyUpdate(t0, planVocabularyUpdate(t0, fw), [], fw), t0);
});

ok("a second run has nothing left to add", () => {
  const t0 = tax();
  const changes = planVocabularyUpdate(t0, fw);
  const ids = changes.map((c) => `${c.typeKey}.${c.fieldKey}`);
  const added = applyVocabularyUpdate(t0, changes, ids, fw);
  assert.ok(planVocabularyUpdate(added, fw).every((c) => c.added.length === 0),
    "extending twice must find nothing new the second time");
  // Replacing settles completely: after it the catalogue's list IS the field's list.
  const replaced = applyVocabularyUpdate(t0, changes, ids, fw, undefined, "replace");
  assert.deepEqual(planVocabularyUpdate(replaced, fw), []);
});

console.log(`\n${pass}/${pass + fail} vocabulary assertions passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
