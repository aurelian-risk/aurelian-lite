// Unit test for the additive taxonomy migration (reconcileTaxonomy).
//
// This path cannot be reached from the e2e run: that starts from empty storage and
// therefore always gets the current default taxonomy. A stored taxonomy from an older
// build only appears on a real upgrade - exactly the case where a mistake is silent and
// costs the user their customisations. Hence a dedicated test over the bundled module.
//
// Run: npm run test:taxonomy   (esbuild bundles the pure module into node_modules/.cache)
import { pathToFileURL } from "node:url";

const MOD = process.env.MOD;
if (!MOD) { console.error("set MOD=<bundled taxonomy.mjs>"); process.exit(2); }
const { DEFAULT_TAXONOMY, TAXONOMY_SCHEMA_VERSION, reconcileTaxonomy } = await import(pathToFileURL(MOD).href);

let pass = 0, fail = 0;
const ok = (name, cond) => { cond ? (pass++, console.log("✓", name)) : (fail++, console.log("✗", name)); };
const clone = (o) => JSON.parse(JSON.stringify(o));
const mt = (tax) => tax.entityTypes.find((t) => t.key === "security_measure").fields.find((f) => f.key === "measure_type").options;
const setMt = (tax, opts) => { mt(tax).length = 0; mt(tax).push(...opts); return tax; };
/** A taxonomy as an older build would have persisted it: schema 2, four effect classes. */
const stored = () => setMt(Object.assign(clone(DEFAULT_TAXONOMY), { schemaVersion: 2 }), ["Preventive", "Detective", "Corrective", "Deterrent"]);

// ── The upgrade case ──────────────────────────────────────────────────────
const old = stored();
const migrated = reconcileTaxonomy(old);
ok("stored 4-option enum gains Avoidance", mt(migrated).length === 5 && mt(migrated).includes("Avoidance"));
ok("existing options keep their order", mt(migrated).slice(0, 4).join() === "Preventive,Detective,Corrective,Deterrent");
ok("the stored taxonomy is not mutated in place", mt(old).length === 4 && old.schemaVersion === 2);
ok("schema version is stamped forward", migrated.schemaVersion === TAXONOMY_SCHEMA_VERSION);

// ── Customisations must survive ───────────────────────────────────────────
const custom = setMt(stored(), ["Technisch", "Organisatorisch"]);
ok("a replaced vocabulary is left alone", mt(reconcileTaxonomy(custom)).join() === "Technisch,Organisatorisch");
ok("a replaced vocabulary is still version-stamped", reconcileTaxonomy(custom).schemaVersion === TAXONOMY_SCHEMA_VERSION);

const extended = stored();
mt(extended).push("Compensating");
const ext = mt(reconcileTaxonomy(extended));
ok("an own extra option survives alongside the new default", ext.includes("Compensating") && ext.includes("Avoidance"));

// ── Runs at most once ─────────────────────────────────────────────────────
const pruned = setMt(stored(), ["Preventive", "Detective"]);   // the user deleted two options
const once = reconcileTaxonomy(pruned);
ok("a pruned vocabulary is topped up once", mt(once).length === 5);
ok("a deleted option is not resurrected on the next load", reconcileTaxonomy(once) === once);
ok("the current default is returned unchanged", reconcileTaxonomy(DEFAULT_TAXONOMY) === DEFAULT_TAXONOMY);
ok("re-running on a migrated taxonomy is a no-op", reconcileTaxonomy(migrated) === migrated);
ok("a taxonomy with no schemaVersion migrates", reconcileTaxonomy({ ...stored(), schemaVersion: undefined }).schemaVersion === TAXONOMY_SCHEMA_VERSION);

// ── The generic meta-schema must not be assumed to be the default one ─────
const weird = stored();
weird.entityTypes.push({ key: "my_type", label: "X", labelPlural: "Xs", group: "ws1", fields: [{ key: "k", label: "K", type: "enum", options: ["a"] }] });
ok("unknown entity types pass through untouched", reconcileTaxonomy(weird).entityTypes.find((t) => t.key === "my_type").fields[0].options.join() === "a");

const missing = stored();
missing.entityTypes = missing.entityTypes.filter((t) => t.key !== "business_asset");
ok("a taxonomy missing a default type still migrates", reconcileTaxonomy(missing).entityTypes.length === stored().entityTypes.length - 1);

const noEnums = { ...stored(), entityTypes: [{ key: "security_measure", label: "M", labelPlural: "Ms", group: "ws5", fields: [{ key: "name", label: "Name", type: "text" }] }] };
ok("a type without enum fields is left as-is", reconcileTaxonomy(noEnums).entityTypes[0].fields.length === 1);

// Migration is generic, not measure-specific: any default enum that grew is picked up.
const treat = stored();
const decision = treat.entityTypes.find((t) => t.key === "risk_treatment").fields.find((f) => f.key === "decision");
const fullDecision = decision.options.join();
decision.options = decision.options.slice(0, 2);
ok("any default enum vocabulary is reconciled, not just measure types",
  reconcileTaxonomy(treat).entityTypes.find((t) => t.key === "risk_treatment").fields.find((f) => f.key === "decision").options.join() === fullDecision);

console.log(`\n${pass}/${pass + fail} taxonomy-migration assertions passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
