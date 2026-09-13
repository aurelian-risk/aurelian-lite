// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Bundled framework catalogs for the compliance / requirements mapping:
//   • NIS2  — EU legislation (Directive (EU) 2022/2555), reusable per Decision 2011/833/EU.
//   • NIST CSF 2.0 — a work of the U.S. Government, public domain.
// Users can add further catalogs by importing them (see parseCatalog).
import type { FieldValue } from "./types";
import { EFFECT_CLASSES, type EffectClass } from "./controls";

/** `effect` is the quantitative effect class (see controls.ts). It is set only where a
 *  control's mechanism is unambiguous; governance and support controls are left unset
 *  on purpose, so the linter asks the analyst to decide in context rather than the
 *  catalog silently claiming an effect the control does not have. */
export interface FrameworkItem {
  ref_id: string; title: string; category?: string; description?: string; effect?: EffectClass;
  /** How much of the ceiling the control reaches when fully in force, 1-4 on the
   *  measure's Strength scale (weak / moderate / strong / very strong), with the evidence
   *  it rests on. Only the curated library carries these; a framework states what to do,
   *  not how well it works. The table with sources is calibration-sources.md §10. */
  strength?: 1 | 2 | 3 | 4;
  evidence?: string;
  /** The ATT&CK mitigation ids the control implements (M1032 = MFA). Seeded into the
   *  measure; the completeness checks hold them against the covered steps' techniques. */
  mitigations?: string[];
  /** Where the item sits in the catalogue's own hierarchy, as a readable path. */
  section?: string;
  /** Parameters the item leaves open for the reader to set, as "id = suggested wording".
   *  The prose already reads with the suggestion in place; this states what a product
   *  would have to ask for to make the text the institution's own. */
  params?: string;
  /** Named properties the catalogue carries beyond these fields - OSCAL `props`, a
   *  spreadsheet's extra columns. Kept verbatim; catalog.ts writes a property into the
   *  entity when the taxonomy declares a field of the same key, so which of them a
   *  product can absorb is a property of its taxonomy rather than of the reader. */
  props?: Record<string, string>;
}
export interface Framework { key: string; name: string; source: string; items: FrameworkItem[] }

// NIS2 — Directive (EU) 2022/2555, Article 21(2) risk-management measures.
export const NIS2: Framework = {
  key: "nis2",
  name: "NIS2",
  source: "Directive (EU) 2022/2555 (NIS2), Art. 21(2). © European Union, https://eur-lex.europa.eu - reused per Commission Decision 2011/833/EU.",
  items: [
    { ref_id: "21(2)(a)", title: "Risk analysis and information system security policies", category: "Governance" },
    { ref_id: "21(2)(b)", title: "Incident handling", category: "Operations" },
    { ref_id: "21(2)(c)", title: "Business continuity (backup, disaster recovery, crisis management)", category: "Resilience" },
    { ref_id: "21(2)(d)", title: "Supply chain security", category: "Supply chain" },
    { ref_id: "21(2)(e)", title: "Security in acquisition, development and maintenance, incl. vulnerability handling", category: "Engineering" },
    { ref_id: "21(2)(f)", title: "Policies to assess the effectiveness of risk-management measures", category: "Governance" },
    { ref_id: "21(2)(g)", title: "Basic cyber hygiene and cybersecurity training", category: "People" },
    { ref_id: "21(2)(h)", title: "Cryptography and, where appropriate, encryption", category: "Protection" },
    { ref_id: "21(2)(i)", title: "Human resources security, access control and asset management", category: "Access & assets" },
    { ref_id: "21(2)(j)", title: "Multi-factor / continuous authentication and secured communications", category: "Access" },
  ],
};

