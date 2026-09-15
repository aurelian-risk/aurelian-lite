// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// What a STIX object becomes in an EBIOS RM study: one rule per STIX type, each field
// naming where its value comes from. Data, not code - the import dialog shows these and
// the analyst can change them before anything is written.
//
// The vocabularies are STIX 2.1's open vocabularies (threat-actor-type-ov,
// attack-resource-level-ov, attack-sophistication-ov) read onto the taxonomy's own
// options and scales. A value outside them is a gap the projection lists, never a
// silent blank. What no STIX property answers - which business asset a target objective
// aims at, which step a measure covers - is left to the analyst, and the gap says so.
import type { StixRule } from "../../domain/stix";

/** threat-actor-type-ov → the risk source's category. */
const ACTOR_CATEGORY: Record<string, string> = {
  "nation-state": "State actor", "spy": "State actor",
  "crime-syndicate": "Cybercriminals", "criminal": "Cybercriminals",
  "activist": "Hacktivist", "hacker": "Hacktivist",
  "terrorist": "Terrorist",
  "insider-accidental": "Insider", "insider-disgruntled": "Insider",
  "competitor": "Competitor",
  "sensationalist": "Opportunist", "unknown": "Opportunist",
};
/** attack-sophistication-ov → capability 1..4. */
const SOPHISTICATION: Record<string, number> = {
  none: 1, minimal: 1, intermediate: 2, advanced: 3, expert: 3, innovator: 4, strategic: 4,
};
/** attack-resource-level-ov → resources 1..4. */
const RESOURCE_LEVEL: Record<string, number> = {
  individual: 1, club: 1, contest: 2, team: 2, organization: 3, government: 4,
};

/** An actor, whichever of the two STIX shapes it comes in. ATT&CK writes intrusion-sets
 *  (no sophistication, no resource level - those fields come back as gaps); a CTI feed
 *  writes threat-actors with both. */
const actor = (stixType: string): StixRule => ({
  stixType, entityType: "risk_origin",
  note: "An actor becomes a risk source. Its scales come from the STIX vocabularies where the feed states them; ATT&CK states neither.",
  fields: {
    name: { from: "property", path: "name" },
    description: { from: "compose", parts: [{ path: "description" }, { caption: "Aliases", path: "aliases" }, { caption: "Goals", path: "goals" }, { caption: "ATT&CK", path: "external_references.0.external_id" }] },
    category: { from: "property", path: "threat_actor_types", vocab: ACTOR_CATEGORY },
    motivation: { from: "property", path: "primary_motivation" },
    capability: { from: "property", path: "sophistication", vocab: SOPHISTICATION },
    resources: { from: "property", path: "resource_level", vocab: RESOURCE_LEVEL },
  },
});

export const STIX_RULES: StixRule[] = [
  actor("intrusion-set"),
  actor("threat-actor"),
  {
    stixType: "attack-pattern", entityType: "kill_chain_step",
    note: "A technique becomes a kill-chain step under its first tactic. Which scenario it belongs to, and its order, are the analyst's.",
    fields: {
      name: { from: "property", path: "name" },
      description: { from: "property", path: "description" },
      tactic: { from: "tactics", pick: "first" },
      technique: { from: "technique" },
    },
  },
  {
    stixType: "campaign", entityType: "operational_scenario",
    note: "A campaign becomes an operational scenario - the shell; its steps are the techniques chosen from the walk.",
    fields: {
      name: { from: "property", path: "name" },
      description: { from: "compose", parts: [{ path: "description" }, { caption: "Aliases", path: "aliases" }, { caption: "First seen", path: "first_seen" }, { caption: "Last seen", path: "last_seen" }, { caption: "Objective", path: "objective" }] },
    },
  },
  {
    stixType: "course-of-action", entityType: "security_measure",
    note: "A mitigation becomes a preventive measure, recommended, carrying its ATT&CK id so the technique-fit checks read it.",
    fields: {
      name: { from: "property", path: "name" },
      description: { from: "property", path: "description" },
      measure_type: { from: "const", value: "Preventive" },
      status: { from: "const", value: "Recommended" },
      mitigations: { from: "extId" },
    },
  },
];

/** Types the reader knows and this profile deliberately does not project: what they
 *  carry sits below the study's level of abstraction. Shown as "not mapped", with why. */
export const STIX_NOT_MAPPED: Record<string, string> = {
  "indicator": "an indicator is an observable pattern; the study models actors and techniques, not signatures",
  "observed-data": "raw observations, below the study's level",
  "sighting": "a sighting counts an observation; it can feed the calibration's own record, not a workshop",
  "malware": "named in a step's description where it matters; not a record of its own",
  "tool": "named in a step's description where it matters; not a record of its own",
  "identity": "an identity names an organisation or sector; used to filter, not imported",
  "report": "the report's text belongs in the document corpus; its objects are what is walked",
  "note": "commentary on other objects",
  "opinion": "commentary on other objects",
  "vulnerability": "a CVE is below the study's level; a technique that exploits it is the step",
  "infrastructure": "the attacker's infrastructure is not a supporting asset of the organisation",
  "location": "used to filter, not imported",
  "grouping": "a container; its members are what is walked",
};
