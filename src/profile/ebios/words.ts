// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// What this product calls things, per language.
//
// Aurelian Lite authors its taxonomy in English; this table gives the German READING of
// what is shown. Nothing here changes the taxonomy: `taxonomy.ts` is untouched, every
// stored value stays exactly as it was, and a study written in one language reads
// identically in the other. See docs/i18n.md for the key scheme.
//
// A sibling product built on this engine fills this differently. Grundschutz++ stores the
// published German BSI vocabulary, so ITS German table is empty for the same reason and
// its English one carries the readings.
//
// TWO THINGS ARE DELIBERATELY ABSENT, and both are the same rule — a name that something
// else looks up is data, not text:
//
//   · the 14 ATT&CK tactics, which are the stored `tactic` value AND MITRE's published
//     names. Translating them would break the match and invent a name MITRE never gave.
//   · the sector names, which live in `calibration.ts`, index `SECTOR_NOTES` and are
//     compared as strings by `frequency.ts`.
//
// The four treatment decisions ARE read here, and that is not a contradiction: the reading
// is translated, the stored value is not. `treatment.ts` still compares against
// "Reduce" | "Accept" | "Share" | "Avoid", and an export still carries those.
import type { Overlay } from "../../domain/i18n";

/** Rungs that several fields happen to share. Written once, then named per field below:
 *  the lookup is by field key, so a scale is not shared just by looking alike. */
const LOW_TO_CRITICAL = ["gering", "mittel", "hoch", "kritisch"];
const SEVERITY = ["vernachlässigbar", "spürbar", "schwer", "existenziell"];