// NIST Cybersecurity Framework 2.0 — Functions and Categories (public domain).
export const NIST_CSF: Framework = {
  key: "nist-csf",
  name: "NIST CSF",
  source: "NIST Cybersecurity Framework (CSF) 2.0 - a work of the U.S. Government (NIST), public domain.",
  items: [
    { ref_id: "GV.OC", title: "Organizational Context", category: "Govern" },
    { ref_id: "GV.RM", title: "Risk Management Strategy", category: "Govern" },
    { ref_id: "GV.RR", title: "Roles, Responsibilities, and Authorities", category: "Govern" },
    { ref_id: "GV.PO", title: "Policy", category: "Govern" },
    { ref_id: "GV.OV", title: "Oversight", category: "Govern" },
    { ref_id: "GV.SC", title: "Cybersecurity Supply Chain Risk Management", category: "Govern" },
    { ref_id: "ID.AM", title: "Asset Management", category: "Identify" },
    { ref_id: "ID.RA", title: "Risk Assessment", category: "Identify" },
    { ref_id: "ID.IM", title: "Improvement", category: "Identify" },
    { ref_id: "PR.AA", title: "Identity Management, Authentication, and Access Control", category: "Protect" },
    { ref_id: "PR.AT", title: "Awareness and Training", category: "Protect" },
    { ref_id: "PR.DS", title: "Data Security", category: "Protect" },
    { ref_id: "PR.PS", title: "Platform Security", category: "Protect" },
    { ref_id: "PR.IR", title: "Technology Infrastructure Resilience", category: "Protect" },
    { ref_id: "DE.CM", title: "Continuous Monitoring", category: "Detect" },
    { ref_id: "DE.AE", title: "Adverse Event Analysis", category: "Detect" },
    { ref_id: "RS.MA", title: "Incident Management", category: "Respond" },
    { ref_id: "RS.AN", title: "Incident Analysis", category: "Respond" },
    { ref_id: "RS.CO", title: "Incident Response Reporting and Communication", category: "Respond" },
    { ref_id: "RS.MI", title: "Incident Mitigation", category: "Respond" },
    { ref_id: "RC.RP", title: "Incident Recovery Plan Execution", category: "Recover" },
    { ref_id: "RC.CO", title: "Incident Recovery Communication", category: "Recover" },
  ],
};

// NIST SP 800-53 Rev.5 - the 20 control families (public domain). Slim reference;
// individual controls can be added via user-import.
export const NIST_800_53: Framework = {
  key: "nist-800-53",
  name: "NIST SP 800-53",
  source: "NIST SP 800-53 Rev.5 - a work of the U.S. Government (NIST), public domain.",
  items: [
    { ref_id: "AC", title: "Access Control", category: "Control family" },
    { ref_id: "AT", title: "Awareness and Training", category: "Control family" },
    { ref_id: "AU", title: "Audit and Accountability", category: "Control family" },
    { ref_id: "CA", title: "Assessment, Authorization, and Monitoring", category: "Control family" },
    { ref_id: "CM", title: "Configuration Management", category: "Control family" },
    { ref_id: "CP", title: "Contingency Planning", category: "Control family" },
    { ref_id: "IA", title: "Identification and Authentication", category: "Control family" },
    { ref_id: "IR", title: "Incident Response", category: "Control family" },
    { ref_id: "MA", title: "Maintenance", category: "Control family" },
    { ref_id: "MP", title: "Media Protection", category: "Control family" },
    { ref_id: "PE", title: "Physical and Environmental Protection", category: "Control family" },
    { ref_id: "PL", title: "Planning", category: "Control family" },
    { ref_id: "PM", title: "Program Management", category: "Control family" },
    { ref_id: "PS", title: "Personnel Security", category: "Control family" },
    { ref_id: "PT", title: "PII Processing and Transparency", category: "Control family" },
    { ref_id: "RA", title: "Risk Assessment", category: "Control family" },
    { ref_id: "SA", title: "System and Services Acquisition", category: "Control family" },
    { ref_id: "SC", title: "System and Communications Protection", category: "Control family" },
    { ref_id: "SI", title: "System and Information Integrity", category: "Control family" },
    { ref_id: "SR", title: "Supply Chain Risk Management", category: "Control family" },
  ],
};

