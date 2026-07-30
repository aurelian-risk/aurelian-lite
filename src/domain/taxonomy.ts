// Default EBIOS RM-inspired taxonomy (Workshops 1–5 + risk quantification)
// expressed as a generic meta-schema, plus helpers to read/validate records.
import type {
  EntityRecord, EntityTypeDef, FieldDef, FieldValue, Taxonomy,
} from "./types";

const SCALE = ["low", "moderate", "high", "critical"];
const LIKELIHOOD = ["low", "possible", "likely", "near-certain"];
const RELIABILITY = ["very low", "low", "good", "very good"];
const RQ5 = ["very low", "low", "moderate", "high", "very high"];
const TACTICS = [
  "Reconnaissance", "Resource Development", "Initial Access", "Execution", "Persistence",
  "Privilege Escalation", "Defense Evasion", "Credential Access", "Discovery", "Lateral Movement",
  "Collection", "Command and Control", "Exfiltration", "Impact",
];

export const DEFAULT_TAXONOMY: Taxonomy = {
  schemaVersion: 2,
  name: "EBIOS RM-inspired",
  description: "Default risk-analysis taxonomy: foundation, risk sources, strategic and operational scenarios, treatment.",
  groups: [
    { key: "ws1", label: "Foundation", description: "Business assets, supporting assets, feared events", color: "var(--color-workshop-1)" },
    { key: "ws2", label: "Risk Sources", description: "Threat actors and their objectives", color: "var(--color-workshop-2)" },
    { key: "ws3", label: "Strategic Scenarios", description: "Ecosystem stakeholders and attack paths", color: "var(--color-workshop-3)" },
    { key: "ws4", label: "Operational Scenarios", description: "Kill-chains with TTPs (tactics, techniques and procedures)", color: "var(--color-workshop-4)" },
    { key: "ws5", label: "Treatment", description: "Security measures and coverage", color: "var(--color-workshop-5)" },
    { key: "fair", label: "Risk Quantification", description: "Quantitative-style risk assessment", color: "var(--teal-bright)" },
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
        { key: "gravity", label: "Gravity", type: "scale", scaleLabels: ["negligible", "noticeable", "severe", "existential"] },
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
      ],
    },
    {
      key: "security_measure", label: "Security Measure", labelPlural: "Security Measures", group: "ws5",
      fields: [
        { key: "name", label: "Name", type: "text", required: true },
        { key: "description", label: "Description", type: "textarea" },
        { key: "measure_type", label: "Type", type: "enum", options: ["Preventive", "Detective", "Corrective", "Deterrent"] },
        { key: "status", label: "Status", type: "enum", options: ["Implemented", "Planned", "Missing", "Recommended"] },
        { key: "priority", label: "Priority", type: "scale", scaleLabels: SCALE },
        { key: "implementation_level", label: "Implementation", type: "scale", scaleLabels: ["none", "partial", "substantial", "full"], polarity: "positive" },
        { key: "covers", label: "Covers steps", type: "multiref", refType: "kill_chain_step", relation: "covers" },
        { key: "protects", label: "Protects assets", type: "multiref", refType: "supporting_asset", relation: "protects" },
        { key: "fulfills", label: "Fulfills requirements", type: "multiref", refType: "requirement", relation: "fulfills" },
      ],
    },
    {
      key: "fair_assessment", label: "Risk Quantification Assessment", labelPlural: "Risk Quantification Assessments", group: "fair",
      fields: [
        { key: "name", label: "Name", type: "text", required: true },
        { key: "description", label: "Rationale", type: "textarea" },
        { key: "operational_scenario", label: "Assesses", type: "ref", refType: "operational_scenario", relation: "assesses", required: true },
        { key: "contact_frequency", label: "Contact frequency", type: "scale", scaleLabels: RQ5 },
        { key: "probability_of_action", label: "Probability of action", type: "scale", scaleLabels: RQ5 },
        { key: "threat_capability", label: "Threat capability", type: "scale", scaleLabels: RQ5 },
        { key: "resistance_strength", label: "Resistance strength", type: "scale", scaleLabels: RQ5, polarity: "positive" },
        { key: "primary_loss", label: "Primary loss magnitude", type: "scale", scaleLabels: RQ5 },
        { key: "secondary_loss_frequency", label: "Secondary loss frequency", type: "scale", scaleLabels: RQ5 },
        { key: "secondary_loss", label: "Secondary loss magnitude", type: "scale", scaleLabels: RQ5 },
        { key: "overall_risk", label: "Overall risk", type: "enum", options: ["Low", "Medium", "High", "Critical"] },
      ],
    },
    {
      key: "requirement", label: "Requirement", labelPlural: "Requirements", group: "compliance",
      fields: [
        { key: "name", label: "Title", type: "text", required: true },
        { key: "ref_id", label: "Reference ID", type: "text" },
        { key: "framework", label: "Framework", type: "text" },
        { key: "category", label: "Category", type: "text" },
        { key: "description", label: "Description", type: "textarea" },
      ],
    },
  ],
};

// ── Helpers ────────────────────────────────────────────────────────────

export function getType(tax: Taxonomy, key: string): EntityTypeDef | undefined {
  return tax.entityTypes.find((t) => t.key === key);
}

export function getGroup(tax: Taxonomy, key: string) {
  return tax.groups.find((g) => g.key === key);
}

export function titleField(t: EntityTypeDef): string {
  return t.titleField ?? (t.fields.find((f) => f.type === "text")?.key ?? "name");
}

export function recordTitle(t: EntityTypeDef, r: EntityRecord): string {
  const v = r.values[titleField(t)];
  return typeof v === "string" && v.trim() ? v : "(untitled)";
}

/** Fields shown as table columns: everything non-textarea except the title. */
export function columnFields(t: EntityTypeDef): FieldDef[] {
  const title = titleField(t);
  return t.fields.filter(
    (f) => f.key !== title && f.type !== "textarea" && f.column !== false,
  );
}

export function refFields(t: EntityTypeDef): FieldDef[] {
  return t.fields.filter((f) => f.type === "ref" || f.type === "multiref");
}

export function emptyValues(t: EntityTypeDef): Record<string, FieldValue> {
  const v: Record<string, FieldValue> = {};
  for (const f of t.fields) {
    switch (f.type) {
      case "scale": v[f.key] = 2; break;
      case "number": v[f.key] = 0; break;
      case "boolean": v[f.key] = false; break;
      case "multiref": v[f.key] = []; break;
      case "ref": v[f.key] = null; break;
      case "enum": v[f.key] = f.options?.[0] ?? ""; break;
      default: v[f.key] = "";
    }
  }
  return v;
}

export function validateRecord(t: EntityTypeDef, values: Record<string, FieldValue>): string | null {
  for (const f of t.fields) {
    if (!f.required) continue;
    const v = values[f.key];
    const empty =
      v == null || v === "" || (Array.isArray(v) && v.length === 0);
    if (empty) return `"${f.label}" is required.`;
  }
  return null;
}

export function scaleMax(f: FieldDef): number {
  return f.scaleLabels?.length ?? 4;
}

export function scaleLabel(f: FieldDef, value: number): string {
  return f.scaleLabels?.[value - 1] ?? String(value);
}
