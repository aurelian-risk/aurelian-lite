// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// The EBIOS RM taxonomy: Aurelian Lite's product definition, expressed as data.
//
// This is a PROFILE, not engine code. Everything under src/domain and src/components
// works against whatever taxonomy it is handed; this file decides what the product is
// about - which entities exist, what fields they carry, how they group into workshops.
// A sibling product supplies its own file here and shares the entire engine.
import type { Taxonomy } from "../../domain/types";
import { EFFECT_CLASSES } from "../../domain/controls";

const SCALE = ["low", "moderate", "high", "critical"];
const LIKELIHOOD = ["low", "possible", "likely", "near-certain"];
const GRAVITY = ["negligible", "noticeable", "severe", "existential"];
const TREATMENT = ["Reduce", "Accept", "Share", "Avoid"];         // ISO 27005 risk-treatment options
const TREAT_STATUS = ["Proposed", "In progress", "Implemented", "Verified"];
const RELIABILITY = ["very low", "low", "good", "very good"];
const TACTICS = [
  "Reconnaissance", "Resource Development", "Initial Access", "Execution", "Persistence",
  "Privilege Escalation", "Defense Evasion", "Credential Access", "Discovery", "Lateral Movement",
  "Collection", "Command and Control", "Exfiltration", "Impact",
];

/** Bumped whenever the default taxonomy's vocabulary grows in a way stored studies
 *  should pick up (see reconcileTaxonomy). 3 added the "Avoidance" measure effect class. */
export const TAXONOMY_SCHEMA_VERSION = 3;

