// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Which ATT&CK mitigation is known to act against which technique - the "mitigates"
// relationships of the Enterprise matrix, reduced to the techniques this product bundles.
//
// Generated from the ATT&CK STIX bundle (enterprise-attack, version 19.2) by the script
// in docs/sources/README.md; regenerate rather than edit. Sub-techniques are folded onto
// their technique. "Do Not Mitigate" (M1055) and "Pre-compromise" (M1056) are left out:
// they say a technique has no mitigation, which is what an EMPTY list says here.
//
// Attribution: MITRE ATT&CK® identifiers and mitigation names, © The MITRE Corporation,
// reproduced under the ATT&CK terms of use (https://attack.mitre.org/resources/legal-and-branding/terms-of-use/).

/** The mitigations referred to below, by id. */
export const ATTACK_MITIGATIONS: Record<string, string> = {
  M1013: "Application Developer Guidance",
  M1015: "Active Directory Configuration",
  M1016: "Vulnerability Scanning",
  M1017: "User Training",
  M1018: "User Account Management",
  M1019: "Threat Intelligence Program",
  M1020: "SSL/TLS Inspection",
  M1021: "Restrict Web-Based Content",
  M1022: "Restrict File and Directory Permissions",
  M1024: "Restrict Registry Permissions",
  M1025: "Privileged Process Integrity",
  M1026: "Privileged Account Management",
  M1027: "Password Policies",
  M1028: "Operating System Configuration",
  M1029: "Remote Data Storage",
  M1030: "Network Segmentation",
  M1031: "Network Intrusion Prevention",
  M1032: "Multi-factor Authentication",
  M1033: "Limit Software Installation",
  M1034: "Limit Hardware Installation",
  M1035: "Limit Access to Resource Over Network",
  M1036: "Account Use Policies",
  M1037: "Filter Network Traffic",
  M1038: "Execution Prevention",
  M1039: "Environment Variable Permissions",
  M1040: "Behavior Prevention on Endpoint",
  M1041: "Encrypt Sensitive Information",
  M1042: "Disable or Remove Feature or Program",
  M1043: "Credential Access Protection",
  M1044: "Restrict Library Loading",
  M1045: "Code Signing",
  M1046: "Boot Integrity",
  M1047: "Audit",
  M1048: "Application Isolation and Sandboxing",
  M1049: "Antivirus/Antimalware",
  M1050: "Exploit Protection",
  M1051: "Update Software",
  M1052: "User Account Control",
  M1053: "Data Backup",
  M1054: "Software Configuration",
  M1057: "Data Loss Prevention",
  M1060: "Out-of-Band Communications Channel",
};

/** Per bundled technique, the mitigations ATT&CK lists against it. A technique with
 *  no entry is one ATT&CK marks as not easily mitigated by preventive controls (the
 *  lever there is detection), or one no relationship names. */
