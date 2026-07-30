// A realistic sample study (hospital) to populate and exercise the data view.
// Uses the default EBIOS taxonomy field keys and wires relationships by id.
import type { EntityRecord, FieldValue, Study } from "./types";

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function makeSampleStudy(): Study {
  const ts = new Date().toISOString();
  const entities: EntityRecord[] = [];
  const add = (type: string, values: Record<string, FieldValue>): string => {
    const id = uid();
    entities.push({ id, type, values, createdAt: ts, updatedAt: ts });
    return id;
  };

  // ── Workshop 1 - Foundation ──
  const baRecords = add("business_asset", { name: "Patient records", description: "Electronic health records of all treated patients.", asset_type: "Information", criticality: 4 });
  const baEmergency = add("business_asset", { name: "Emergency care", description: "The core process of admitting and treating emergency patients.", asset_type: "Process", criticality: 4 });
  const baBilling = add("business_asset", { name: "Billing", description: "Invoicing of services to insurers and patients.", asset_type: "Function", criticality: 3 });
  const baResearch = add("business_asset", { name: "Clinical research data", description: "Anonymized datasets from ongoing clinical trials.", asset_type: "Information", criticality: 2 });
  const baScheduling = add("business_asset", { name: "Staff scheduling", description: "Rostering of clinical and support personnel.", asset_type: "Process", criticality: 1 });

  const saHis = add("supporting_asset", { name: "HIS database server", description: "Hospital Information System - central patient database.", asset_type: "Software", supports: [baRecords, baBilling] });
  const saNetwork = add("supporting_asset", { name: "Clinical network", description: "Network segment connecting wards and medical devices.", asset_type: "Network", supports: [baEmergency] });
  const saDomain = add("supporting_asset", { name: "Active Directory domain", description: "Central identity and access management for staff accounts.", asset_type: "Software", supports: [baEmergency, baBilling] });
  add("supporting_asset", { name: "Nursing staff", description: "Personnel operating emergency and ward care.", asset_type: "Personnel", supports: [baEmergency] });
  const saBackup = add("supporting_asset", { name: "Backup NAS", description: "Nightly backups of the patient database.", asset_type: "Media", supports: [baRecords] });
  add("supporting_asset", { name: "Research data warehouse", description: "Analytics store for de-identified trial data.", asset_type: "Software", supports: [baResearch] });
  add("supporting_asset", { name: "Scheduling web app", description: "Cloud rostering application for staff shifts.", asset_type: "Software", supports: [baScheduling] });

  const feDisclosure = add("feared_event", { name: "Disclosure of patient data", description: "Confidential health data leaked to unauthorized parties.", business_asset: baRecords, impact: "Confidentiality", severity: 4 });
  const feUnavailable = add("feared_event", { name: "Outage of emergency care systems", description: "Clinical systems unavailable, emergency treatment disrupted.", business_asset: baEmergency, impact: "Availability", severity: 4 });
  add("feared_event", { name: "Manipulation of billing data", description: "Invoices altered, financial loss and compliance breach.", business_asset: baBilling, impact: "Integrity", severity: 3 });

  // ── Workshop 2 - Risk Sources ──
  const roRansom = add("risk_origin", { name: "Ransomware group", description: "Financially motivated organized cybercrime crew.", category: "Cybercriminals", motivation: "Extortion via encryption and data theft", capability: 3, resources: 3, activity: 4, relevance: 4 });
  const roInsider = add("risk_origin", { name: "Disgruntled insider", description: "Employee with legitimate access and a grievance.", category: "Insider", motivation: "Revenge / financial gain", capability: 2, resources: 1, activity: 2, relevance: 2 });
  const roHacktivist = add("risk_origin", { name: "Hacktivist collective", description: "Ideologically motivated group seeking disruption and publicity.", category: "Hacktivist", motivation: "Protest / reputational damage", capability: 2, resources: 2, activity: 3, relevance: 2 });

  add("target_objective", { name: "Extort a ransom", description: "Encrypt clinical systems and demand payment.", risk_origin: roRansom, aims_at: [baEmergency, baRecords] });
  add("target_objective", { name: "Sell patient data", description: "Exfiltrate and monetize health records.", risk_origin: roRansom, aims_at: [baRecords] });
  add("target_objective", { name: "Disrupt hospital operations", description: "Take services offline to draw public attention.", risk_origin: roHacktivist, aims_at: [baEmergency] });

  // ── Workshop 3 - Strategic Scenarios ──
  const shMaint = add("stakeholder", { name: "External IT maintenance provider", description: "Third party with remote maintenance access to core systems.", category: "Maintenance / IT support", exposure: 3, reliability: 2, provides_access_to: [saHis, saNetwork] });
  const shDevice = add("stakeholder", { name: "Medical device supplier", description: "Vendor servicing networked medical devices.", category: "Supplier", exposure: 2, reliability: 3, provides_access_to: [saNetwork] });

  const ssRansom = add("strategic_scenario", { name: "Ransomware via maintenance access", description: "Attacker compromises the maintenance provider and pivots into the clinical network.", risk_origin: roRansom, stakeholder: shMaint, feared_event: feUnavailable, likelihood: 3, gravity: 4 });
  add("strategic_scenario", { name: "Supply-chain compromise via device vendor", description: "Attacker rides a device supplier's remote access to reach clinical systems.", risk_origin: roRansom, stakeholder: shDevice, feared_event: feDisclosure, likelihood: 2, gravity: 3 });
  add("strategic_scenario", { name: "Operational disruption by hacktivists", description: "Hacktivists overwhelm public-facing services to interrupt care.", risk_origin: roHacktivist, stakeholder: null, feared_event: feUnavailable, likelihood: 2, gravity: 3 });
  const ssInsider = add("strategic_scenario", { name: "Insider data exfiltration", description: "Insider copies patient records to external media.", risk_origin: roInsider, stakeholder: null, feared_event: feDisclosure, likelihood: 2, gravity: 3 });

  // ── Workshop 4 - Operational Scenario / Kill-chain ──
  const os = add("operational_scenario", { name: "Ransomware encryption of clinical systems", description: "End-to-end kill-chain from phishing to encryption of the HIS.", strategic_scenario: ssRansom, likelihood: 3, difficulty: 2 });
  const st1 = add("kill_chain_step", { name: "Phishing the maintenance provider", description: "Spear-phishing email delivers a loader.", operational_scenario: os, step_order: 1, tactic: "Initial Access", technique: "T1566 Phishing", targets_asset: saHis });
  const st2 = add("kill_chain_step", { name: "Establish persistence via scheduled task", description: "Register a scheduled task to survive reboots.", operational_scenario: os, step_order: 2, tactic: "Persistence", technique: "T1053 Scheduled Task/Job", targets_asset: saHis });
  const st3 = add("kill_chain_step", { name: "Credential dumping on maintenance host", description: "Harvest cached admin credentials.", operational_scenario: os, step_order: 3, tactic: "Credential Access", technique: "T1003 OS Credential Dumping", targets_asset: saDomain });
  const stLateral = add("kill_chain_step", { name: "Lateral movement into clinical network", description: "Pivot via remote services.", operational_scenario: os, step_order: 4, tactic: "Lateral Movement", technique: "T1021 Remote Services", targets_asset: saNetwork });
  const stExfil = add("kill_chain_step", { name: "Exfiltrate patient records", description: "Stage and copy records to an external server before encryption.", operational_scenario: os, step_order: 5, tactic: "Exfiltration", technique: "T1567 Exfiltration Over Web Service", targets_asset: saHis });
  const st6 = add("kill_chain_step", { name: "Encrypt the HIS database", description: "Deploy ransomware on the core database.", operational_scenario: os, step_order: 6, tactic: "Impact", technique: "T1486 Data Encrypted for Impact", targets_asset: saHis });

  // Second operational scenario (insider) - to exercise multiple kill-chains.
  const os2 = add("operational_scenario", { name: "Insider exfiltration of patient records", description: "A privileged insider copies patient records to removable media.", strategic_scenario: ssInsider, likelihood: 2, difficulty: 1 });
  add("kill_chain_step", { name: "Abuse valid database credentials", description: "Log in with legitimate elevated access.", operational_scenario: os2, step_order: 1, tactic: "Initial Access", technique: "T1078 Valid Accounts", targets_asset: saHis });
  const stI2 = add("kill_chain_step", { name: "Collect patient records", description: "Query and stage bulk patient records.", operational_scenario: os2, step_order: 2, tactic: "Collection", technique: "T1005 Data from Local System", targets_asset: saHis });
  const stI3 = add("kill_chain_step", { name: "Copy records to removable media", description: "Exfiltrate onto an encrypted USB drive.", operational_scenario: os2, step_order: 3, tactic: "Exfiltration", technique: "T1052 Exfiltration Over Physical Medium", targets_asset: saHis });

  // ── Compliance (framework requirements) ──
  add("requirement", { name: "Risk analysis and information system security policies", ref_id: "21(2)(a)", framework: "NIS2", category: "Governance" }); // intentionally left uncovered (gap demo)
  const reqIncident = add("requirement", { name: "Incident handling", ref_id: "21(2)(b)", framework: "NIS2", category: "Operations" });
  const reqBackup = add("requirement", { name: "Business continuity (backup, disaster recovery, crisis management)", ref_id: "21(2)(c)", framework: "NIS2", category: "Resilience" });
  const reqAuth = add("requirement", { name: "Multi-factor / continuous authentication and secured communications", ref_id: "21(2)(j)", framework: "NIS2", category: "Access" });
  const reqData = add("requirement", { name: "Data Security", ref_id: "PR.DS", framework: "NIST CSF", category: "Protect" });
  const reqAC = add("requirement", { name: "Access Control", ref_id: "AC", framework: "NIST 800-53", category: "Control family" });
  add("requirement", { name: "Contingency Planning", ref_id: "CP", framework: "NIST 800-53", category: "Control family" }); // gap demo (radar shows partial coverage)

  // ── Workshop 5 - Treatment ──
  add("security_measure", { name: "Secure email gateway & phishing training", description: "Filter malicious mail and train staff to report lures.", measure_type: "Preventive", status: "Implemented", priority: 2, implementation_level: 4, covers: [st1], protects: [saHis] });
  add("security_measure", { name: "MFA on remote maintenance access", description: "Enforce phishing-resistant MFA for all third-party access.", measure_type: "Preventive", status: "Planned", priority: 3, implementation_level: 2, covers: [st1, st3], protects: [saHis, saNetwork], fulfills: [reqAuth, reqAC] });
  add("security_measure", { name: "Network segmentation (IT / clinical VLANs)", description: "Separate clinical VLANs from corporate IT to contain lateral movement.", measure_type: "Preventive", status: "Implemented", priority: 3, implementation_level: 3, covers: [stLateral], protects: [saNetwork] });
  add("security_measure", { name: "Egress monitoring & DLP", description: "Detect and block bulk exfiltration of health records.", measure_type: "Detective", status: "Planned", priority: 3, implementation_level: 2, covers: [stExfil, stI3], protects: [saHis] });
  add("security_measure", { name: "EDR on clinical endpoints", description: "Behavioural detection of credential dumping and ransomware.", measure_type: "Detective", status: "Implemented", priority: 3, implementation_level: 3, covers: [st2, st3, st6, stI2], protects: [saHis], fulfills: [reqIncident] });
  add("security_measure", { name: "Offline immutable backups", description: "Air-gapped, immutable backups tested for restore.", measure_type: "Corrective", status: "Implemented", priority: 4, implementation_level: 4, covers: [st6], protects: [saBackup], fulfills: [reqBackup, reqData] });

  // ── Risk Quantification ──
  add("fair_assessment", { name: "Risk Quantification - clinical ransomware outage", description: "Assessment of the ransomware operational scenario against emergency care.", operational_scenario: os, contact_frequency: 3, probability_of_action: 3, threat_capability: 4, resistance_strength: 2, primary_loss: 4, secondary_loss_frequency: 3, secondary_loss: 3, overall_risk: "High" });
  add("fair_assessment", { name: "Risk Quantification - insider records leak", description: "Assessment of the insider exfiltration scenario against patient-record confidentiality.", operational_scenario: os2, contact_frequency: 2, probability_of_action: 2, threat_capability: 3, resistance_strength: 2, primary_loss: 3, secondary_loss_frequency: 3, secondary_loss: 4, overall_risk: "Medium" });

  return {
    id: uid(),
    name: "Riverside General Hospital - Core Systems (sample)",
    organization: "Riverside General Hospital Trust",
    scope: "Patient data, emergency care and billing systems within the main hospital site.",
    createdAt: ts,
    updatedAt: ts,
    entities,
  };
}
