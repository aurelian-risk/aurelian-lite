// Bundled, explicitly-free framework catalogs for the compliance / requirements
// mapping. Only content that is clearly free to publish ships here:
//   • NIS2  — EU legislation (Directive (EU) 2022/2555), reusable per Decision 2011/833/EU.
//   • NIST CSF 2.0 — a work of the U.S. Government, public domain.
// Copyrighted or restrictively-licensed catalogs (ISO 27001/27002, BSI IT-Grundschutz,
// CIS Controls, …) are NOT bundled — bring them via user-import (parseCatalog).
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

/** Convert a framework item to `requirement` entity values. */
export function requirementValues(fw: Framework, it: FrameworkItem): Record<string, FieldValue> {
  return { name: it.title, ref_id: it.ref_id, framework: fw.name, category: it.category ?? "", description: it.description ?? "" };
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