export const WORDS: Record<string, Overlay> = {
  // Named, not filled. A language is on offer only if a table names it, and English needs
  // no entries here — a key nothing answers already shows what the taxonomy says, which is
  // English. Leaving this out would not save a line; it would take English off the list.
  en: {},

  de: {
    // The product's own tagline, shown under its name in the sidebar.
    "product.tagline": "Strukturierte Cyber-Risikoanalyse",

    // ── the workshops ──
    "group.ws1.label": "Werte & Umfang",
    "group.ws1.description": "Geschäftswerte, Zielobjekte, befürchtete Ereignisse",
    "group.ws2.label": "Risikoquellen",
    "group.ws2.description": "Angreifer und ihre Ziele",
    "group.ws3.label": "Strategische Szenarien",
    "group.ws3.description": "Beteiligte im Ökosystem und Angriffspfade",
    "group.ws4.label": "Operative Szenarien",
    "group.ws4.description": "Kill-Chains mit TTPs (Taktiken, Techniken und Prozeduren)",
    "group.ws5.label": "Behandlung",
    "group.ws5.description": "Sicherheitsmaßnahmen und Abdeckung",
    "group.quant.label": "Risikoquantifizierung",
    "group.quant.description": "Monte-Carlo-Simulation des Jahresschadens, aus dem qualitativen Modell abgeleitet",
    "group.compliance.label": "Compliance",
    "group.compliance.description": "Anforderungen aus Rahmenwerken und ihre Abdeckung",

    // ── the twelve registers ──
    "type.business_asset.label": "Geschäftswert",
    "type.business_asset.plural": "Geschäftswerte",
    "type.supporting_asset.label": "Zielobjekt",
    "type.supporting_asset.plural": "Zielobjekte",
    "type.feared_event.label": "Befürchtetes Ereignis",
    "type.feared_event.plural": "Befürchtete Ereignisse",
    "type.risk_origin.label": "Risikoquelle",
    "type.risk_origin.plural": "Risikoquellen",
    "type.target_objective.label": "Angriffsziel",
    "type.target_objective.plural": "Angriffsziele",
    "type.stakeholder.label": "Beteiligter",
    "type.stakeholder.plural": "Beteiligte",
    "type.strategic_scenario.label": "Strategisches Szenario",
    "type.strategic_scenario.plural": "Strategische Szenarien",
    "type.operational_scenario.label": "Operatives Szenario",
    "type.operational_scenario.plural": "Operative Szenarien",
    "type.kill_chain_step.label": "Kill-Chain-Schritt",
    "type.kill_chain_step.plural": "Kill-Chain-Schritte",
    "type.security_measure.label": "Sicherheitsmaßnahme",
    "type.security_measure.plural": "Sicherheitsmaßnahmen",
    "type.risk_treatment.label": "Risikobehandlung",
    "type.risk_treatment.plural": "Risikobehandlungen",
    "type.requirement.label": "Anforderung",
    "type.requirement.plural": "Anforderungen",

    // ── fields, under the name they carry in every type that has them ──
    "field.name.label": "Name",
    "field.description.label": "Beschreibung",
    "field.asset_type.label": "Art",
    "field.criticality.label": "Kritikalität",
    "field.supports.label": "Unterstützt",
    "field.supports.relation": "unterstützt",
    "field.business_asset.label": "Geschäftswert",
    "field.business_asset.relation": "betrifft",
    "field.impact.label": "Auswirkung",
    "field.severity.label": "Schwere",
    "field.category.label": "Kategorie",
    "field.motivation.label": "Motivation (Notiz)",
    "field.capability.label": "Fähigkeiten",
    "field.resources.label": "Ressourcen",
    "field.activity.label": "Aktivität",
    "field.relevance.label": "Relevanz",
    "field.aims_at.label": "Zielt auf",
    "field.aims_at.relation": "zielt auf",
    "field.exposure.label": "Exposition",
    "field.reliability.label": "Verlässlichkeit",
    "field.provides_access_to.label": "Ermöglicht Zugang zu",
    "field.provides_access_to.relation": "Zugang zu",
    "field.stakeholder.label": "Einstieg über",
    "field.stakeholder.relation": "Einstieg über",
    "field.feared_event.label": "Verursacht",
    "field.feared_event.relation": "verursacht",
    "field.likelihood.label": "Wahrscheinlichkeit",
    "field.gravity.label": "Schwere",
    "field.difficulty.label": "Schwierigkeit",
    "field.operational_scenario.label": "Teil von Szenario",
    "field.operational_scenario.relation": "Teil von",
    "field.step_order.label": "Reihenfolge",
    "field.tactic.label": "Taktik",
    "field.technique.label": "Technik / TTP",
    "field.technique.help": "z. B. T1566 Phishing",
    "field.targets_asset.label": "Zielt auf Objekt",
    "field.targets_asset.relation": "zielt auf",
    "field.predecessors.label": "Vorgänger",
    "field.predecessors.relation": "geht voraus",
    "field.predecessors.help": "Schritte, die vor diesem eintreten müssen. Innerhalb dieses Szenarios werden nur frühere Schritte angeboten (das hält die Eskalation vorwärts gerichtet); Schritte aus anderen Szenarien bilden eine Kaskade ab. Auswahlen, die einen Zyklus erzeugen würden, sind ausgeblendet.",
    "field.join.label": "Erfordert",
    "field.join.help": "Bei mehreren Vorgängern: „alle“ = jede Voraussetzung (UND), „eine“ = ein Pfad genügt (ODER).",
    "field.measure_type.label": "Wirkart",
    "field.measure_type.help": "Was die Maßnahme tatsächlich tut — die Quantifizierung leitet ihre Wirkung daraus ab. Präventiv: blockiert den Angreifer an dem Schritt, den sie abdeckt. Detektivisch: fasst ihn und bricht die Kette vor dem Ziel. Korrektiv: Schadensbegrenzung — senkt den Verlust, wenn der Angriff gelingt. Abschreckend: es werden weniger Versuche unternommen. Vermeidung: entfernt die Exposition, sodass es seltener zum Kontakt kommt.",
    "field.status.label": "Status",
    "field.priority.label": "Priorität",
    "field.implementation_level.label": "Umsetzung",
    "field.covers.label": "Deckt Schritte ab",
    "field.covers.relation": "deckt ab",
    "field.protects.label": "Schützt Werte",
    "field.protects.relation": "schützt",
    "field.fulfills.label": "Erfüllt Anforderungen",
    "field.fulfills.relation": "erfüllt",
    "field.decision.label": "Entscheidung",
    "field.owner.label": "Verantwortlich",
    "field.deadline.label": "Frist / Zieldatum",
    "field.justification.label": "Begründung",
    "field.justification.help": "Maßnahmen werden hier nicht erneut aufgeführt: sie mindern dieses Risiko bereits über die Kill-Chain (Maßnahme deckt Schritt ab). Das Restrisiko ist aus dieser Abdeckung abgeleitet.",
    "field.ref_id.label": "Referenz-ID",
    "field.framework.label": "Rahmenwerk",

    // ── the same field key, worded differently by the type that owns it ──
    // Each of these reads differently in English too; the shared entry above is the common
    // case and these are the exceptions, so they name their type.
    "field.target_objective.name.label": "Ziel",
    "field.kill_chain_step.name.label": "Schritt",
    "field.requirement.name.label": "Titel",
    "field.target_objective.risk_origin.label": "Verfolgt von",
    "field.target_objective.risk_origin.relation": "verfolgt von",
    "field.strategic_scenario.risk_origin.label": "Risikoquelle",
    "field.strategic_scenario.risk_origin.relation": "ausgelöst von",
    "field.operational_scenario.strategic_scenario.label": "Setzt um",
    "field.operational_scenario.strategic_scenario.relation": "setzt um",
    "field.risk_treatment.strategic_scenario.label": "Behandelt Risiko",
    "field.risk_treatment.strategic_scenario.relation": "behandelt",

    // ── in scope / in use ──
    // One field key, two meanings: for eleven types it is the perimeter, for a measure it
    // is whether the control is actually in place. The wording follows the meaning.
    "field.scope.label": "Einbezogen",
    "field.scope.help": "Ob dieser Datensatz in die Analyse eingeht. Ausgeschlossene Datensätze bleiben samt ihrer Bewertung erhalten, zählen aber in keiner Auswertung, keiner Grafik und keiner Kennzahl mehr mit.",
    "field.scope.options": ["ausgeschlossen", "einbezogen"],
    "field.security_measure.scope.label": "Genutzt",
    "field.security_measure.scope.help": "Ob diese Maßnahme hier tatsächlich umgesetzt ist. Eine aus einem Katalog übernommene, aber nicht eingeführte Maßnahme erfüllt keine Anforderung und deckt keinen Schritt ab.",
    "field.security_measure.scope.options": ["nicht genutzt", "genutzt"],
    "field.requirement.scope.help": "Für welche Anforderungen eines Rahmenwerks diese Studie einsteht. Hier geschaltet statt im Bearbeitungsformular, und das Erste, wonach die Tabelle filtert.",

    // ── scales ──
    "field.criticality.scale": LOW_TO_CRITICAL,
    "field.capability.scale": LOW_TO_CRITICAL,
    "field.resources.scale": LOW_TO_CRITICAL,
    "field.exposure.scale": LOW_TO_CRITICAL,
    "field.priority.scale": LOW_TO_CRITICAL,
    "field.severity.scale": SEVERITY,
    "field.gravity.scale": SEVERITY,
    "field.activity.scale": ["ruhend", "gelegentlich", "regelmäßig", "dauerhaft"],
    "field.relevance.scale": ["unwahrscheinlich", "möglich", "wahrscheinlich", "sehr wahrscheinlich"],
    "field.reliability.scale": ["sehr gering", "gering", "gut", "sehr gut"],
    "field.likelihood.scale": ["gering", "möglich", "wahrscheinlich", "nahezu sicher"],
    "field.difficulty.scale": ["trivial", "gering", "mittel", "hoch"],
    "field.implementation_level.scale": ["keine", "teilweise", "weitgehend", "vollständig"],

    // ── the readings of stored option values ──
    // The VALUE is untouched in every one of these. Only the reading changes.
    "field.business_asset.asset_type.options": ["Information", "Prozess", "Funktion"],
    "field.supporting_asset.asset_type.options": ["Software", "Hardware", "Netzwerk", "Personal", "Standort", "Prozess", "Datenträger", "Dienstleister"],
    "field.impact.options": ["Vertraulichkeit", "Integrität", "Verfügbarkeit", "Nachvollziehbarkeit"],
    "field.risk_origin.category.options": ["Staatlicher Akteur", "Cyberkriminelle", "Hacktivisten", "Terroristen", "Innentäter", "Wettbewerber", "Gelegenheitstäter"],
    "field.stakeholder.category.options": ["Kunde", "Lieferant", "Dienstleister", "Partner", "Behörde", "Wartung / IT-Support", "Tochtergesellschaft"],
    "field.join.options": ["alle", "eine"],
    "field.measure_type.options": ["Präventiv", "Detektivisch", "Korrektiv", "Abschreckend", "Vermeidung"],
    "field.security_measure.status.options": ["Umgesetzt", "Geplant", "Fehlt", "Empfohlen"],
    "field.risk_treatment.status.options": ["Vorgeschlagen", "In Umsetzung", "Umgesetzt", "Geprüft"],
    "field.decision.options": ["Reduzieren", "Akzeptieren", "Teilen", "Vermeiden"],
  },
};
