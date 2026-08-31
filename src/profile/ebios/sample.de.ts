// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// The sample study's own words, in German.
//
// A table rather than a second sample study: the structure — which record points at which,
// what the scales say, which steps make up a chain — lives once, in sample.ts, and only
// the prose is looked up here. Two studies would drift, and the one nobody reads would be
// the one that drifts.
//
// The key is the English text itself, which works because it is the value being replaced
// and because the 62 sample records have distinct names. It is applied ONLY to the free-
// text fields (name, description, motivation, justification, owner); a stored option value
// like "Information" or "Preventive" is data and reads through the word table instead.
//
// NOT HERE, deliberately: the 14 requirement titles. They are the wording of NIS2 and
// NIST CSF as those documents publish it — translating a legal text would be inventing
// one. They stay as published, in a German study as in an English one.

export const SAMPLE_DE: Record<string, string> = {
  // ── the study itself ──
  "Riverside General Hospital - Core Systems (sample)": "Klinikum Riverside - Kernsysteme (Beispiel)",
  "Riverside General Hospital Trust": "Klinikum Riverside gGmbH",
  "Patient data, emergency care and billing systems within the main hospital site.":
    "Patientendaten, Notfallversorgung und Abrechnungssysteme am Hauptstandort des Klinikums.",

  // ── business assets ──
  "Patient records": "Patientenakten",
  "The complete electronic health records of every patient the hospital has treated - diagnoses, medications, lab and imaging results. Legally protected special-category data whose confidentiality and integrity are paramount; loss or leakage triggers mandatory breach notification.":
    "Die vollständigen elektronischen Patientenakten aller behandelten Patienten - Diagnosen, Medikation, Labor- und Bildbefunde. Besondere Kategorien personenbezogener Daten, deren Vertraulichkeit und Integrität Vorrang haben; Verlust oder Abfluss löst eine Meldepflicht aus.",
  "Emergency care": "Notfallversorgung",
  "The hospital's round-the-clock core process of admitting, triaging and treating emergency patients. It depends on the clinical systems and network being available; any interruption is a direct threat to patient safety and life.":
    "Der rund um die Uhr laufende Kernprozess aus Aufnahme, Ersteinschätzung und Behandlung von Notfallpatienten. Er hängt an der Verfügbarkeit der klinischen Systeme und des Netzes; jede Unterbrechung gefährdet Patientensicherheit und Leben unmittelbar.",
  "Billing": "Abrechnung",
  "Invoicing of treatments and services to statutory and private insurers and to patients, and reconciliation of the payments received. Underpins the hospital's cash flow and its regulatory reporting.":
    "Abrechnung von Behandlungen und Leistungen gegenüber gesetzlichen und privaten Kostenträgern sowie Patienten, samt Abgleich der Zahlungseingänge. Trägt Liquidität und aufsichtsrechtliche Meldungen des Klinikums.",
  "Clinical research data": "Klinische Forschungsdaten",
  "De-identified datasets from the hospital's ongoing clinical trials, shared with academic partners under strict data-use agreements. Valuable but not life-critical.":
    "Pseudonymisierte Datensätze aus laufenden klinischen Studien, die unter strengen Nutzungsvereinbarungen mit Hochschulpartnern geteilt werden. Wertvoll, aber nicht lebenskritisch.",
  "Staff scheduling": "Dienstplanung",
  "Rostering and shift planning for clinical and support personnel across the wards, theatres and the emergency department. Disruption is inconvenient rather than dangerous.":
    "Dienst- und Schichtplanung für Pflege-, ärztliches und unterstützendes Personal auf Station, im OP und in der Notaufnahme. Eine Störung ist lästig, aber nicht gefährlich.",

  // ── supporting assets ──
  "HIS database server": "KIS-Datenbankserver",
  "Hospital Information System - central patient database.": "Krankenhausinformationssystem - zentrale Patientendatenbank.",
  "Clinical network": "Klinisches Netz",
  "Network segment connecting wards and medical devices.": "Netzsegment, das Stationen und Medizingeräte verbindet.",
  "Active Directory domain": "Active-Directory-Domäne",
  "Central identity and access management for staff accounts.": "Zentrale Identitäts- und Zugriffsverwaltung für Mitarbeiterkonten.",
  "Nursing staff": "Pflegepersonal",
  "Personnel operating emergency and ward care.": "Personal, das Notaufnahme und Stationsbetrieb trägt.",
  "Backup NAS": "Backup-NAS",
  "Nightly backups of the patient database.": "Nächtliche Sicherungen der Patientendatenbank.",
  "Research data warehouse": "Forschungsdatenspeicher",
  "Analytics store for de-identified trial data.": "Auswertungsspeicher für pseudonymisierte Studiendaten.",
  "Scheduling web app": "Dienstplan-Webanwendung",
  "Cloud rostering application for staff shifts.": "Cloud-Anwendung für die Schichtplanung.",

  // ── feared events ──
  "Disclosure of patient data": "Offenlegung von Patientendaten",
  "Confidential health records are exposed to, or exfiltrated by, unauthorized parties. A reportable breach of special-category data carrying regulatory fines, mandatory patient notification and lasting reputational harm.":
    "Vertrauliche Gesundheitsdaten werden Unbefugten zugänglich oder von ihnen abgezogen. Eine meldepflichtige Verletzung besonderer Kategorien personenbezogener Daten mit Bußgeldern, Benachrichtigungspflicht gegenüber Patienten und dauerhaftem Reputationsschaden.",
  "Outage of emergency care systems": "Ausfall der Systeme der Notfallversorgung",
  "The clinical systems supporting emergency care become unavailable, forcing ambulance diversion, cancellation of procedures and a fallback to paper records - an immediate risk to patient safety.":
    "Die klinischen Systeme der Notfallversorgung sind nicht mehr verfügbar. Die Folge sind Abmeldung von der Rettungsleitstelle, abgesagte Eingriffe und ein Rückfall auf Papier - ein unmittelbares Risiko für die Patientensicherheit.",
  "Manipulation of billing data": "Manipulation von Abrechnungsdaten",
  "Invoices or payment records are altered, causing financial loss, disputes with insurers and a compliance breach that may trigger an audit.":
    "Rechnungen oder Zahlungsdatensätze werden verändert. Die Folgen sind finanzieller Verlust, Streit mit Kostenträgern und ein Compliance-Verstoß, der eine Prüfung auslösen kann.",

  // ── risk sources ──
  "Ransomware group": "Ransomware-Gruppe",
  "Financially motivated organized cybercrime crew.": "Finanziell motivierte, organisierte Cybercrime-Gruppe.",
  "Extortion via encryption and data theft": "Erpressung durch Verschlüsselung und Datendiebstahl",
  "Disgruntled insider": "Verärgerter Innentäter",
  "Employee with legitimate access and a grievance.": "Beschäftigter mit legitimem Zugang und einem Groll.",
  "Revenge / financial gain": "Rache / finanzieller Vorteil",
  "Hacktivist collective": "Hacktivisten-Kollektiv",
  "Ideologically motivated group seeking disruption and publicity.": "Ideologisch motivierte Gruppe, der es um Störung und Öffentlichkeit geht.",
  "Protest / reputational damage": "Protest / Reputationsschaden",

  // ── target objectives ──
  "Extort a ransom": "Lösegeld erpressen",
  "Encrypt clinical systems and demand payment.": "Klinische Systeme verschlüsseln und Zahlung fordern.",
  "Sell patient data": "Patientendaten verkaufen",
  "Exfiltrate and monetize health records.": "Gesundheitsdaten abziehen und zu Geld machen.",
  "Disrupt hospital operations": "Klinikbetrieb stören",
  "Take services offline to draw public attention.": "Dienste lahmlegen, um öffentliche Aufmerksamkeit zu erzeugen.",

  // ── stakeholders ──
  "External IT maintenance provider": "Externer IT-Wartungsdienstleister",
  "Third party with remote maintenance access to core systems.": "Dritter mit Fernwartungszugang zu den Kernsystemen.",
  "Medical device supplier": "Medizingerätehersteller",
  "Vendor servicing networked medical devices.": "Lieferant, der vernetzte Medizingeräte wartet.",

  // ── strategic scenarios ──
  "Ransomware via maintenance access": "Ransomware über den Wartungszugang",
  "A financially-motivated ransomware crew compromises the external IT-maintenance provider and abuses its standing remote access to pivot from the maintenance host into the clinical network, ending in encryption of the core systems and an extortion demand.":
    "Eine finanziell motivierte Ransomware-Gruppe kompromittiert den externen IT-Wartungsdienstleister und missbraucht dessen dauerhaften Fernzugang, um vom Wartungsrechner in das klinische Netz zu wechseln. Am Ende stehen die Verschlüsselung der Kernsysteme und eine Lösegeldforderung.",
  "Supply-chain compromise via device vendor": "Lieferkettenangriff über den Gerätehersteller",
  "The attacker rides the remote-service connection of a networked-medical-device supplier to reach clinical systems and quietly exfiltrate patient data, exploiting trust in the third party rather than breaching the perimeter directly.":
    "Der Angreifer nutzt die Fernwartungsverbindung eines Herstellers vernetzter Medizingeräte, um klinische Systeme zu erreichen und unbemerkt Patientendaten abzuziehen. Er bricht nicht den Perimeter, sondern nutzt das Vertrauen in den Dritten.",
  "Operational disruption by hacktivists": "Betriebsstörung durch Hacktivisten",
  "An ideologically-motivated collective overwhelms the hospital's public-facing services with a denial-of-service campaign to interrupt care and draw media attention to their cause.":
    "Ein ideologisch motiviertes Kollektiv überlastet die öffentlich erreichbaren Dienste des Klinikums mit einer Denial-of-Service-Kampagne, um die Versorgung zu unterbrechen und mediale Aufmerksamkeit für sein Anliegen zu erzeugen.",
  "Insider data exfiltration": "Datenabfluss durch Innentäter",
  "A privileged, disgruntled insider abuses legitimate database access to copy bulk patient records onto external media, for revenge or resale, leaving few of the network traces an outside attacker would.":
    "Ein privilegierter, verärgerter Innentäter missbraucht seinen legitimen Datenbankzugang, um Patientenakten in großer Zahl auf externe Datenträger zu kopieren - aus Rache oder zum Weiterverkauf. Er hinterlässt kaum die Netzspuren, die ein externer Angreifer erzeugt.",

  // ── operational scenarios and their steps ──
  "Ransomware encryption of clinical systems": "Ransomware-Verschlüsselung der klinischen Systeme",
  "The full end-to-end kill chain a ransomware operator would follow: an initial spear-phish of the maintenance provider, persistence on the maintenance host, theft of cached admin credentials, lateral movement into the clinical network, exfiltration of patient records for double extortion, and finally encryption of the Hospital Information System.":
    "Die vollständige Kill-Chain, der ein Ransomware-Betreiber folgen würde: Spear-Phishing beim Wartungsdienstleister, Persistenz auf dem Wartungsrechner, Diebstahl zwischengespeicherter Administratorzugänge, seitliche Bewegung in das klinische Netz, Abfluss von Patientenakten für die doppelte Erpressung und schließlich Verschlüsselung des Krankenhausinformationssystems.",
  "Phishing the maintenance provider": "Phishing beim Wartungsdienstleister",
  "Spear-phishing email delivers a loader.": "Eine Spear-Phishing-Mail bringt einen Loader ein.",
  "Establish persistence via scheduled task": "Persistenz über eine geplante Aufgabe",
  "Register a scheduled task to survive reboots.": "Eine geplante Aufgabe eintragen, um Neustarts zu überdauern.",
  "Credential dumping on maintenance host": "Zugangsdaten vom Wartungsrechner abgreifen",
  "Harvest cached admin credentials.": "Zwischengespeicherte Administratorzugänge einsammeln.",
  "Lateral movement into clinical network": "Seitliche Bewegung ins klinische Netz",
  "Pivot via remote services.": "Über Remote-Dienste weiterspringen.",
  "Exfiltrate patient records": "Patientenakten abziehen",
  "Stage and copy records to an external server before encryption.": "Datensätze vor der Verschlüsselung sammeln und auf einen externen Server kopieren.",
  "Encrypt the HIS database": "KIS-Datenbank verschlüsseln",
  "Deploy ransomware on the core database.": "Ransomware auf der Kerndatenbank ausrollen.",
  "Insider exfiltration of patient records": "Abfluss von Patientenakten durch einen Innentäter",
  "A shorter, quieter chain: a privileged insider logs in with legitimate elevated credentials, queries and stages bulk patient records, and copies them onto an encrypted USB drive - producing few of the malware or lateral-movement artefacts an external attacker would leave.":
    "Eine kürzere, leisere Kette: Ein privilegierter Innentäter meldet sich mit legitimen erhöhten Rechten an, fragt Patientenakten in großer Zahl ab, sammelt sie und kopiert sie auf einen verschlüsselten USB-Datenträger - fast ohne die Schadsoftware- und Bewegungsspuren, die ein externer Angreifer hinterlässt.",
  "Abuse valid database credentials": "Gültige Datenbankzugänge missbrauchen",
  "Log in with legitimate elevated access.": "Mit legitimen erhöhten Rechten anmelden.",
  "Collect patient records": "Patientenakten zusammentragen",
  "Query and stage bulk patient records.": "Patientenakten in großer Zahl abfragen und sammeln.",
  "Copy records to removable media": "Akten auf Wechseldatenträger kopieren",
  "Exfiltrate onto an encrypted USB drive.": "Abzug auf einen verschlüsselten USB-Datenträger.",

  // ── security measures ──
  "Secure email gateway & phishing training": "Sicheres E-Mail-Gateway & Phishing-Schulung",
  "A secure email gateway filters malicious attachments and links, backed by regular phishing-awareness training so staff recognise and report the lures that would otherwise deliver the initial loader through the maintenance channel.":
    "Ein sicheres E-Mail-Gateway filtert schädliche Anhänge und Links, flankiert von regelmäßigen Phishing-Schulungen, damit Beschäftigte die Köder erkennen und melden, die sonst den ersten Loader über den Wartungsweg einbringen.",
  "MFA on remote maintenance access": "MFA am Fernwartungszugang",
  "Phishing-resistant multi-factor authentication enforced on all remote and third-party maintenance access, so stolen or phished credentials alone cannot open a session or be replayed after a credential dump.":
    "Phishing-resistente Mehr-Faktor-Authentisierung für jeden Fern- und Dienstleisterzugang, damit gestohlene oder erphishte Zugangsdaten allein keine Sitzung öffnen und nach einem Abgriff nicht wiederverwendet werden können.",
  "Network segmentation (IT / clinical VLANs)": "Netzsegmentierung (IT- / Klinik-VLANs)",
  "The clinical VLANs are firewalled off from the corporate IT network so that an attacker who lands in IT cannot move laterally into the ward and medical-device networks unimpeded, containing the blast radius of an intrusion.":
    "Die klinischen VLANs sind vom IT-Netz der Verwaltung durch Firewalls getrennt, damit ein Angreifer, der in der IT landet, nicht ungehindert in die Stations- und Medizingerätenetze weiterkommt. Das begrenzt die Reichweite eines Einbruchs.",
  "Egress monitoring & DLP": "Ausgangsüberwachung & DLP",
  "Egress monitoring and data-loss-prevention rules detect and block bulk transfers of health records to external destinations, whether staged over a web service before ransomware or copied to removable media by an insider.":
    "Ausgangsüberwachung und Regeln zur Verhinderung von Datenabfluss erkennen und blockieren die Übertragung großer Mengen von Gesundheitsdaten nach außen - ob über einen Webdienst vor der Verschlüsselung oder auf einen Wechseldatenträger durch einen Innentäter.",
  "EDR on clinical endpoints": "EDR auf klinischen Endgeräten",
  "Endpoint detection and response on clinical endpoints and servers flags the tell-tale behaviour of credential dumping, suspicious scheduled tasks and mass file encryption, giving the SOC a chance to contain the intrusion before impact.":
    "Endpoint Detection and Response auf klinischen Endgeräten und Servern meldet die verräterischen Muster von Zugangsdatenabgriff, auffälligen geplanten Aufgaben und Massenverschlüsselung und gibt dem SOC die Gelegenheit, den Einbruch vor dem Schaden einzudämmen.",
  "Offline immutable backups": "Unveränderliche Offline-Sicherungen",
  "Air-gapped, immutable backups of the patient database with regular restore drills, so that even if the Hospital Information System is encrypted the hospital can recover within hours rather than paying a ransom.":
    "Vom Netz getrennte, unveränderliche Sicherungen der Patientendatenbank mit regelmäßigen Wiederherstellungsübungen, damit das Klinikum selbst bei verschlüsseltem Krankenhausinformationssystem binnen Stunden wieder arbeitsfähig ist, statt Lösegeld zu zahlen.",
  "Audited access with published monitoring notice": "Protokollierter Zugriff mit ausgewiesener Überwachung",
  "Access to the patient database is logged per record and staff are told, in writing and at login, that access is audited and misuse is a disciplinary and criminal matter - a deterrent aimed at the insider who would otherwise assume the queries go unnoticed.":
    "Jeder Zugriff auf die Patientendatenbank wird datensatzgenau protokolliert, und Beschäftigte werden schriftlich und bei der Anmeldung darauf hingewiesen, dass Zugriffe geprüft werden und Missbrauch arbeits- und strafrechtliche Folgen hat - eine Abschreckung für den Innentäter, der sonst annimmt, seine Abfragen fielen nicht auf.",
  "Decommission the legacy maintenance gateway": "Altes Wartungs-Gateway abschalten",
  "The permanently open vendor maintenance gateway is removed and replaced by access brokered on request, so the standing external entry point the ransomware chain relies on no longer exists to be attacked.":
    "Das dauerhaft offene Wartungs-Gateway des Dienstleisters wird entfernt und durch einen auf Anforderung vermittelten Zugang ersetzt, sodass der ständige externe Einstiegspunkt, auf dem die Ransomware-Kette aufbaut, gar nicht mehr existiert.",

  // ── treatments ──
  "Treat: Ransomware via maintenance access": "Behandlung: Ransomware über den Wartungszugang",
  "Reduce rather than accept: the kill chain can be broken cost-effectively at the maintenance-access and lateral-movement stages, and the residual is derived from that coverage. Still in progress, so the residual likelihood is not yet fully realised.":
    "Reduzieren statt akzeptieren: Die Kill-Chain lässt sich beim Wartungszugang und bei der seitlichen Bewegung wirtschaftlich brechen, und das Restrisiko ist aus dieser Abdeckung abgeleitet. Die Umsetzung läuft noch, die verbleibende Wahrscheinlichkeit ist also noch nicht vollständig erreicht.",
  "Treat: Insider data exfiltration": "Behandlung: Datenabfluss durch Innentäter",
  "Reduce: the exfiltration stages of the kill chain are well covered, and the residual is derived from that coverage.":
    "Reduzieren: Die Abflussschritte der Kill-Chain sind gut abgedeckt, und das Restrisiko ist aus dieser Abdeckung abgeleitet.",
  "CISO": "CISO",
  "Data Protection Officer": "Datenschutzbeauftragte",

  // ── what the change log records ──
  "Raised to critical after the DPIA - leakage triggers mandatory breach notification.":
    "Nach der Datenschutz-Folgenabschätzung auf kritisch angehoben - ein Abfluss löst die Meldepflicht aus.",
  "Threat-intel: active ransomware campaigns targeting hospitals this quarter.":
    "Lagebild: in diesem Quartal laufende Ransomware-Kampagnen gegen Krankenhäuser.",
  "Gravity raised - encryption of the HIS halts emergency care.":
    "Schwere angehoben - eine Verschlüsselung des KIS legt die Notfallversorgung still.",
  "MFA rollout kicked off; treatment now in progress.":
    "MFA-Einführung gestartet; die Behandlung läuft.",
  "Modelled the end-to-end kill chain from the maintenance-access vector.":
    "Die durchgehende Kill-Chain ausgehend vom Wartungszugang modelliert.",
};