// Which of these a build ships is a product decision: see src/profile/*/catalogs.ts.

// A curated, framework-neutral library of common security measures (controls),
// written here so a study can be seeded with real controls
// and then customised. The requirement frameworks above double as measure
// sources too, since their items are themselves risk-management measures/controls.
export const MEASURE_LIBRARY: Framework = {
  key: "measure-library",
  name: "Common measures",
  source: "Aurelian Lite curated library of common security controls (framework-neutral).",
  items: [
    { ref_id: "IAM-01", title: "Multi-factor authentication", category: "Identity & access", description: "Enforce MFA for remote access, admin and privileged accounts.", effect: "Preventive", strength: 4, evidence: "Google: MFA blocks 66% of targeted attacks, 99% of bulk phishing, 100% of automated; Marsh/Cyentia 2023: top-3 control when implemented fully", mitigations: ["M1032"] },
    { ref_id: "IAM-02", title: "Least-privilege access", category: "Identity & access", description: "Grant the minimum rights needed; remove standing admin where possible.", effect: "Preventive", strength: 3, evidence: "reduces what a compromised account can reach; ASD Essential Eight 'restrict administrative privileges' (top 8); no per-control likelihood figure", mitigations: ["M1018", "M1026"] },
    { ref_id: "IAM-03", title: "Privileged access management", category: "Identity & access", description: "Vault, broker and session-record privileged credentials; just-in-time elevation.", effect: "Preventive", strength: 3, evidence: "Marsh/Cyentia 2023: privileged access management among the controls with a measured effect on event likelihood", mitigations: ["M1026"] },
    { ref_id: "IAM-04", title: "Periodic access reviews & timely offboarding", category: "Identity & access", description: "Recertify entitlements; revoke access promptly on role change or departure.", effect: "Preventive", strength: 2, evidence: "removes stale access; effect indirect and slow - no published likelihood effect", mitigations: ["M1018"] },
    { ref_id: "IAM-05", title: "Single sign-on / centralised identity", category: "Identity & access", description: "Federate authentication to reduce credential sprawl and enforce policy centrally.", effect: "Preventive", strength: 2, evidence: "reduces credential sprawl; effect through what it enables (MFA, revocation), not on its own", mitigations: ["M1018"] },
    { ref_id: "NET-01", title: "Network segmentation", category: "Network", description: "Separate sensitive systems into isolated zones to limit lateral movement.", effect: "Preventive", strength: 3, evidence: "limits lateral movement; DBIR/M-Trends consistently name flat networks in ransomware spread; no per-control figure", mitigations: ["M1030"] },
    { ref_id: "NET-02", title: "Firewall & egress filtering", category: "Network", description: "Restrict inbound and outbound traffic to what is explicitly required.", effect: "Preventive", strength: 2, evidence: "narrows the attack surface; egress filtering breaks some C2 and exfiltration; effect partial", mitigations: ["M1037", "M1031"] },
    { ref_id: "NET-03", title: "Secure remote access (VPN / ZTNA)", category: "Network", description: "Terminate remote sessions through authenticated, encrypted, policy-checked gateways.", effect: "Preventive", strength: 3, evidence: "removes standing exposed services; DBIR 2025: exploited vulnerabilities in edge devices a leading vector", mitigations: ["M1035"] },
    { ref_id: "END-01", title: "Endpoint detection & response (EDR)", category: "Endpoint", description: "Deploy EDR/anti-malware with central telemetry and containment.", effect: "Detective", strength: 3, evidence: "Marsh/Cyentia 2023: EDR top-3 control; M-Trends: internal detection finds 30% of ransomware intrusions", mitigations: ["M1040", "M1049"] },
    { ref_id: "END-02", title: "Patch & vulnerability management", category: "Endpoint", description: "Identify, prioritise and remediate vulnerabilities on a defined cadence.", effect: "Preventive", strength: 3, evidence: "Marsh/Cyentia 2023: patching high-severity CVEs within 7 days halves the probability of an event", mitigations: ["M1051", "M1016"] },
    { ref_id: "END-03", title: "Secure configuration / hardening baseline", category: "Endpoint", description: "Apply and monitor a hardened baseline; disable unused services and defaults.", effect: "Preventive", strength: 4, evidence: "Marsh/Cyentia 2023: automated hardening the largest measured effect of any control studied", mitigations: ["M1028", "M1054", "M1042"] },
    { ref_id: "END-04", title: "Application allow-listing", category: "Endpoint", description: "Permit only approved executables to run on sensitive endpoints/servers.", effect: "Preventive", strength: 4, evidence: "ASD Essential Eight: application control first among the mitigations; blocks unapproved execution outright", mitigations: ["M1038", "M1033"] },
    { ref_id: "DAT-01", title: "Encryption at rest", category: "Data protection", description: "Encrypt sensitive data on disk, databases and backups.", effect: "Preventive", strength: 2, evidence: "protects confidentiality of data at rest; does not stop an attacker with a live session; effect on loss, not on likelihood", mitigations: ["M1041"] },
    { ref_id: "DAT-02", title: "Encryption in transit", category: "Data protection", description: "Enforce TLS/mTLS for data moving between systems and users.", effect: "Preventive", strength: 2, evidence: "protects data in motion; effect against interception only", mitigations: ["M1041"] },
    { ref_id: "DAT-03", title: "Key management", category: "Data protection", description: "Generate, store, rotate and revoke cryptographic keys under defined control.", effect: "Preventive", strength: 2, evidence: "makes encryption hold; no effect on its own" },
    { ref_id: "DAT-04", title: "Data classification & handling", category: "Data protection", description: "Label data by sensitivity and apply matching handling and access rules.", effect: "Preventive", strength: 1, evidence: "governance; effect through the controls it directs" },
    { ref_id: "DAT-05", title: "Data loss prevention (DLP)", category: "Data protection", description: "Detect and block unauthorised exfiltration of sensitive data.", effect: "Detective", strength: 2, evidence: "detects and blocks part of exfiltration; bypassable, high false-positive load in practice", mitigations: ["M1057"] },
    { ref_id: "BCK-01", title: "Backups with tested restore", category: "Resilience", description: "Take regular backups and periodically verify restoration end-to-end.", effect: "Corrective", strength: 3, evidence: "Sophos 2025: backups the most common recovery route; tested restore is what makes it one", mitigations: ["M1053"] },
    { ref_id: "BCK-02", title: "Offline / immutable backups", category: "Resilience", description: "Keep at least one backup copy isolated or immutable against ransomware.", effect: "Corrective", strength: 4, evidence: "immutable or offline copies survive ransomware that reaches the backups; the difference between paying and not", mitigations: ["M1053", "M1029"] },
    { ref_id: "BCK-03", title: "Disaster-recovery & continuity plan", category: "Resilience", description: "Document, resource and exercise recovery of critical services within target objectives.", effect: "Corrective", strength: 3, evidence: "shortens downtime - the largest loss component in NetDiligence 2025 (BI averages 1.2M at SMEs)", mitigations: ["M1053"] },
    { ref_id: "LOG-01", title: "Centralised logging & monitoring (SIEM)", category: "Detection", description: "Collect security-relevant logs centrally and monitor for suspicious activity.", effect: "Detective", strength: 2, evidence: "M-Trends 2026: only 30% of ransomware intrusions found by internal detection; logs are the precondition, not the detection", mitigations: ["M1047"] },
    { ref_id: "LOG-02", title: "Alerting & 24/7 detection coverage", category: "Detection", description: "Define detection use-cases and ensure alerts are triaged around the clock.", effect: "Detective", strength: 3, evidence: "detection that is acted on around the clock; M-Trends: dwell time falls where detection is internal", mitigations: ["M1047"] },
    { ref_id: "LOG-03", title: "File integrity & configuration monitoring", category: "Detection", description: "Detect unauthorised changes to critical files and configuration.", effect: "Detective", strength: 2, evidence: "detects persistence and tampering on covered files; narrow scope", mitigations: ["M1047", "M1022"] },
    { ref_id: "IR-01", title: "Incident response plan", category: "Response", description: "Maintain a documented, role-assigned plan for detecting and handling incidents.", effect: "Corrective", strength: 2, evidence: "Marsh/Cyentia 2023: incident-response planning top-3 - but the plan alone; its worth is realised through response readiness" },
    { ref_id: "IR-02", title: "Incident response exercises", category: "Response", description: "Run tabletop or live exercises to validate the plan and team readiness.", effect: "Corrective", strength: 3, evidence: "an exercised plan is what shortens response; NetDiligence: response time drives crisis and BI cost" },
    { ref_id: "EML-01", title: "Email authentication (SPF/DKIM/DMARC)", category: "Email & web", description: "Publish and enforce sender-authentication records to reduce spoofing.", effect: "Preventive", strength: 2, evidence: "stops spoofing of the own domain; does nothing against lookalike domains or compromised senders", mitigations: ["M1054"] },
    { ref_id: "EML-02", title: "Email & web content filtering", category: "Email & web", description: "Filter malicious attachments, links and known-bad destinations.", effect: "Preventive", strength: 3, evidence: "blocks the bulk of malicious attachments and links; Google: bulk phishing near-fully blockable, targeted far less", mitigations: ["M1021", "M1049", "M1031"] },
    { ref_id: "PPL-01", title: "Security awareness training", category: "People", description: "Train staff on phishing, handling and reporting on a recurring basis.", effect: "Preventive", strength: 1, evidence: "reduces click rates modestly; DBIR: the human element in 60% of breaches persists with training - a weak control on its own", mitigations: ["M1017"] },
    { ref_id: "PPL-02", title: "Phishing simulation", category: "People", description: "Run simulated phishing campaigns and coach on results.", effect: "Preventive", strength: 2, evidence: "measurable reduction in click and credential-entry rates over repeated campaigns; still a fraction of targeted lures", mitigations: ["M1017"] },
    { ref_id: "APP-01", title: "Secure development lifecycle", category: "Application", description: "Integrate security requirements, review and testing across development.", effect: "Preventive", strength: 2, evidence: "fewer vulnerabilities shipped; effect slow and indirect", mitigations: ["M1013"] },
    { ref_id: "APP-02", title: "Application & dependency scanning", category: "Application", description: "Scan code, containers and dependencies for known vulnerabilities in CI.", effect: "Preventive", strength: 2, evidence: "finds known vulnerabilities in code and dependencies; effect through patching", mitigations: ["M1016"] },
    { ref_id: "ASM-01", title: "Asset inventory", category: "Governance", description: "Maintain an accurate inventory of hardware, software and data assets.", strength: 1, evidence: "no direct effect on any attack; the precondition for every other control" },
    { ref_id: "ASM-02", title: "Third-party / supply-chain risk assessment", category: "Governance", description: "Assess and monitor the security of suppliers and integrations.", strength: 1, evidence: "assessment, not control; supply-chain compromise is rare and rarely stopped by the assessment" },
    { ref_id: "ASM-03", title: "Change & configuration management", category: "Governance", description: "Review, approve and record changes to production systems.", strength: 2, evidence: "prevents unreviewed change; narrow effect on attack likelihood" },
    { ref_id: "PHY-01", title: "Physical access control", category: "Physical", description: "Restrict and log physical access to facilities and equipment.", effect: "Preventive", strength: 3, evidence: "stops physical access outright where enforced; Eurostat: physical incidents a small share" },
  ],
};

