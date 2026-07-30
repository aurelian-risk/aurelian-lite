// Slim, bundled TTP reference (tactics, techniques & procedures): the 14 kill-chain
// tactics (also the `tactic` enum in the taxonomy) and a curated set of common
// techniques, used only to power an offline typeahead on the kill-chain-step
// `technique` field. A small starter subset - extend via the free-text field.
// Attribution: the tactic and technique identifiers and names are a curated
// subset of MITRE ATT&CK(R). ATT&CK content is (C) The MITRE Corporation, used
// under the MITRE ATT&CK Terms of Use
// (https://attack.mitre.org/resources/legal-and-branding/terms-of-use/).
// MITRE ATT&CK(R) is a registered trademark of The MITRE Corporation; this
// project is not affiliated with or endorsed by MITRE. See NOTICE for details.
// (Surfaced in the UI generically as "TTP".)
export interface Technique { id: string; name: string; tactic: string }

// Curated common Enterprise techniques, grouped by their primary tactic.
export const MITRE_TECHNIQUES: Technique[] = [
  // Reconnaissance
  { id: "T1595", name: "Active Scanning", tactic: "Reconnaissance" },
  { id: "T1592", name: "Gather Victim Host Information", tactic: "Reconnaissance" },
  { id: "T1589", name: "Gather Victim Identity Information", tactic: "Reconnaissance" },
  // Resource Development
  { id: "T1583", name: "Acquire Infrastructure", tactic: "Resource Development" },
  { id: "T1587", name: "Develop Capabilities", tactic: "Resource Development" },
  { id: "T1608", name: "Stage Capabilities", tactic: "Resource Development" },
  // Initial Access
  { id: "T1566", name: "Phishing", tactic: "Initial Access" },
  { id: "T1190", name: "Exploit Public-Facing Application", tactic: "Initial Access" },
  { id: "T1133", name: "External Remote Services", tactic: "Initial Access" },
  { id: "T1078", name: "Valid Accounts", tactic: "Initial Access" },
  { id: "T1195", name: "Supply Chain Compromise", tactic: "Initial Access" },
  // Execution
  { id: "T1059", name: "Command and Scripting Interpreter", tactic: "Execution" },
  { id: "T1204", name: "User Execution", tactic: "Execution" },
  { id: "T1053", name: "Scheduled Task/Job", tactic: "Execution" },
  // Persistence
  { id: "T1547", name: "Boot or Logon Autostart Execution", tactic: "Persistence" },
  { id: "T1136", name: "Create Account", tactic: "Persistence" },
  { id: "T1505", name: "Server Software Component", tactic: "Persistence" },
  // Privilege Escalation
  { id: "T1068", name: "Exploitation for Privilege Escalation", tactic: "Privilege Escalation" },
  { id: "T1548", name: "Abuse Elevation Control Mechanism", tactic: "Privilege Escalation" },
  // Defense Evasion
  { id: "T1070", name: "Indicator Removal", tactic: "Defense Evasion" },
  { id: "T1027", name: "Obfuscated Files or Information", tactic: "Defense Evasion" },
  { id: "T1562", name: "Impair Defenses", tactic: "Defense Evasion" },
  { id: "T1055", name: "Process Injection", tactic: "Defense Evasion" },
  // Credential Access
  { id: "T1003", name: "OS Credential Dumping", tactic: "Credential Access" },
  { id: "T1110", name: "Brute Force", tactic: "Credential Access" },
  { id: "T1552", name: "Unsecured Credentials", tactic: "Credential Access" },
  { id: "T1555", name: "Credentials from Password Stores", tactic: "Credential Access" },
  // Discovery
  { id: "T1087", name: "Account Discovery", tactic: "Discovery" },
  { id: "T1082", name: "System Information Discovery", tactic: "Discovery" },
  { id: "T1046", name: "Network Service Discovery", tactic: "Discovery" },
  { id: "T1018", name: "Remote System Discovery", tactic: "Discovery" },
  // Lateral Movement
  { id: "T1021", name: "Remote Services", tactic: "Lateral Movement" },
  { id: "T1570", name: "Lateral Tool Transfer", tactic: "Lateral Movement" },
  { id: "T1550", name: "Use Alternate Authentication Material", tactic: "Lateral Movement" },
  // Collection
  { id: "T1560", name: "Archive Collected Data", tactic: "Collection" },
  { id: "T1005", name: "Data from Local System", tactic: "Collection" },
  { id: "T1114", name: "Email Collection", tactic: "Collection" },
  // Command and Control
  { id: "T1071", name: "Application Layer Protocol", tactic: "Command and Control" },
  { id: "T1105", name: "Ingress Tool Transfer", tactic: "Command and Control" },
  { id: "T1573", name: "Encrypted Channel", tactic: "Command and Control" },
  // Exfiltration
  { id: "T1041", name: "Exfiltration Over C2 Channel", tactic: "Exfiltration" },
  { id: "T1567", name: "Exfiltration Over Web Service", tactic: "Exfiltration" },
  { id: "T1048", name: "Exfiltration Over Alternative Protocol", tactic: "Exfiltration" },
  // Impact
  { id: "T1486", name: "Data Encrypted for Impact", tactic: "Impact" },
  { id: "T1490", name: "Inhibit System Recovery", tactic: "Impact" },
  { id: "T1489", name: "Service Stop", tactic: "Impact" },
  { id: "T1485", name: "Data Destruction", tactic: "Impact" },
  { id: "T1498", name: "Network Denial of Service", tactic: "Impact" },
];

/** Datalist label / stored value, e.g. "T1566 Phishing". */
export const techniqueLabel = (t: Technique): string => `${t.id} ${t.name}`;

/** Techniques for the typeahead — all, or (when given) those of one tactic first. */
export function suggestTechniques(tactic?: string): Technique[] {
  if (!tactic) return MITRE_TECHNIQUES;
  const inTactic = MITRE_TECHNIQUES.filter((t) => t.tactic === tactic);
  return inTactic.length ? inTactic : MITRE_TECHNIQUES;
}