export const TECHNIQUE_MITIGATIONS: Record<string, readonly string[]> = {
  T1595: ["M1042"],
  T1566: ["M1017", "M1018", "M1021", "M1031", "M1047", "M1049", "M1054"],
  T1190: ["M1016", "M1026", "M1030", "M1035", "M1037", "M1048", "M1050", "M1051"],
  T1133: ["M1021", "M1030", "M1032", "M1035", "M1042"],
  T1078: ["M1013", "M1015", "M1017", "M1018", "M1026", "M1027", "M1032", "M1036"],
  T1195: ["M1013", "M1016", "M1018", "M1033", "M1046", "M1051"],
  T1199: ["M1018", "M1030", "M1032"],
  T1189: ["M1017", "M1021", "M1048", "M1050", "M1051"],
  T1091: ["M1034", "M1040", "M1042"],
  T1200: ["M1034", "M1035"],
  T1659: ["M1021", "M1041"],
  T1059: ["M1018", "M1021", "M1026", "M1033", "M1038", "M1040", "M1042", "M1045", "M1047", "M1049"],
  T1204: ["M1017", "M1021", "M1031", "M1033", "M1038", "M1040", "M1045", "M1047"],
  T1053: ["M1018", "M1022", "M1026", "M1028", "M1047"],
  T1547: ["M1017", "M1018", "M1022", "M1024", "M1025", "M1026", "M1033", "M1038", "M1042", "M1043", "M1044", "M1049"],
  T1136: ["M1026", "M1028", "M1030", "M1032"],
  T1505: ["M1018", "M1024", "M1026", "M1038", "M1042", "M1045", "M1046", "M1047"],
  T1068: ["M1019", "M1038", "M1048", "M1050", "M1051"],
  T1548: ["M1018", "M1022", "M1026", "M1028", "M1038", "M1047", "M1051", "M1052"],
  T1070: ["M1022", "M1024", "M1029", "M1039", "M1041", "M1047"],
  T1027: ["M1017", "M1040", "M1047", "M1048", "M1049"],
  T1055: ["M1022", "M1026", "M1040"],
  T1003: ["M1015", "M1017", "M1025", "M1026", "M1027", "M1028", "M1040", "M1041", "M1043"],
  T1110: ["M1018", "M1027", "M1032", "M1036", "M1051"],
  T1552: ["M1015", "M1017", "M1018", "M1022", "M1026", "M1027", "M1028", "M1030", "M1035", "M1037", "M1041", "M1042", "M1047", "M1051"],
  T1555: ["M1017", "M1018", "M1021", "M1026", "M1027", "M1042", "M1051", "M1054"],
  T1087: ["M1018", "M1028", "M1047"],
  T1046: ["M1030", "M1031", "M1042"],
  T1021: ["M1018", "M1026", "M1027", "M1028", "M1030", "M1032", "M1033", "M1035", "M1037", "M1042", "M1047", "M1048"],
  T1570: ["M1031", "M1037"],
  T1550: ["M1013", "M1015", "M1018", "M1021", "M1026", "M1027", "M1036", "M1041", "M1047", "M1051", "M1052", "M1054"],
  T1560: ["M1047"],
  T1005: ["M1057"],
  T1114: ["M1032", "M1041", "M1042", "M1047", "M1060"],
  T1071: ["M1031", "M1037"],
  T1105: ["M1031", "M1037"],
  T1573: ["M1020", "M1031"],
  T1041: ["M1031", "M1057"],
  T1567: ["M1021", "M1057"],
  T1048: ["M1018", "M1022", "M1030", "M1031", "M1037", "M1057"],
  T1486: ["M1040", "M1053"],
  T1490: ["M1018", "M1028", "M1038", "M1053"],
  T1489: ["M1018", "M1022", "M1024", "M1030", "M1060"],
  T1485: ["M1018", "M1032", "M1053"],
  T1498: ["M1037"],
};

/** The id of a mitigation or a technique as written in a field - "M1032", "T1566.001",
 *  "M1032 Multi-factor Authentication" - reduced to what the tables key on. */
export const mitigationIds = (v: unknown): string[] =>
  typeof v === "string" ? [...new Set((v.toUpperCase().match(/M\d{4}/g) ?? []))] : [];

/** Whether any of the given mitigations is known to act against the technique. `null` when
 *  the question cannot be asked: no mitigation named, or a technique the bundle does not
 *  know. `false` is the finding: named mitigations, known technique, no relationship. */
export function mitigates(mitigationIdsOf: string[], techniqueId: string | null): boolean | null {
  if (!mitigationIdsOf.length || !techniqueId) return null;
  const base = techniqueId.split(".")[0];
  if (!(base in TECHNIQUE_MITIGATIONS) && !ALL_BUNDLED.has(base)) return null;
  const known = TECHNIQUE_MITIGATIONS[base] ?? [];
  return mitigationIdsOf.some((m) => known.includes(m));
}
export const isBundled = (techniqueId: string): boolean => ALL_BUNDLED.has(techniqueId.split(".")[0]);
const ALL_BUNDLED = new Set<string>(["T1595", "T1592", "T1589", "T1583", "T1587", "T1608", "T1566", "T1190", "T1133", "T1078", "T1195", "T1199", "T1189", "T1091", "T1200", "T1659", "T1059", "T1204", "T1053", "T1547", "T1136", "T1505", "T1068", "T1548", "T1070", "T1027", "T1562", "T1055", "T1003", "T1110", "T1552", "T1555", "T1087", "T1082", "T1046", "T1018", "T1021", "T1570", "T1550", "T1560", "T1005", "T1114", "T1071", "T1105", "T1573", "T1041", "T1567", "T1048", "T1486", "T1490", "T1489", "T1485", "T1498"]);
