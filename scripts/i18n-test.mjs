// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// The display layer, exercised with words in it.
//
// The refactor that introduced it changes nothing on screen while the tables are empty,
// which is exactly why it needs this: an assertion that has never been red is not yet a
// test. Every check below registers real words and looks for them.
//
// Run: npm run test:i18n
import { pathToFileURL } from "node:url";

const MOD_I = process.env.MOD_I, MOD_T = process.env.MOD_T;
if (!MOD_I || !MOD_T) { console.error("set MOD_I=<i18n.mjs> MOD_T=<taxonomy.mjs>"); process.exit(2); }
const i18n = await import(pathToFileURL(MOD_I).href);
const tax = await import(pathToFileURL(MOD_T).href);

let pass = 0, fail = 0;
const ok = (name, cond, got) => { cond ? pass++ : fail++; console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : `  got ${JSON.stringify(got)}`}`); };

const TYPE = {
  key: "supporting_asset", label: "Supporting Asset", labelPlural: "Supporting Assets", group: "ws1",
  fields: [
    { key: "name", type: "text", label: "Name" },
    { key: "asset_type", type: "enum", label: "Type", options: ["Software", "Hardware"], optionLabels: ["Software", "Hardware"] },
    { key: "supports", type: "multiref", label: "Supports", refType: "business_asset", relation: "supports" },
    { key: "criticality", type: "scale", label: "Criticality", scaleLabels: ["low", "moderate", "high", "critical"], help: "How much depends on it" },
  ],
};
const GROUP = { key: "ws1", label: "Assets & Scope", description: "Business assets, supporting assets, feared events", color: "x" };
const F = (k) => TYPE.fields.find((f) => f.key === k);

// ── with nothing registered, everything shows what was authored ──────────────
i18n.clearOverlays(); i18n.setLanguage("de");
ok("a type shows its authored label", tax.typeLabel(TYPE) === "Supporting Asset", tax.typeLabel(TYPE));
ok("a field shows its authored label", tax.fieldLabel(F("name")) === "Name", tax.fieldLabel(F("name")));
ok("a group shows its authored description", tax.groupDescription(GROUP)?.startsWith("Business assets"), tax.groupDescription(GROUP));
ok("a scale shows its authored rung", tax.scaleLabel(F("criticality"), 4) === "critical", tax.scaleLabel(F("criticality"), 4));

// ── with words registered, every kind routes through ─────────────────────────
i18n.registerOverlay("de", {
  "type.supporting_asset.label": "Zielobjekt",
  "type.supporting_asset.plural": "Zielobjekte",
  "group.ws1.label": "Werte & Geltungsbereich",
  "group.ws1.description": "Geschäftswerte, Zielobjekte, Schadensereignisse",
  "field.name.label": "Bezeichnung",
  "field.supporting_asset.criticality.label": "Kritikalität",
  "field.criticality.help": "Wovon hängt es ab",
  "field.supports.relation": "unterstützt",
  "field.criticality.scale": ["gering", "mittel", "hoch", "kritisch"],
  "field.asset_type.options": ["Software", "Geräte"],
});
ok("the type takes its German label", tax.typeLabel(TYPE) === "Zielobjekt", tax.typeLabel(TYPE));
ok("the plural is its own key", tax.typeLabelPlural(TYPE) === "Zielobjekte", tax.typeLabelPlural(TYPE));
ok("the group label routes", tax.groupLabel(GROUP) === "Werte & Geltungsbereich", tax.groupLabel(GROUP));
ok("the group description routes", tax.groupDescription(GROUP) === "Geschäftswerte, Zielobjekte, Schadensereignisse", tax.groupDescription(GROUP));
ok("a field label routes", tax.fieldLabel(F("name")) === "Bezeichnung", tax.fieldLabel(F("name")));
ok("help routes", tax.fieldHelp(F("criticality")) === "Wovon hängt es ab", tax.fieldHelp(F("criticality")));
ok("a relation routes and reads as a verb", tax.fieldRelation(F("supports")) === "unterstützt", tax.fieldRelation(F("supports")));
ok("a scale's rungs route", tax.scaleLabel(F("criticality"), 4) === "kritisch", tax.scaleLabel(F("criticality"), 4));
ok("an option's reading routes", tax.optionLabel(F("asset_type"), "Hardware") === "Geräte", tax.optionLabel(F("asset_type"), "Hardware"));

// ── the point of the whole thing: STORED values do not move ─────────────────
ok("the option VALUE is untouched", F("asset_type").options.join(",") === "Software,Hardware", F("asset_type").options);
ok("the type KEY is untouched", TYPE.key === "supporting_asset", TYPE.key);
ok("the authored label is still on the object", TYPE.label === "Supporting Asset", TYPE.label);

// ── a field key is not unique, so a type may answer for its own ─────────────
ok("a type-scoped key beats the shared one",
  tax.fieldLabel(F("criticality"), TYPE) === "Kritikalität", tax.fieldLabel(F("criticality"), TYPE));
ok("...and without the type, the shared wording still answers",
  tax.fieldLabel(F("name")) === "Bezeichnung", tax.fieldLabel(F("name")));

// ── another language, and back ───────────────────────────────────────────────
i18n.setLanguage("en");
ok("English says nothing, so the authored label shows", tax.typeLabel(TYPE) === "Supporting Asset", tax.typeLabel(TYPE));
ok("...including the option, which is the published value", tax.optionLabel(F("asset_type"), "Hardware") === "Hardware", tax.optionLabel(F("asset_type"), "Hardware"));
i18n.setLanguage("de-AT");
ok("a regional tag falls to its language", tax.typeLabel(TYPE) === "Zielobjekt", tax.typeLabel(TYPE));

// ── a vocabulary that has grown since the table was written ─────────────────
i18n.registerOverlay("de", { "field.criticality.scale": ["gering", "mittel", "hoch"] });
ok("a list of the wrong length is refused, not shifted",
  tax.scaleLabel(F("criticality"), 4) === "critical", tax.scaleLabel(F("criticality"), 4));

// ── which language ──────────────────────────────────────────────────────────
ok("the product's own language is the fallback", i18n.resolveLanguage("de") === "de", i18n.resolveLanguage("de"));
ok("an unknown request falls back too", i18n.resolveLanguage("en", ["fr"]) === "en", i18n.resolveLanguage("en", ["fr"]));

// ── which language is ON OFFER ──────────────────────────────────────────────
// Found by the fork, at its own product, and it is a trap rather than a defect: a
// language is offered only if a table names it. Their product is authored in German with
// a German table, so a reader asking for English got German — English was unreachable in
// a product meant to have both, and the cause reads like the opposite of a mistake
// ("English needs no entries, the taxonomy is already English"). It needs no entries. It
// needs to be NAMED.
{
  const asked = (...langs) => { globalThis.navigator = { languages: langs, language: langs[0] }; };
  i18n.clearOverlays();
  const words = { de: { "type.supporting_asset.label": "Zielobjekt" } };

  asked("en-GB");
  ok("a language no table names is not on offer, even when asked for",
    i18n.resolveLanguage("de", Object.keys(words)) === "de", i18n.resolveLanguage("de", Object.keys(words)));

  const withEnglish = { ...words, en: {} };
  ok("...and an EMPTY table is how a language is offered",
    i18n.resolveLanguage("de", Object.keys(withEnglish)) === "en", i18n.resolveLanguage("de", Object.keys(withEnglish)));

  asked("de-DE");
  ok("the asked-for language wins when it is offered",
    i18n.resolveLanguage("de", Object.keys(withEnglish)) === "de", i18n.resolveLanguage("de", Object.keys(withEnglish)));
  asked("fr-FR");
  ok("an unoffered request falls to the product's own",
    i18n.resolveLanguage("de", Object.keys(withEnglish)) === "de", i18n.resolveLanguage("de", Object.keys(withEnglish)));
  asked("fr-FR", "en-US");
  ok("the first OFFERED language in the browser's list wins, not the first asked",
    i18n.resolveLanguage("de", Object.keys(withEnglish)) === "en", i18n.resolveLanguage("de", Object.keys(withEnglish)));
  delete globalThis.navigator;
}

// ── the one call the application makes at start-up ──────────────────────────
{
  i18n.clearOverlays();
  const chosen = i18n.applyProductLanguage("en", { de: { "type.supporting_asset.label": "Zielobjekt" } });
  // No browser here, so nothing is asked for and the product's own language answers.
  ok("with no browser asking, the product's language is taken", chosen === "en", chosen);
  ok("...and its words show as authored", tax.typeLabel(TYPE) === "Supporting Asset", tax.typeLabel(TYPE));
  // The tables it was given are registered, so switching to one of them works at once.
  i18n.setLanguage("de");
  ok("the product's own tables were registered by that call", tax.typeLabel(TYPE) === "Zielobjekt", tax.typeLabel(TYPE));
}

// ── engine words under product words ────────────────────────────────────────
// The completeness checks are declared in the ENGINE and shown to the reader, so their
// words belong to the engine. Without a layer of its own, every product would translate
// the same 42 strings into its own table and they would drift — a wrong translation does
// not fail under the lookup rule, it simply shows. The fork found this before writing
// them.
{
  i18n.clearOverlays();
  i18n.applyProductLanguage("en",
    { de: { "check.uncovered-steps.title": "Produktfassung" } },
    { de: { "check.uncovered-steps.title": "Motorfassung", "check.uncovered-steps.hint": "Motorhinweis" } });
  i18n.setLanguage("de");
  ok("the engine supplies its own words", i18n.t("check.uncovered-steps.hint", "authored") === "Motorhinweis",
    i18n.t("check.uncovered-steps.hint", "authored"));
  ok("...and a product overrules them where it disagrees",
    i18n.t("check.uncovered-steps.title", "authored") === "Produktfassung",
    i18n.t("check.uncovered-steps.title", "authored"));
  ok("...without having to repeat the rest", i18n.t("check.uncovered-steps.hint", "authored") === "Motorhinweis",
    i18n.t("check.uncovered-steps.hint", "authored"));
  // The engine knowing a language does not put it on the menu: the product ships it.
  i18n.clearOverlays();
  globalThis.navigator = { languages: ["de-DE"], language: "de-DE" };
  i18n.applyProductLanguage("en", {}, { de: { "check.x.title": "egal" } });
  ok("an engine table does not put a language on offer", i18n.getLanguage() === "en", i18n.getLanguage());
  delete globalThis.navigator;
}

// ── a sentence with something in the middle of it ───────────────────────────
{
  i18n.clearOverlays(); i18n.setLanguage("de");
  const EN = "Residual = position after treatment, {0} from the decision.";
  const parts = i18n.tParts("ui.riskmatrix.residual", EN);
  ok("the sentence comes back in pieces around its gap",
    parts.length === 3 && parts[1] === 0, JSON.stringify(parts));
  ok("...and the pieces are the authored words", String(parts[0]).startsWith("Residual = position"), parts[0]);

  // The point of the whole thing: another language may put the gap somewhere else.
  i18n.registerOverlay("de", { "ui.riskmatrix.residual": "Restrisiko = Lage nach der Behandlung, aus der Entscheidung {0}." });
  const de = i18n.tParts("ui.riskmatrix.residual", EN);
  ok("a translation may move the gap", de.indexOf(0) === 1 && String(de[0]).includes("Entscheidung"), JSON.stringify(de));
  ok("...and the gap is still named, not lost", de.filter((p) => typeof p === "number").length === 1, JSON.stringify(de));

  // Two gaps, and a sentence that ends on one.
  i18n.registerOverlay("de", { "x.two": "{1} vor {0}" });
  const two = i18n.tParts("x.two", "{0} before {1}");
  ok("several gaps keep their own numbers", JSON.stringify(two) === JSON.stringify([1, " vor ", 0]), JSON.stringify(two));
  ok("a sentence with no gap is one piece",
    JSON.stringify(i18n.tParts("x.none", "Plain text")) === JSON.stringify(["Plain text"]));
}

// ── a SHARED vocabulary, asked for WITH the type ────────────────────────────
// Found by the fork. The pair above only ever checked a type-SCOPED list, and the shared
// key without a type — never a shared list queried by a caller that HAS the type, which is
// what every table cell became. It wrote 13 scale entries and displayed none, silently.
{
  i18n.clearOverlays(); i18n.setLanguage("de");
  i18n.registerOverlay("de", { "field.criticality.scale": ["gering", "mittel", "hoch", "kritisch"] });
  ok("a shared scale answers a caller that holds the type",
    tax.scaleLabel(F("criticality"), 4, TYPE) === "kritisch", tax.scaleLabel(F("criticality"), 4, TYPE));
  i18n.registerOverlay("de", { "field.supporting_asset.criticality.scale": ["a", "b", "c", "sehr hoch"] });
  ok("...and a type-scoped one still wins over it",
    tax.scaleLabel(F("criticality"), 4, TYPE) === "sehr hoch", tax.scaleLabel(F("criticality"), 4, TYPE));
  i18n.clearOverlays();
  i18n.registerOverlay("de", { "field.asset_type.options": ["Software", "Geräte"] });
  ok("the same for a shared option vocabulary",
    tax.optionLabel(F("asset_type"), "Hardware", TYPE) === "Geräte", tax.optionLabel(F("asset_type"), "Hardware", TYPE));
}


// ── a type may word its own field, and the form has to let it ────────────────
// Found by the fork at its own tree and confirmed here: the form read fieldLabel(f)
// without the type, so a type-scoped key could never answer where it matters most — the
// editor, where a product's own wording for one type's field belongs.
{
  i18n.clearOverlays(); i18n.setLanguage("de");
  i18n.registerOverlay("de", {
    "field.name.label": "Bezeichnung",
    "field.supporting_asset.name.label": "Objektname",
  });
  ok("without the type, the shared wording answers", tax.fieldLabel(F("name")) === "Bezeichnung", tax.fieldLabel(F("name")));
  ok("with the type, its own wording answers", tax.fieldLabel(F("name"), TYPE) === "Objektname", tax.fieldLabel(F("name"), TYPE));
  ok("a type with nothing of its own falls back to the shared wording",
    tax.fieldLabel(F("name"), { ...TYPE, key: "other_type" }) === "Bezeichnung",
    tax.fieldLabel(F("name"), { ...TYPE, key: "other_type" }));
}


// ── the reader's own choice, and what it beats ───────────────────────────────
// A switch was added because a browser cannot say "show me this product in English while
// the rest of my machine stays German". That makes THREE answers to one question, and the
// order between them is the whole design: what the reader said, then what the browser
// asked, then what the product is written in. A preference that loses to the thing it was
// set to overrule is not a preference.
{
  // localStorage does not exist in node, and the layer must not need it to: every access
  // is wrapped, so a private window or a full quota costs the memory, not the language.
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
  };
  const asked = (...langs) => { globalThis.navigator = { languages: langs, language: langs[0] }; };
  const product = { en: {}, de: {} };

  i18n.clearOverlays(); asked("de-DE");
  ok("with nothing chosen, the browser still decides",
    i18n.applyProductLanguage("en", product) === "de", i18n.getLanguage());

  ok("both languages are on offer", i18n.languagesOffered().join() === "en,de", i18n.languagesOffered().join());

  let told = 0;
  const stop = i18n.onLanguageChange(() => { told++; });
  i18n.chooseLanguage("en");
  ok("choosing switches", i18n.getLanguage() === "en", i18n.getLanguage());
  ok("...and says so once, so the interface can redraw", told === 1, told);
  i18n.chooseLanguage("en");
  ok("...but choosing what is already shown says nothing", told === 1, told);
  stop();
  i18n.chooseLanguage("de"); i18n.chooseLanguage("en");
  ok("...and nothing after the listener has stopped", told === 1, told);

  // The point of the whole exercise: a German browser, an English reader.
  i18n.clearOverlays(); asked("de-DE");
  ok("the remembered choice beats the browser", i18n.applyProductLanguage("en", product) === "en", i18n.getLanguage());

  // And it is checked against what is offered rather than trusted. A build that drops a
  // language — or a key left on this origin by another product — would otherwise pin a
  // reader to a table that is not there, and under the lookup rule that does not fail: it
  // shows every string as authored, which reads as a broken translation, not a missing one.
  store.set("ebios_offline_lang", "fr");
  i18n.clearOverlays(); asked("de-DE");
  ok("a remembered language this build no longer offers is ignored",
    i18n.applyProductLanguage("en", product) === "de", i18n.getLanguage());

  // Same rule on the way in: an unoffered choice is refused rather than set.
  i18n.chooseLanguage("fr");
  ok("...and cannot be chosen either", i18n.getLanguage() === "de", i18n.getLanguage());

  // A product that ships one language offers one, and an interface asking what to put on
  // a switch gets an answer it can act on: nothing to choose.
  i18n.clearOverlays();
  i18n.applyProductLanguage("en", { en: {} });
  ok("one language is not a choice", i18n.languagesOffered().length === 1, i18n.languagesOffered().join());
  // Even with no table at all, a product is always readable in its own language.
  i18n.clearOverlays();
  i18n.applyProductLanguage("en", {});
  ok("...and the product's own language is on offer whether or not it named a table",
    i18n.languagesOffered().join() === "en", i18n.languagesOffered().join());

  delete globalThis.navigator; delete globalThis.localStorage;
}

console.log(`\n${pass}/${pass + fail} i18n assertions passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
