// A realistic sample study (hospital) to populate and exercise the data view.
// Uses the default EBIOS taxonomy field keys and wires relationships by id.
import type { EntityRecord, FieldValue, Study } from "./types";
import { hashValues, sealLog, type LogInput } from "./audit";

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
  const baRecords = add("business_asset", { name: "Patient records", description: "The complete electronic health records of every patient the hospital has treated - diagnoses, medications, lab and imaging results. Legally protected special-category data whose confidentiality and integrity are paramount; loss or leakage triggers mandatory breach notification.", asset_type: "Information", criticality: 4 });
  const baEmergency = add("business_asset", { name: "Emergency care", description: "The hospital's round-the-clock core process of admitting, triaging and treating emergency patients. It depends on the clinical systems and network being available; any interruption is a direct threat to patient safety and life.", asset_type: "Process", criticality: 4 });
  const baBilling = add("business_asset", { name: "Billing", description: "Invoicing of treatments and services to statutory and private insurers and to patients, and reconciliation of the payments received. Underpins the hospital's cash flow and its regulatory reporting.", asset_type: "Function", criticality: 3 });
  const baResearch = add("business_asset", { name: "Clinical research data", description: "De-identified datasets from the hospital's ongoing clinical trials, shared with academic partners under strict data-use agreements. Valuable but not life-critical.", asset_type: "Information", criticality: 2 });
  const baScheduling = add("business_asset", { name: "Staff scheduling", description: "Rostering and shift planning for clinical and support personnel across the wards, theatres and the emergency department. Disruption is inconvenient rather than dangerous.", asset_type: "Process", criticality: 1 });

  const saHis = add("supporting_asset", { name: "HIS database server", description: "Hospital Information System - central patient database.", asset_type: "Software", supports: [baRecords, baBilling] });
  const saNetwork = add("supporting_asset", { name: "Clinical network", description: "Network segment connecting wards and medical devices.", asset_type: "Network", supports: [baEmergency] });
  const saDomain = add("supporting_asset", { name: "Active Directory domain", description: "Central identity and access management for staff accounts.", asset_type: "Software", supports: [baEmergency, baBilling] });
  add("supporting_asset", { name: "Nursing staff", description: "Personnel operating emergency and ward care.", asset_type: "Personnel", supports: [baEmergency] });
  const saBackup = add("supporting_asset", { name: "Backup NAS", description: "Nightly backups of the patient database.", asset_type: "Media", supports: [baRecords] });
  add("supporting_asset", { name: "Research data warehouse", description: "Analytics store for de-identified trial data.", asset_type: "Software", supports: [baResearch] });
  add("supporting_asset", { name: "Scheduling web app", description: "Cloud rostering application for staff shifts.", asset_type: "Software", supports: [baScheduling] });

  const feDisclosure = add("feared_event", { name: "Disclosure of patient data", description: "Confidential health records are exposed to, or exfiltrated by, unauthorized parties. A reportable breach of special-category data carrying regulatory fines, mandatory patient notification and lasting reputational harm.", business_asset: baRecords, impact: "Confidentiality", severity: 4 });
  const feUnavailable = add("feared_event", { name: "Outage of emergency care systems", description: "The clinical systems supporting emergency care become unavailable, forcing ambulance diversion, cancellation of procedures and a fallback to paper records - an immediate risk to patient safety.", business_asset: baEmergency, impact: "Availability", severity: 4 });
  add("feared_event", { name: "Manipulation of billing data", description: "Invoices or payment records are altered, causing financial loss, disputes with insurers and a compliance breach that may trigger an audit.", business_asset: baBilling, impact: "Integrity", severity: 3 });

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

  const ssRansom = add("strategic_scenario", { name: "Ransomware via maintenance access", description: "A financially-motivated ransomware crew compromises the external IT-maintenance provider and abuses its standing remote access to pivot from the maintenance host into the clinical network, ending in encryption of the core systems and an extortion demand.", risk_origin: roRansom, stakeholder: shMaint, feared_event: feUnavailable, likelihood: 3, gravity: 4 });
  add("strategic_scenario", { name: "Supply-chain compromise via device vendor", description: "The attacker rides the remote-service connection of a networked-medical-device supplier to reach clinical systems and quietly exfiltrate patient data, exploiting trust in the third party rather than breaching the perimeter directly.", risk_origin: roRansom, stakeholder: shDevice, feared_event: feDisclosure, likelihood: 2, gravity: 3 });
  add("strategic_scenario", { name: "Operational disruption by hacktivists", description: "An ideologically-motivated collective overwhelms the hospital's public-facing services with a denial-of-service campaign to interrupt care and draw media attention to their cause.", risk_origin: roHacktivist, stakeholder: null, feared_event: feUnavailable, likelihood: 2, gravity: 3 });
  const ssInsider = add("strategic_scenario", { name: "Insider data exfiltration", description: "A privileged, disgruntled insider abuses legitimate database access to copy bulk patient records onto external media, for revenge or resale, leaving few of the network traces an outside attacker would.", risk_origin: roInsider, stakeholder: null, feared_event: feDisclosure, likelihood: 2, gravity: 3 });

  // ── Workshop 4 - Operational Scenario / Kill-chain ──
  const os = add("operational_scenario", { name: "Ransomware encryption of clinical systems", description: "The full end-to-end kill chain a ransomware operator would follow: an initial spear-phish of the maintenance provider, persistence on the maintenance host, theft of cached admin credentials, lateral movement into the clinical network, exfiltration of patient records for double extortion, and finally encryption of the Hospital Information System.", strategic_scenario: ssRansom, likelihood: 3, difficulty: 2 });
  const st1 = add("kill_chain_step", { name: "Phishing the maintenance provider", description: "Spear-phishing email delivers a loader.", operational_scenario: os, step_order: 1, tactic: "Initial Access", technique: "T1566 Phishing", targets_asset: saHis });
  const st2 = add("kill_chain_step", { name: "Establish persistence via scheduled task", description: "Register a scheduled task to survive reboots.", operational_scenario: os, step_order: 2, tactic: "Persistence", technique: "T1053 Scheduled Task/Job", targets_asset: saHis, predecessors: [st1] });
  const st3 = add("kill_chain_step", { name: "Credential dumping on maintenance host", description: "Harvest cached admin credentials.", operational_scenario: os, step_order: 3, tactic: "Credential Access", technique: "T1003 OS Credential Dumping", targets_asset: saDomain, predecessors: [st1] });
  const stLateral = add("kill_chain_step", { name: "Lateral movement into clinical network", description: "Pivot via remote services.", operational_scenario: os, step_order: 4, tactic: "Lateral Movement", technique: "T1021 Remote Services", targets_asset: saNetwork, predecessors: [st2, st3], join: "all" });
  const stExfil = add("kill_chain_step", { name: "Exfiltrate patient records", description: "Stage and copy records to an external server before encryption.", operational_scenario: os, step_order: 5, tactic: "Exfiltration", technique: "T1567 Exfiltration Over Web Service", targets_asset: saHis, predecessors: [stLateral] });
  const st6 = add("kill_chain_step", { name: "Encrypt the HIS database", description: "Deploy ransomware on the core database.", operational_scenario: os, step_order: 6, tactic: "Impact", technique: "T1486 Data Encrypted for Impact", targets_asset: saHis, predecessors: [stLateral] });

  // Second operational scenario (insider) - to exercise multiple kill-chains.
  const os2 = add("operational_scenario", { name: "Insider exfiltration of patient records", description: "A shorter, quieter chain: a privileged insider logs in with legitimate elevated credentials, queries and stages bulk patient records, and copies them onto an encrypted USB drive - producing few of the malware or lateral-movement artefacts an external attacker would leave.", strategic_scenario: ssInsider, likelihood: 2, difficulty: 1 });
  const stI1 = add("kill_chain_step", { name: "Abuse valid database credentials", description: "Log in with legitimate elevated access.", operational_scenario: os2, step_order: 1, tactic: "Initial Access", technique: "T1078 Valid Accounts", targets_asset: saHis });
  const stI2 = add("kill_chain_step", { name: "Collect patient records", description: "Query and stage bulk patient records.", operational_scenario: os2, step_order: 2, tactic: "Collection", technique: "T1005 Data from Local System", targets_asset: saHis, predecessors: [stI1] });
  const stI3 = add("kill_chain_step", { name: "Copy records to removable media", description: "Exfiltrate onto an encrypted USB drive.", operational_scenario: os2, step_order: 3, tactic: "Exfiltration", technique: "T1052 Exfiltration Over Physical Medium", targets_asset: saHis, predecessors: [stI2] });

  // ── Compliance (framework requirements) ──
  add("requirement", { name: "Risk analysis and information system security policies", ref_id: "21(2)(a)", framework: "NIS2", category: "Governance" }); // intentionally left uncovered (gap demo)
  const reqIncident = add("requirement", { name: "Incident handling", ref_id: "21(2)(b)", framework: "NIS2", category: "Operations" });
  const reqBackup = add("requirement", { name: "Business continuity (backup, disaster recovery, crisis management)", ref_id: "21(2)(c)", framework: "NIS2", category: "Resilience" });
  const reqAuth = add("requirement", { name: "Multi-factor / continuous authentication and secured communications", ref_id: "21(2)(j)", framework: "NIS2", category: "Access" });
  const reqData = add("requirement", { name: "Data Security", ref_id: "PR.DS", framework: "NIST CSF", category: "Protect" });
  const reqAC = add("requirement", { name: "Access Control", ref_id: "AC", framework: "NIST 800-53", category: "Control family" });
  add("requirement", { name: "Contingency Planning", ref_id: "CP", framework: "NIST 800-53", category: "Control family" }); // gap demo (radar shows partial coverage)

  // ── Workshop 5 - Treatment ──
  add("security_measure", { name: "Secure email gateway & phishing training", description: "A secure email gateway filters malicious attachments and links, backed by regular phishing-awareness training so staff recognise and report the lures that would otherwise deliver the initial loader through the maintenance channel.", measure_type: "Preventive", status: "Implemented", priority: 2, implementation_level: 4, covers: [st1], protects: [saHis] });
  add("security_measure", { name: "MFA on remote maintenance access", description: "Phishing-resistant multi-factor authentication enforced on all remote and third-party maintenance access, so stolen or phished credentials alone cannot open a session or be replayed after a credential dump.", measure_type: "Preventive", status: "Planned", priority: 3, implementation_level: 2, covers: [st1, st3], protects: [saHis, saNetwork], fulfills: [reqAuth, reqAC] });
  add("security_measure", { name: "Network segmentation (IT / clinical VLANs)", description: "The clinical VLANs are firewalled off from the corporate IT network so that an attacker who lands in IT cannot move laterally into the ward and medical-device networks unimpeded, containing the blast radius of an intrusion.", measure_type: "Preventive", status: "Implemented", priority: 3, implementation_level: 3, covers: [stLateral], protects: [saNetwork] });
  add("security_measure", { name: "Egress monitoring & DLP", description: "Egress monitoring and data-loss-prevention rules detect and block bulk transfers of health records to external destinations, whether staged over a web service before ransomware or copied to removable media by an insider.", measure_type: "Detective", status: "Planned", priority: 3, implementation_level: 2, covers: [stExfil, stI3], protects: [saHis] });
  add("security_measure", { name: "EDR on clinical endpoints", description: "Endpoint detection and response on clinical endpoints and servers flags the tell-tale behaviour of credential dumping, suspicious scheduled tasks and mass file encryption, giving the SOC a chance to contain the intrusion before impact.", measure_type: "Detective", status: "Implemented", priority: 3, implementation_level: 3, covers: [st2, st3, st6, stI2], protects: [saHis], fulfills: [reqIncident] });
  add("security_measure", { name: "Offline immutable backups", description: "Air-gapped, immutable backups of the patient database with regular restore drills, so that even if the Hospital Information System is encrypted the hospital can recover within hours rather than paying a ransom.", measure_type: "Corrective", status: "Implemented", priority: 4, implementation_level: 4, covers: [st6], protects: [saBackup], fulfills: [reqBackup, reqData] });
  // The two measures below act on the ends of the chain rather than on its middle:
  // deterrence lowers how often an attempt is made at all, avoidance removes the
  // exposure the attempt would need. They are what the effect classes are for.
  add("security_measure", { name: "Audited access with published monitoring notice", description: "Access to the patient database is logged per record and staff are told, in writing and at login, that access is audited and misuse is a disciplinary and criminal matter - a deterrent aimed at the insider who would otherwise assume the queries go unnoticed.", measure_type: "Deterrent", status: "Implemented", priority: 2, implementation_level: 3, covers: [stI2], protects: [saHis] });
  add("security_measure", { name: "Decommission the legacy maintenance gateway", description: "The permanently open vendor maintenance gateway is removed and replaced by access brokered on request, so the standing external entry point the ransomware chain relies on no longer exists to be attacked.", measure_type: "Avoidance", status: "Planned", priority: 4, implementation_level: 1, protects: [saNetwork, saHis] });

  // Risk treatment: decision + owner + residual risk after the measures. Two risks
  // are treated (they move down/left in the residual matrix); the others stay put.
  const trRansom = add("risk_treatment", { name: "Treat: Ransomware via maintenance access", strategic_scenario: ssRansom, decision: "Reduce", owner: "CISO", deadline: "2026-Q4", status: "In progress", justification: "Reduce rather than accept: the kill chain can be broken cost-effectively at the maintenance-access and lateral-movement stages, and the residual is derived from that coverage. Still in progress, so the residual likelihood is not yet fully realised." });
  add("risk_treatment", { name: "Treat: Insider data exfiltration", strategic_scenario: ssInsider, decision: "Reduce", owner: "Data Protection Officer", deadline: "2026-Q3", status: "Implemented", justification: "Reduce: the exfiltration stages of the kill chain are well covered, and the residual is derived from that coverage." });

  // Risk Quantification is fully derived (Monte-Carlo from the qualitative model) -
  // no manual assessment entity to seed. Quantification is opt-in per scenario; the
  // sample opts both operational scenarios in so the demo shows figures out of the box.

  // Illustrative, hash-chained change log so the Timeline and the per-record audit trail
  // demo out of the box. Editors are made-up analysts. EVERY record gets a create entry -
  // the log has to account for the whole study, or the untracked ones would read as
  // having been added to the file from outside.
  const day = 86400000, now = Date.now();
  const at = (d: number) => new Date(now - d * day).toISOString();
  type Edit = { id: string; editor: string; ts: string; changes?: { field: string; from: FieldValue; to: FieldValue }[]; comment?: string };
  const edits: Edit[] = [
    { id: baRecords, editor: "Analyst B", ts: at(4), changes: [{ field: "criticality", from: 3, to: 4 }], comment: "Raised to critical after the DPIA - leakage triggers mandatory breach notification." },
    { id: roRansom, editor: "Analyst C", ts: at(3), changes: [{ field: "activity", from: 3, to: 4 }], comment: "Threat-intel: active ransomware campaigns targeting hospitals this quarter." },
    { id: ssRansom, editor: "Analyst B", ts: at(2), changes: [{ field: "gravity", from: 3, to: 4 }], comment: "Gravity raised - encryption of the HIS halts emergency care." },
    { id: trRansom, editor: "Analyst C", ts: at(1), changes: [{ field: "status", from: "Proposed", to: "In progress" }], comment: "MFA rollout kicked off; treatment now in progress." },
  ];
  // Creates are spread over the first days in the order the workshops were run.
  const createdBy = (i: number) => (i % 3 === 0 ? "Analyst A" : i % 3 === 1 ? "Analyst B" : "Analyst C");
  const createTs = (i: number) => at(9 - Math.min(8, Math.floor((i / Math.max(1, entities.length)) * 8)));
  const pending: Array<LogInput & { _s: string }> = [];
  entities.forEach((e, i) => {
    const ts0 = createTs(i);
    e.createdAt = ts0; e.updatedAt = ts0;
    pending.push({ _s: ts0 + String(i).padStart(4, "0"), ts: ts0, editor: createdBy(i), kind: "create",
      entity: e.id, entityType: e.type, title: String(e.values.name ?? e.id),
      ...(e.id === os ? { comment: "Modelled the end-to-end kill chain from the maintenance-access vector." } : {}) });
  });
  for (const ed of edits) {
    const e = entities.find((x) => x.id === ed.id);
    if (!e) continue;
    e.updatedAt = ed.ts;
    pending.push({ _s: ed.ts + "zzzz", ts: ed.ts, editor: ed.editor, kind: "update", entity: e.id,
      entityType: e.type, title: String(e.values.name ?? e.id), changes: ed.changes, comment: ed.comment });
  }
  pending.sort((a, b) => (a._s < b._s ? -1 : a._s > b._s ? 1 : 0));
  // Only the newest entry per record carries the state fingerprint (see audit.ts).
  const lastIdx = new Map<string, number>();
  pending.forEach((p, i) => lastIdx.set(p.entity, i));
  const byId = new Map(entities.map((e) => [e.id, e]));
  const log = sealLog(pending.map(({ _s, ...p }, i) => {
    void _s;
    return lastIdx.get(p.entity) === i ? { ...p, state: hashValues(byId.get(p.entity)!.values) } : p;
  }));

  return {
    id: uid(),
    name: "Riverside General Hospital - Core Systems (sample)",
    organization: "Riverside General Hospital Trust",
    sector: "Healthcare",
    scope: "Patient data, emergency care and billing systems within the main hospital site.",
    createdAt: ts,
    updatedAt: ts,
    entities,
    log,
    quantScenarios: [os, os2],
  };
}