/** Convert a catalog item to `requirement` entity values. */
export function requirementValues(fw: Framework, it: FrameworkItem): Record<string, FieldValue> {
  return { name: it.title, ref_id: it.ref_id, framework: fw.name, category: it.category ?? "", description: it.description ?? "" };
}

/** Convert a catalog item to `security_measure` entity values. Measures carry no
 *  framework/ref_id fields, so provenance goes into the description; seeded measures
 *  start as "Recommended" for the user to adopt and refine. */
export function measureValues(fw: Framework, it: FrameworkItem): Record<string, FieldValue> {
  const prov = fw.key === "measure-library" ? "" : ` (${fw.name} ${it.ref_id})`;
  return {
    name: it.title, description: (it.description ?? "") + prov, status: "Recommended",
    // Carried only when the catalog states it; otherwise the measure stays unclassified
    // and the linter asks for a decision rather than a default being seeded silently.
    ...(it.effect ? { measure_type: it.effect } : {}),
    // The library's evidenced strength travels with the measure; a framework item has
    // none and the measure stays unrated, which the model reads as very strong.
    ...(it.strength ? { strength: it.strength } : {}),
    ...(it.mitigations?.length ? { mitigations: it.mitigations.join(", ") } : {}),
  };
}

/** Parse a user-imported catalog (JSON): a Framework object, or a bare array of
 *  items with a given framework name. Lets users bring ISO/CIS/BSI/own catalogs. */
