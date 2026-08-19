// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Unit test for the additive taxonomy migration (reconcileTaxonomy).
//
// This path cannot be reached from the e2e run: that starts from empty storage and
// therefore always gets the current default taxonomy. A stored taxonomy from an older
// build only appears on a real upgrade - exactly the case where a mistake is silent and
// costs the user their customisations. Hence a dedicated test over the bundled module.
//
// Product-neutral on purpose. reconcileTaxonomy compares a stored taxonomy against the
// ACTIVE default one, so the test picks its subject out of that default - the first enum
// vocabulary with enough options to prune and regrow - rather than naming a type that only
// one product has. A sibling product built on this engine runs the same file unchanged.
//
// Run: npm run test:taxonomy   (esbuild bundles the pure module into node_modules/.cache)
import { pathToFileURL } from "node:url";

const MOD = process.env.MOD;
if (!MOD) { console.error("set MOD=<bundled taxonomy.mjs>"); process.exit(2); }
const { DEFAULT_TAXONOMY, TAXONOMY_SCHEMA_VERSION, isSetBack, reconcileTaxonomy } = await import(pathToFileURL(MOD).href);

let pass = 0, fail = 0;
const ok = (name, cond) => { cond ? (pass++, console.log("✓", name)) : (fail++, console.log("✗", name)); };
const clone = (o) => JSON.parse(JSON.stringify(o));

/** Two enum vocabularies out of the active default: one to prune and regrow, a second to
 *  show the migration is not specific to the first. Both need at least three options. */
const enums = [];
for (const t of DEFAULT_TAXONOMY.entityTypes) {
  for (const f of t.fields) if (f.type === "enum" && (f.options?.length ?? 0) >= 3) enums.push({ type: t.key, field: f.key, full: [...f.options] });
}
if (enums.length < 2) { console.error("the active taxonomy has fewer than two enum vocabularies to test against"); process.exit(2); }
const SUBJECT = enums[0], OTHER = enums.find((e) => e.type !== SUBJECT.type || e.field !== SUBJECT.field);
const NEWEST = SUBJECT.full[SUBJECT.full.length - 1];        // stands in for the option a new build added
const KEPT = SUBJECT.full.slice(0, SUBJECT.full.length - 1);

const mt = (tax) => tax.entityTypes.find((t) => t.key === SUBJECT.type).fields.find((f) => f.key === SUBJECT.field).options;
const setMt = (tax, opts) => { mt(tax).length = 0; mt(tax).push(...opts); return tax; };
/** A taxonomy as an older build would have persisted it: an earlier schema, and the
 *  subject vocabulary without its most recent option. */
const stored = () => setMt(Object.assign(clone(DEFAULT_TAXONOMY), { schemaVersion: TAXONOMY_SCHEMA_VERSION - 1 }), KEPT);

// ── The upgrade case ──────────────────────────────────────────────────────
const old = stored();
const migrated = reconcileTaxonomy(old);
ok(`a stored vocabulary gains the option the default has since added (${SUBJECT.type}.${SUBJECT.field} → ${NEWEST})`,
  mt(migrated).length === SUBJECT.full.length && mt(migrated).includes(NEWEST));
ok("existing options keep their order", mt(migrated).slice(0, KEPT.length).join() === KEPT.join());
ok("the stored taxonomy is not mutated in place", mt(old).length === KEPT.length && old.schemaVersion === TAXONOMY_SCHEMA_VERSION - 1);
ok("schema version is stamped forward", migrated.schemaVersion === TAXONOMY_SCHEMA_VERSION);

// ── Customisations must survive ───────────────────────────────────────────
const custom = setMt(stored(), ["Eigenwert A", "Eigenwert B"]);
ok("a replaced vocabulary is left alone", mt(reconcileTaxonomy(custom)).join() === "Eigenwert A,Eigenwert B");
ok("a replaced vocabulary is still version-stamped", reconcileTaxonomy(custom).schemaVersion === TAXONOMY_SCHEMA_VERSION);

const extended = stored();
mt(extended).push("Eigene Ergänzung");
const ext = mt(reconcileTaxonomy(extended));
ok("an own extra option survives alongside the new default", ext.includes("Eigene Ergänzung") && ext.includes(NEWEST));

// ── Runs at most once ─────────────────────────────────────────────────────
const pruned = setMt(stored(), KEPT.slice(0, 2));              // the user deleted some options
const once = reconcileTaxonomy(pruned);
ok("a pruned vocabulary is topped up once", mt(once).length === SUBJECT.full.length);
ok("a deleted option is not resurrected on the next load", reconcileTaxonomy(once) === once);
ok("the current default is returned unchanged", reconcileTaxonomy(DEFAULT_TAXONOMY) === DEFAULT_TAXONOMY);
ok("re-running on a migrated taxonomy is a no-op", reconcileTaxonomy(migrated) === migrated);
ok("a taxonomy with no schemaVersion migrates", reconcileTaxonomy({ ...stored(), schemaVersion: undefined }).schemaVersion === TAXONOMY_SCHEMA_VERSION);

