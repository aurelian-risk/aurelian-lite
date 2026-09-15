// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Generates the two ATT&CK tables the product bundles from the Enterprise STIX bundle:
//   src/domain/mitre.ts             tactics in matrix order, every live technique
//   src/domain/attackMitigations.ts the "mitigates" relationships, per technique
// The bundle is not in the repository (54 MB); fetch it to docs/sources/ first:
//   https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/enterprise-attack/enterprise-attack.json
// Run: node scripts/attack-gen.mjs [path-to-bundle]
import { readFileSync, writeFileSync } from "node:fs";

const path = process.argv[2] ?? "docs/sources/enterprise-attack.json";
const bundle = JSON.parse(readFileSync(path, "utf8"));
const live = bundle.objects.filter((o) => !o.revoked && !o.x_mitre_deprecated);
const byId = new Map(live.map((o) => [o.id, o]));
const version = live.find((o) => o.type === "x-mitre-collection")?.x_mitre_version ?? "?";
const extId = (o) => o.external_references?.find((r) => r.source_name === "mitre-attack")?.external_id;

// ── tactics, in the order the matrix lists them ──────────────────────────────
const matrix = live.find((o) => o.type === "x-mitre-matrix");
const tactics = matrix.tactic_refs.map((r) => byId.get(r)).filter(Boolean)
  .map((t) => ({ name: t.name, phase: t.x_mitre_shortname }));
const phaseName = new Map(tactics.map((t) => [t.phase, t.name]));

// ── techniques ───────────────────────────────────────────────────────────────
const patterns = live.filter((o) => o.type === "attack-pattern" && extId(o));
const parentOf = new Map();
for (const r of live) if (r.type === "relationship" && r.relationship_type === "subtechnique-of") parentOf.set(r.source_ref, r.target_ref);
const techniques = patterns.map((p) => {
  const id = extId(p);
  const parent = p.x_mitre_is_subtechnique ? byId.get(parentOf.get(p.id)) : null;
  const name = parent ? `${parent.name}: ${p.name}` : p.name;
  const tac = [...new Set((p.kill_chain_phases ?? []).filter((k) => k.kill_chain_name === "mitre-attack").map((k) => phaseName.get(k.phase_name)).filter(Boolean))];
  return { id, name, tactics: tac };
});
// A technique ATT&CK has revoked keeps its id and name and points at what replaced it,
// followed to a live one: a step recorded under T1562 three releases ago is still a
// step, and the checks must still find its mitigations.
const allById = new Map(bundle.objects.map((o) => [o.id, o]));
const revokedBy = new Map();
for (const r of bundle.objects) if (r.type === "relationship" && r.relationship_type === "revoked-by") revokedBy.set(r.source_ref, r.target_ref);
const liveIds = new Set(patterns.map((p) => p.id));
const successor = (sid) => { let cur = sid, n = 0; while (revokedBy.has(cur) && n++ < 10) cur = revokedBy.get(cur); return liveIds.has(cur) ? extId(allById.get(cur)) : null; };
const seen = new Set(techniques.map((t) => t.id));
for (const o of bundle.objects) {
  if (o.type !== "attack-pattern" || !o.revoked || !extId(o) || seen.has(extId(o))) continue;
  const to = successor(o.id);
  if (!to) continue;
  seen.add(extId(o));
  techniques.push({ id: extId(o), name: o.name, tactics: [], revokedBy: to });
}
techniques.sort((a, b) => a.id.localeCompare(b.id));

const q = (s) => JSON.stringify(s);
const head = (what) => `// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// ${what}
//
// Generated from the ATT&CK STIX bundle (enterprise-attack, version ${version}) by
// scripts/attack-gen.mjs; regenerate rather than edit.
//
// Attribution: the identifiers and names are MITRE ATT&CK® content, © The MITRE
// Corporation, reproduced under the ATT&CK terms of use
// (https://attack.mitre.org/resources/legal-and-branding/terms-of-use/). MITRE ATT&CK® is
// a registered trademark of The MITRE Corporation; this project is not affiliated with or
// endorsed by MITRE. See NOTICE. (Surfaced in the UI generically as "TTP".)
`;

