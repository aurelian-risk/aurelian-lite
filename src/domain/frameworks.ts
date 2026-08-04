// Bundled framework catalogs for the compliance / requirements mapping:
//   • NIS2  — EU legislation (Directive (EU) 2022/2555), reusable per Decision 2011/833/EU.
//   • NIST CSF 2.0 — a work of the U.S. Government, public domain.
// Users can add further catalogs by importing them (see parseCatalog).
import type { FieldValue } from "./types";

export interface FrameworkItem { ref_id: string; title: string; category?: string; description?: string }
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

export const BUNDLED_FRAMEWORKS: Framework[] = [NIS2, NIST_CSF, NIST_800_53];

// A curated, framework-neutral library of common security measures (controls),
// written here so a study can be seeded with real controls
// and then customised. The requirement frameworks above double as measure
// sources too, since their items are themselves risk-management measures/controls.
export const MEASURE_LIBRARY: Framework = {
  key: "measure-library",
  name: "Common measures",
  source: "Aurelian Lite curated library of common security controls (framework-neutral).",
  items: [
    { ref_id: "IAM-01", title: "Multi-factor authentication", category: "Identity & access", description: "Enforce MFA for remote access, admin and privileged accounts." },
    { ref_id: "IAM-02", title: "Least-privilege access", category: "Identity & access", description: "Grant the minimum rights needed; remove standing admin where possible." },
    { ref_id: "IAM-03", title: "Privileged access management", category: "Identity & access", description: "Vault, broker and session-record privileged credentials; just-in-time elevation." },
    { ref_id: "IAM-04", title: "Periodic access reviews & timely offboarding", category: "Identity & access", description: "Recertify entitlements; revoke access promptly on role change or departure." },
    { ref_id: "IAM-05", title: "Single sign-on / centralised identity", category: "Identity & access", description: "Federate authentication to reduce credential sprawl and enforce policy centrally." },
    { ref_id: "NET-01", title: "Network segmentation", category: "Network", description: "Separate sensitive systems into isolated zones to limit lateral movement." },
    { ref_id: "NET-02", title: "Firewall & egress filtering", category: "Network", description: "Restrict inbound and outbound traffic to what is explicitly required." },
    { ref_id: "NET-03", title: "Secure remote access (VPN / ZTNA)", category: "Network", description: "Terminate remote sessions through authenticated, encrypted, policy-checked gateways." },
    { ref_id: "END-01", title: "Endpoint detection & response (EDR)", category: "Endpoint", description: "Deploy EDR/anti-malware with central telemetry and containment." },
    { ref_id: "END-02", title: "Patch & vulnerability management", category: "Endpoint", description: "Identify, prioritise and remediate vulnerabilities on a defined cadence." },
    { ref_id: "END-03", title: "Secure configuration / hardening baseline", category: "Endpoint", description: "Apply and monitor a hardened baseline; disable unused services and defaults." },
    { ref_id: "END-04", title: "Application allow-listing", category: "Endpoint", description: "Permit only approved executables to run on sensitive endpoints/servers." },
    { ref_id: "DAT-01", title: "Encryption at rest", category: "Data protection", description: "Encrypt sensitive data on disk, databases and backups." },
    { ref_id: "DAT-02", title: "Encryption in transit", category: "Data protection", description: "Enforce TLS/mTLS for data moving between systems and users." },
    { ref_id: "DAT-03", title: "Key management", category: "Data protection", description: "Generate, store, rotate and revoke cryptographic keys under defined control." },
    { ref_id: "DAT-04", title: "Data classification & handling", category: "Data protection", description: "Label data by sensitivity and apply matching handling and access rules." },
    { ref_id: "DAT-05", title: "Data loss prevention (DLP)", category: "Data protection", description: "Detect and block unauthorised exfiltration of sensitive data." },
    { ref_id: "BCK-01", title: "Backups with tested restore", category: "Resilience", description: "Take regular backups and periodically verify restoration end-to-end." },
    { ref_id: "BCK-02", title: "Offline / immutable backups", category: "Resilience", description: "Keep at least one backup copy isolated or immutable against ransomware." },
    { ref_id: "BCK-03", title: "Disaster-recovery & continuity plan", category: "Resilience", description: "Document, resource and exercise recovery of critical services within target objectives." },
    { ref_id: "LOG-01", title: "Centralised logging & monitoring (SIEM)", category: "Detection", description: "Collect security-relevant logs centrally and monitor for suspicious activity." },
    { ref_id: "LOG-02", title: "Alerting & 24/7 detection coverage", category: "Detection", description: "Define detection use-cases and ensure alerts are triaged around the clock." },
    { ref_id: "LOG-03", title: "File integrity & configuration monitoring", category: "Detection", description: "Detect unauthorised changes to critical files and configuration." },
    { ref_id: "IR-01", title: "Incident response plan", category: "Response", description: "Maintain a documented, role-assigned plan for detecting and handling incidents." },
    { ref_id: "IR-02", title: "Incident response exercises", category: "Response", description: "Run tabletop or live exercises to validate the plan and team readiness." },
    { ref_id: "EML-01", title: "Email authentication (SPF/DKIM/DMARC)", category: "Email & web", description: "Publish and enforce sender-authentication records to reduce spoofing." },
    { ref_id: "EML-02", title: "Email & web content filtering", category: "Email & web", description: "Filter malicious attachments, links and known-bad destinations." },
    { ref_id: "PPL-01", title: "Security awareness training", category: "People", description: "Train staff on phishing, handling and reporting on a recurring basis." },
    { ref_id: "PPL-02", title: "Phishing simulation", category: "People", description: "Run simulated phishing campaigns and coach on results." },
    { ref_id: "APP-01", title: "Secure development lifecycle", category: "Application", description: "Integrate security requirements, review and testing across development." },
    { ref_id: "APP-02", title: "Application & dependency scanning", category: "Application", description: "Scan code, containers and dependencies for known vulnerabilities in CI." },
    { ref_id: "ASM-01", title: "Asset inventory", category: "Governance", description: "Maintain an accurate inventory of hardware, software and data assets." },
    { ref_id: "ASM-02", title: "Third-party / supply-chain risk assessment", category: "Governance", description: "Assess and monitor the security of suppliers and integrations." },
    { ref_id: "ASM-03", title: "Change & configuration management", category: "Governance", description: "Review, approve and record changes to production systems." },
    { ref_id: "PHY-01", title: "Physical access control", category: "Physical", description: "Restrict and log physical access to facilities and equipment." },
  ],
};

// Catalogs that seed security measures: the curated library first, then the
// frameworks (whose items are also controls).
export const BUNDLED_MEASURE_CATALOGS: Framework[] = [MEASURE_LIBRARY, NIS2, NIST_CSF, NIST_800_53];

/** Convert a catalog item to `requirement` entity values. */
export function requirementValues(fw: Framework, it: FrameworkItem): Record<string, FieldValue> {
  return { name: it.title, ref_id: it.ref_id, framework: fw.name, category: it.category ?? "", description: it.description ?? "" };
}

/** Convert a catalog item to `security_measure` entity values. Measures carry no
 *  framework/ref_id fields, so provenance goes into the description; seeded measures
 *  start as "Recommended" for the user to adopt and refine. */
export function measureValues(fw: Framework, it: FrameworkItem): Record<string, FieldValue> {
  const prov = fw.key === "measure-library" ? "" : ` (${fw.name} ${it.ref_id})`;
  return { name: it.title, description: (it.description ?? "") + prov, status: "Recommended" };
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
  return { ref_id, title: title || ref_id, category: o?.category ? String(o.category) : undefined, description: o?.description ? String(o.description) : undefined };
}