export function parseCatalog(text: string, fallbackName = "Imported"): { name: string; items: FrameworkItem[] } {
  const data = JSON.parse(text);
  if (Array.isArray(data)) return { name: fallbackName, items: data.map(normItem).filter(Boolean) as FrameworkItem[] };
  const items = Array.isArray(data.items) ? data.items.map(normItem).filter(Boolean) as FrameworkItem[] : [];
  return { name: String(data.name || data.framework || fallbackName), items };
}
function normItem(o: any): FrameworkItem | null {
  const ref_id = String(o?.ref_id ?? o?.id ?? o?.control ?? "").trim();
  const title = String(o?.title ?? o?.name ?? o?.label ?? "").trim();
  if (!ref_id && !title) return null;
  const effect = String(o?.effect ?? o?.measure_type ?? "").trim();
  return {
    ref_id, title: title || ref_id,
    category: o?.category ? String(o.category) : undefined,
    description: o?.description ? String(o.description) : undefined,
    effect: (EFFECT_CLASSES as string[]).includes(effect) ? (effect as EffectClass) : undefined,
  };
}

// ── Catalogues the publisher hosts ───────────────────────────────────────

/** A catalogue that is published rather than shipped, offered for download on demand.
 *
 *  The engine holds the mechanism, the profile the list: which rulesets a product works
 *  to is what makes it that product. Nothing is fetched on its own — a download happens
 *  when the user asks for it, and the application works without ever asking. */
export interface PublishedCatalog {
  key: string;
  name: string;
  url: string;
  /** Publisher and licence, shown beside the button, so what is being fetched from where
   *  is visible before it is fetched. */
  source: string;
  /** Transfer size, as published. */
  size?: string;
}

/** Download a published catalogue, reporting bytes as they arrive.
 *  Returns the raw text; what it is read as is the caller's decision. */
export async function fetchPublishedCatalog(cat: PublishedCatalog, onProgress?: (loaded: number, total: number) => void): Promise<string> {
  const res = await fetch(cat.url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${cat.name}: the publisher answered ${res.status} ${res.statusText}`);
  const total = Number(res.headers.get("content-length") ?? 0);
  if (!res.body || !onProgress) return await res.text();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(loaded, total);
  }
  const buf = new Uint8Array(loaded);
  let at = 0;
  for (const c of chunks) { buf.set(c, at); at += c.length; }
  return new TextDecoder().decode(buf);
}
