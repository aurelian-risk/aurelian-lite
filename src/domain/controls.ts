// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Effect classification of security measures: WHICH risk factor a control moves.
// A measure is not defined, for quantification purposes, by how much work it is but
// by its mechanism - deterring an attempt, removing the exposure, resisting a step,
// detecting an intrusion in time, or recovering from the loss. Each class therefore
// has its own channel into the model instead of all of them landing on "resistance".
//
// The class is read from the measure's own `measure_type` field; an unclassified
// measure falls back to Preventive (the historical behaviour), and the completeness
// linter surfaces it so the default stays visible rather than silent.
import type { EntityRecord, Taxonomy } from "./types";
import { t as tr } from "./i18n";

export type EffectClass = "Preventive" | "Detective" | "Corrective" | "Deterrent" | "Avoidance";

/** The field a measure carries its effect class in. */
export const EFFECT_FIELD = "measure_type";

export const EFFECT_CLASSES: EffectClass[] = ["Preventive", "Detective", "Corrective", "Deterrent", "Avoidance"];

/** An unclassified measure is treated as resisting the step it covers. */
export const DEFAULT_EFFECT_CLASS: EffectClass = "Preventive";

/** What each class does to the quantitative model - shown as field help and in the
 *  factor tree, so the classification is a modelling decision, not a label.
 *
 *  A function, not a table: a table built when this module loads holds whatever language
 *  was current at import and never changes again. */
export const effectChannel = (c: EffectClass): string => ({
  Preventive: tr("ui.effect.preventive", "blocks the attacker at the step it covers - he must overcome it to proceed"),
  Detective: tr("ui.effect.detective", "detects the intrusion: before the objective it can interrupt the chain, at the objective it only shortens the event"),
  Corrective: tr("ui.effect.corrective", "damage control - reduces the loss and the follow-on damage after a successful attack, not its probability"),
  Deterrent: tr("ui.effect.deterrent", "reduces the number of attempts made"),
  Avoidance: tr("ui.effect.avoidance", "removes the exposure, so the actor makes contact less often"),
}[c]);

const isClass = (v: unknown): v is EffectClass => typeof v === "string" && (EFFECT_CLASSES as string[]).includes(v);

/** The class the analyst actually declared, or null when the measure is unclassified. */
export function declaredClass(m: EntityRecord): EffectClass | null {
  const v = m.values[EFFECT_FIELD];
  return isClass(v) ? v : null;
}

/** The class the model uses - the declared one, or the default for unclassified measures. */
export function effectClassOf(m: EntityRecord): EffectClass {
  return declaredClass(m) ?? DEFAULT_EFFECT_CLASS;
}

/** Whether a taxonomy models effect classes at all (a custom one may not). */
export function hasEffectField(tax: Taxonomy, typeKey: string): boolean {
  const t = tax.entityTypes.find((x) => x.key === typeKey);
  return !!t?.fields.some((f) => f.key === EFFECT_FIELD && f.type === "enum");
}

/** Group measures by the channel they act on. Unclassified measures land in the default. */
export function byEffectClass(measures: EntityRecord[]): Record<EffectClass, EntityRecord[]> {
  const out = Object.fromEntries(EFFECT_CLASSES.map((c) => [c, [] as EntityRecord[]])) as Record<EffectClass, EntityRecord[]>;
  for (const m of measures) out[effectClassOf(m)].push(m);
  return out;
}