// ── The generic meta-schema must not be assumed to be the default one ─────
const weird = stored();
weird.entityTypes.push({ key: "my_type", label: "X", labelPlural: "Xs", group: DEFAULT_TAXONOMY.groups[0].key, fields: [{ key: "k", label: "K", type: "enum", options: ["a"] }] });
ok("unknown entity types pass through untouched", reconcileTaxonomy(weird).entityTypes.find((t) => t.key === "my_type").fields[0].options.join() === "a");

const missing = stored();
missing.entityTypes = missing.entityTypes.filter((t) => t.key !== DEFAULT_TAXONOMY.entityTypes[0].key);
ok("a taxonomy missing a default type still migrates", reconcileTaxonomy(missing).entityTypes.length === stored().entityTypes.length - 1);

const noEnums = { ...stored(), entityTypes: [{ key: SUBJECT.type, label: "M", labelPlural: "Ms", group: DEFAULT_TAXONOMY.groups[0].key, fields: [{ key: "name", label: "Name", type: "text" }] }] };
ok("a type without enum fields is left as-is", reconcileTaxonomy(noEnums).entityTypes[0].fields.length === 1);

// Migration is generic: a second, unrelated vocabulary is reconciled the same way.
const second = stored();
const other = second.entityTypes.find((t) => t.key === OTHER.type).fields.find((f) => f.key === OTHER.field);
other.options = other.options.slice(0, 2);
ok(`any default enum vocabulary is reconciled, not just the first (${OTHER.type}.${OTHER.field})`,
  reconcileTaxonomy(second).entityTypes.find((t) => t.key === OTHER.type).fields.find((f) => f.key === OTHER.field).options.join() === OTHER.full.join());

// ── Where a field's values come from ──────────────────────────────────────
// A build may tell a field which published vocabulary it draws on. That declaration has
// to reach a taxonomy stored before it existed, or the field can never be refreshed from
// the source again. Driven by declaring it on the default for the length of this block,
// so the check holds whichever profile is active - and removed again afterwards.
const defField = DEFAULT_TAXONOMY.entityTypes.find((t) => t.key === SUBJECT.type).fields.find((f) => f.key === SUBJECT.field);
const hadVocabulary = defField.vocabulary;
defField.vocabulary = "test_source";
const fld = (tax) => tax.entityTypes.find((t) => t.key === SUBJECT.type).fields.find((f) => f.key === SUBJECT.field);
/** As a build that did not yet declare the source would have stored it. */
const beforeDeclared = () => { const t = stored(); delete fld(t).vocabulary; return t; };

ok("a stored field gains the declaration of where its values come from",
  fld(reconcileTaxonomy(beforeDeclared())).vocabulary === "test_source");
const ownOptions = setMt(beforeDeclared(), ["Eigenwert A", "Eigenwert B"]);
ok("...even where the user replaced the options, so the field stays refreshable",
  fld(reconcileTaxonomy(ownOptions)).vocabulary === "test_source"
  && fld(reconcileTaxonomy(ownOptions)).options.join() === "Eigenwert A,Eigenwert B");
const ownSource = beforeDeclared();
fld(ownSource).vocabulary = "meine_quelle";
ok("...but a source the user set is not overwritten",
  fld(reconcileTaxonomy(ownSource)).vocabulary === "meine_quelle");
if (hadVocabulary === undefined) delete defField.vocabulary; else defField.vocabulary = hadVocabulary;
ok("the default is left as this check found it", defField.vocabulary === hadVocabulary);

// The same silent kind of loss, one level down: a record stored before the switch existed
// carries no value for it. Reading that as "set back" would empty an existing study's
// coverage matrix, framework radar and quantification on the first load after an upgrade.
{
  const hasSwitch = (t) => t.fields.find((f) => f.toggle && f.type === "enum" && f.options?.length === 2);
  const type = DEFAULT_TAXONOMY.entityTypes.find(hasSwitch);
  const f = type && hasSwitch(type);
  if (!f) ok("the active default declares a two-state switch", false);
  else {
    const r = (values) => ({ id: "r", type: type.key, values, createdAt: "", updatedAt: "" });
    ok("a record saying nothing about its switch is in play", isSetBack(DEFAULT_TAXONOMY, r({})) === false);
    ok("...as is one whose value was cleared", isSetBack(DEFAULT_TAXONOMY, r({ [f.key]: "" })) === false);
    ok("a record recorded on the first option is set back", isSetBack(DEFAULT_TAXONOMY, r({ [f.key]: f.options[0] })) === true);
    ok("...and one on the second is in play", isSetBack(DEFAULT_TAXONOMY, r({ [f.key]: f.options[1] })) === false);
  }
}

console.log(`\n${pass}/${pass + fail} taxonomy-migration assertions passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