export const DEFAULT_TAXONOMY: Taxonomy = {
  schemaVersion: TAXONOMY_SCHEMA_VERSION,
  name: "EBIOS RM-inspired",
  description: "Default risk-analysis taxonomy: foundation, risk sources, strategic and operational scenarios, treatment.",
  groups: [
    { key: "ws1", label: "Assets & Scope", description: "Business assets, supporting assets, feared events", color: "var(--color-workshop-1)" },
    { key: "ws2", label: "Risk Sources", description: "Threat actors and their objectives", color: "var(--color-workshop-2)" },
    { key: "ws3", label: "Strategic Scenarios", description: "Ecosystem stakeholders and attack paths", color: "var(--color-workshop-3)" },
    { key: "ws4", label: "Operational Scenarios", description: "Kill-chains with TTPs (tactics, techniques and procedures)", color: "var(--color-workshop-4)" },
    { key: "ws5", label: "Treatment", description: "Security measures and coverage", color: "var(--color-workshop-5)" },
    { key: "quant", label: "Risk Quantification", description: "Monte-Carlo annual-loss simulation, derived from the qualitative model", color: "var(--teal-bright)" },
    { key: "compliance", label: "Compliance", description: "Framework requirements and coverage", color: "var(--violet)" },
  ],
  entityTypes: [
    {
      key: "business_asset", label: "Business Asset", labelPlural: "Business Assets", group: "ws1",
      fields: [
        { key: "name", label: "Name", type: "text", required: true },
        { key: "description", label: "Description", type: "textarea" },
        { key: "asset_type", label: "Type", type: "enum", options: ["Information", "Process", "Function"] },
        { key: "criticality", label: "Criticality", type: "scale", scaleLabels: SCALE },
      ],
    },
    {
      key: "supporting_asset", label: "Supporting Asset", labelPlural: "Supporting Assets", group: "ws1",
      fields: [
        { key: "name", label: "Name", type: "text", required: true },
        { key: "description", label: "Description", type: "textarea" },
        { key: "asset_type", label: "Type", type: "enum", options: ["Software", "Hardware", "Network", "Personnel", "Site", "Process", "Media", "Provider"] },
        { key: "supports", label: "Supports", type: "multiref", refType: "business_asset", relation: "supports" },
      ],
    },
    {
      key: "feared_event", label: "Feared Event", labelPlural: "Feared Events", group: "ws1",
      fields: [
        { key: "name", label: "Name", type: "text", required: true },
        { key: "description", label: "Description", type: "textarea" },
        { key: "business_asset", label: "Business Asset", type: "ref", refType: "business_asset", relation: "affects", required: true },
        { key: "impact", label: "Impact", type: "enum", options: ["Confidentiality", "Integrity", "Availability", "Traceability"] },
        { key: "severity", label: "Severity", type: "scale", scaleLabels: ["negligible", "noticeable", "severe", "existential"] },
      ],
    },
    {
      key: "risk_origin", label: "Risk Source", labelPlural: "Risk Sources", group: "ws2",
      fields: [
        { key: "name", label: "Name", type: "text", required: true },
        { key: "description", label: "Description", type: "textarea" },
        { key: "category", label: "Category", type: "enum", options: ["State actor", "Cybercriminals", "Hacktivist", "Terrorist", "Insider", "Competitor", "Opportunist"] },
        { key: "motivation", label: "Motivation (note)", type: "text" },
        { key: "capability", label: "Capability", type: "scale", scaleLabels: SCALE },
        { key: "resources", label: "Resources", type: "scale", scaleLabels: SCALE, column: false },
        { key: "activity", label: "Activity", type: "scale", scaleLabels: ["dormant", "occasional", "regular", "persistent"], column: false },
        { key: "relevance", label: "Relevance", type: "scale", scaleLabels: ["unlikely", "possible", "likely", "very likely"] },
      ],
    },
    {
      key: "target_objective", label: "Target Objective", labelPlural: "Target Objectives", group: "ws2",
      fields: [
        { key: "name", label: "Objective", type: "text", required: true },
        { key: "description", label: "Description", type: "textarea" },
        { key: "risk_origin", label: "Pursued by", type: "ref", refType: "risk_origin", relation: "pursued by", required: true },
        { key: "aims_at", label: "Aims at", type: "multiref", refType: "business_asset", relation: "aims at" },
      ],
    },
    {
      key: "stakeholder", label: "Stakeholder", labelPlural: "Stakeholders", group: "ws3",
      fields: [
        { key: "name", label: "Name", type: "text", required: true },
        { key: "description", label: "Description", type: "textarea" },
        { key: "category", label: "Category", type: "enum", options: ["Customer", "Supplier", "Service provider", "Partner", "Authority", "Maintenance / IT support", "Subsidiary"] },
        { key: "exposure", label: "Exposure", type: "scale", scaleLabels: SCALE },
        { key: "reliability", label: "Reliability", type: "scale", scaleLabels: RELIABILITY, polarity: "positive" },
        { key: "provides_access_to", label: "Provides access to", type: "multiref", refType: "supporting_asset", relation: "access to" },
      ],
    },
    {
      key: "strategic_scenario", label: "Strategic Scenario", labelPlural: "Strategic Scenarios", group: "ws3",
      fields: [
        { key: "name", label: "Name", type: "text", required: true },
        { key: "description", label: "Description", type: "textarea" },
        { key: "risk_origin", label: "Risk source", type: "ref", refType: "risk_origin", relation: "initiated by", required: true },
        { key: "stakeholder", label: "Enters via", type: "ref", refType: "stakeholder", relation: "enters via" },
        { key: "feared_event", label: "Causes", type: "ref", refType: "feared_event", relation: "causes" },
        { key: "likelihood", label: "Likelihood", type: "scale", scaleLabels: LIKELIHOOD },
        { key: "gravity", label: "Gravity", type: "scale", scaleLabels: GRAVITY },
      ],
    },
    {
      key: "operational_scenario", label: "Operational Scenario", labelPlural: "Operational Scenarios", group: "ws4",
      fields: [
        { key: "name", label: "Name", type: "text", required: true },
        { key: "description", label: "Description", type: "textarea" },
        { key: "strategic_scenario", label: "Implements", type: "ref", refType: "strategic_scenario", relation: "implements", required: true },
        { key: "likelihood", label: "Likelihood", type: "scale", scaleLabels: LIKELIHOOD },
        { key: "difficulty", label: "Difficulty", type: "scale", scaleLabels: ["trivial", "low", "moderate", "high"], polarity: "positive" },
      ],
    },
    {
      key: "kill_chain_step", label: "Kill-chain Step", labelPlural: "Kill-chain Steps", group: "ws4",
      fields: [
        { key: "name", label: "Step", type: "text", required: true },
        { key: "description", label: "Description", type: "textarea" },
        { key: "operational_scenario", label: "Part of scenario", type: "ref", refType: "operational_scenario", relation: "part of", required: true },
        { key: "step_order", label: "Order", type: "number" },
        { key: "tactic", label: "Tactic", type: "enum", options: TACTICS },
        { key: "technique", label: "Technique / TTP", type: "text", suggest: "mitre_technique", help: "e.g. T1566 Phishing" },
        { key: "targets_asset", label: "Targets asset", type: "ref", refType: "supporting_asset", relation: "targets" },
        { key: "predecessors", label: "Preceded by", type: "multiref", refType: "kill_chain_step", relation: "precedes", column: false, help: "Steps that must occur before this one. Within this scenario only earlier steps are offered (keeps the escalation forward); steps from other scenarios model a cascade. Choices that would create a cycle are hidden." },
        { key: "join", label: "Requires", type: "enum", options: ["all", "any"], column: false, help: "With several predecessors: 'all' = every prerequisite (AND), 'any' = one path is enough (OR)." },
      ],
    },
    {
      key: "security_measure", label: "Security Measure", labelPlural: "Security Measures", group: "ws5",
      fields: [
        { key: "name", label: "Name", type: "text", required: true },
        { key: "description", label: "Description", type: "textarea" },
        { key: "measure_type", label: "Type", type: "enum", options: [...EFFECT_CLASSES],
          help: "What the measure actually does - the quantification derives its effect from this. Preventive: blocks the attacker at the step it covers. Detective: catches him, breaking the chain before the objective. Corrective: damage control - cuts the loss once the attack succeeds. Deterrent: fewer attempts are made. Avoidance: removes the exposure, so contact is rarer." },
        { key: "status", label: "Status", type: "enum", options: ["Implemented", "Planned", "Missing", "Recommended"] },
        { key: "priority", label: "Priority", type: "scale", scaleLabels: SCALE },
        { key: "implementation_level", label: "Implementation", type: "scale", scaleLabels: ["none", "partial", "substantial", "full"], polarity: "positive" },
        // A measure on an attack step is in use by that fact, so the switch is refused in
        // that direction rather than letting the study say two things at once.
        { key: "scope", label: "In use", type: "enum", options: ["not in use", "in use"], toggle: true,
          lockedWhile: ["covers"],
          help: "Whether this measure is actually in place here. A control recorded from a library but not adopted fulfils no requirement and covers no step." },
        { key: "covers", label: "Covers steps", type: "multiref", refType: "kill_chain_step", relation: "covers" },
        { key: "protects", label: "Protects assets", type: "multiref", refType: "supporting_asset", relation: "protects" },
        { key: "fulfills", label: "Fulfills requirements", type: "multiref", refType: "requirement", relation: "fulfills" },
      ],
    },
    {
      key: "risk_treatment", label: "Risk Treatment", labelPlural: "Risk Treatments", group: "ws5",
      fields: [
        { key: "name", label: "Name", type: "text", required: true },
        { key: "strategic_scenario", label: "Treats risk", type: "ref", refType: "strategic_scenario", relation: "treats", required: true },
        { key: "decision", label: "Decision", type: "enum", options: TREATMENT },
        { key: "owner", label: "Owner", type: "text" },
        { key: "deadline", label: "Deadline / target date", type: "text" },
        { key: "status", label: "Status", type: "enum", options: TREAT_STATUS },
        { key: "justification", label: "Justification", type: "textarea", help: "Measures aren't re-listed here: they already mitigate this risk via the kill chain (measure covers step). The residual is derived from that coverage." },
      ],
    },
    {
      key: "requirement", label: "Requirement", labelPlural: "Requirements", group: "compliance",
      fields: [
        { key: "name", label: "Title", type: "text", required: true },
        { key: "ref_id", label: "Reference ID", type: "text" },
        { key: "framework", label: "Framework", type: "text" },
        { key: "category", label: "Category", type: "text" },
        // A framework is a catalogue, not a to-do list: most of it does not apply to a
        // given scope. The first option is the state a record starts in, so a seeded
        // catalogue arrives out of scope and is switched in one press at a time.
        { key: "scope", label: "In scope", type: "enum", options: ["out of scope", "in scope"], toggle: true,
          help: "Which of a framework's requirements this study answers for. Switched here rather than in the edit form, and the first thing the table filters by." },
        { key: "description", label: "Description", type: "textarea" },
      ],
    },
  ],
};