const mitre = head("The TTP reference (tactics, techniques): the Enterprise matrix's tactics in its order, and every live technique and sub-technique with the tactics it appears under. Powers the kill-chain typeahead and the tactic vocabulary.") + `
export const ATTACK_VERSION = ${q(version)};

/** The tactics, in matrix order - also the \`tactic\` vocabulary of the kill-chain step. */
export const TACTICS: readonly string[] = [
${tactics.map((t) => `  ${q(t.name)},`).join("\n")}
];

/** The kill-chain phase name a STIX object carries, to the tactic's name. */
export const TACTIC_OF_PHASE: Record<string, string> = {
${tactics.map((t) => `  ${q(t.phase)}: ${q(t.name)},`).join("\n")}
};

/** Tactics earlier ATT&CK versions had and this one does not, with what took their place.
 *  A step recorded under a retired tactic keeps it until the analyst chooses; a feed still
 *  using the old phase name is read to the first successor. Maintained by hand in the
 *  generator: the bundle does not say what replaced what. */
export const RETIRED_TACTICS: Record<string, readonly string[]> = {
  "Defense Evasion": ["Stealth", "Defense Impairment"],   // split in ATT&CK v19 (2026)
};

export interface Technique {
  id: string; name: string; tactics: readonly string[];
  /** Set on a technique ATT&CK has revoked: the live technique that replaced it. */
  revokedBy?: string;
}

/** Every live technique and sub-technique, by id, plus the revoked ones with their
 *  successor. A sub-technique is named after its technique, as ATT&CK writes it
 *  ("Phishing: Spearphishing Attachment"). */
export const MITRE_TECHNIQUES: readonly Technique[] = [
${techniques.map((t) => `  { id: ${q(t.id)}, name: ${q(t.name)}, tactics: [${t.tactics.map(q).join(", ")}]${t.revokedBy ? `, revokedBy: ${q(t.revokedBy)}` : ""} },`).join("\n")}
];

const BY_ID = new Map(MITRE_TECHNIQUES.map((t) => [t.id, t]));
export const techniqueById = (id: string): Technique | undefined => BY_ID.get(id);
/** The live technique behind an id: itself, or what a revoked one was replaced by. */
export function currentTechnique(id: string): Technique | undefined {
  let t = BY_ID.get(id);
  for (let n = 0; t?.revokedBy && n < 10; n++) t = BY_ID.get(t.revokedBy);
  return t;
}

/** Datalist label / stored value, e.g. "T1566 Phishing". */
export const techniqueLabel = (t: Technique): string => \`\${t.id} \${t.name}\`;

/** The technique id written at the front of a stored value ("T1566.001 Phishing: …"). */
export const techniqueIdOf = (v: unknown): string | null =>
  typeof v === "string" ? (v.toUpperCase().match(/T\\d{4}(?:\\.\\d{3})?/)?.[0] ?? null) : null;

/** Techniques for the typeahead - all, or those of one tactic. A retired tactic offers
 *  the union of its successors, so an old step still gets suggestions. */
export function suggestTechniques(tactic?: string): readonly Technique[] {
  if (!tactic) return MITRE_TECHNIQUES.filter((t) => !t.revokedBy);
  const names = RETIRED_TACTICS[tactic] ?? [tactic];
  const inTactic = MITRE_TECHNIQUES.filter((t) => t.tactics.some((x) => names.includes(x)));
  return inTactic.length ? inTactic : MITRE_TECHNIQUES.filter((t) => !t.revokedBy);
}
`;

// ── mitigations ──────────────────────────────────────────────────────────────
const coa = new Map(live.filter((o) => o.type === "course-of-action" && extId(o)).map((o) => [o.id, { id: extId(o), name: o.name }]));
const SKIP = new Set(["M1055", "M1056"]);   // "Do Not Mitigate", "Pre-compromise": no mitigation, which an empty list says
const techById = new Map(patterns.map((p) => [p.id, p]));
const perTechnique = new Map();
const usedMit = new Map();
for (const r of live) {
  if (r.type !== "relationship" || r.relationship_type !== "mitigates") continue;
  const m = coa.get(r.source_ref), t = techById.get(r.target_ref);
  if (!m || !t || SKIP.has(m.id)) continue;
  // Sub-techniques fold onto their technique: the lookup keys on the base id.
  const base = extId(t).split(".")[0];
  if (!perTechnique.has(base)) perTechnique.set(base, new Set());
  perTechnique.get(base).add(m.id);
  usedMit.set(m.id, m.name);
}
const mitIds = [...usedMit.keys()].sort();
const techKeys = [...perTechnique.keys()].sort();

const mitigations = head("Which ATT&CK mitigation is known to act against which technique - the \"mitigates\" relationships of the Enterprise matrix. Sub-techniques are folded onto their technique. \"Do Not Mitigate\" (M1055) and \"Pre-compromise\" (M1056) are left out: they say a technique has no mitigation, which is what an EMPTY list says here.") + `
import { currentTechnique } from "./mitre";

/** The mitigations referred to below, by id. */
export const ATTACK_MITIGATIONS: Record<string, string> = {
${mitIds.map((id) => `  ${id}: ${q(usedMit.get(id))},`).join("\n")}
};

/** Per technique, the mitigations ATT&CK lists against it. A technique with no entry is
 *  one ATT&CK marks as not easily mitigated by preventive controls (the lever there is
 *  detection), or one no relationship names. */
export const TECHNIQUE_MITIGATIONS: Record<string, readonly string[]> = {
${techKeys.map((k) => `  ${k}: [${[...perTechnique.get(k)].sort().map(q).join(", ")}],`).join("\n")}
};

/** The id of a mitigation or a technique as written in a field - "M1032", "T1566.001",
 *  "M1032 Multi-factor Authentication" - reduced to what the tables key on. */
export const mitigationIds = (v: unknown): string[] =>
  typeof v === "string" ? [...new Set((v.toUpperCase().match(/M\\d{4}/g) ?? []))] : [];

/** Whether any of the given mitigations is known to act against the technique. \`null\` when
 *  the question cannot be asked: no mitigation named, or a technique the bundle does not
 *  know. \`false\` is the finding: named mitigations, known technique, no relationship. */
export function mitigates(mitigationIdsOf: string[], techniqueId: string | null): boolean | null {
  if (!mitigationIdsOf.length || !techniqueId) return null;
  const live = currentTechnique(techniqueId) ?? currentTechnique(techniqueId.split(".")[0]);
  if (!live) return null;
  const known = TECHNIQUE_MITIGATIONS[live.id.split(".")[0]] ?? [];
  return mitigationIdsOf.some((m) => known.includes(m));
}
/** Known to the bundle - live, or revoked with a live successor. */
export const isBundled = (techniqueId: string): boolean => !!currentTechnique(techniqueId.split(".")[0]);
`;

writeFileSync("src/domain/mitre.ts", mitre);
writeFileSync("src/domain/attackMitigations.ts", mitigations);
console.log(`ATT&CK ${version}: ${tactics.length} tactics, ${techniques.filter((t) => !t.revokedBy).length} live techniques (${techniques.filter((t) => t.id.includes(".") && !t.revokedBy).length} sub), ${techniques.filter((t) => t.revokedBy).length} revoked with a successor, ${techKeys.length} techniques with mitigations, ${mitIds.length} mitigations`);
