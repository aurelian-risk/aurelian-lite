// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Analysis quality / completeness checks ("linter"). Surfaces gaps in a study -
// uncovered kill-chain steps, untreated risks, orphan entities, unfulfilled
// requirements, etc. - each with the affected entities and a fix hint. Purely
// deterministic and taxonomy-guarded: a rule is skipped if its types are absent.
import type { EntityRecord, Study, Taxonomy } from "./types";
import { declaredClass, effectClassOf, hasEffectField } from "./controls";
import { isSetBack } from "./taxonomy";
import { t as tr } from "./i18n";

export type Severity = "high" | "medium" | "low";

export interface LintCheck {
  id: string;
  title: string;      // what is checked
  severity: Severity;
  hint: string;       // how to resolve a failure
  affected: EntityRecord[]; // entities that FAIL (empty = all good)
  total: number;      // entities of the checked type (for "X of Y")
}

export function lintStudy(tax: Taxonomy, study: Study): LintCheck[] {
  const has = (key: string) => tax.entityTypes.some((t) => t.key === key);
  // A record that is set back is present but not in play - a catalogue entry nobody has
  // taken up yet. Judging it reports the catalogue rather than the study: several hundred
  // published requirements with no measure against them bury the finding about the eight
  // that are in scope.
  const ents = (key: string) => study.entities.filter((e) => e.type === key && !isSetBack(tax, e));
  // ids referenced by `fromType.fieldKey` (handles ref + multiref)
  const referenced = (fromType: string, fieldKey: string): Set<string> => {
    const out = new Set<string>();
    for (const e of ents(fromType)) {
      const v = e.values[fieldKey];
      if (Array.isArray(v)) for (const id of v) { if (typeof id === "string") out.add(id); }
      else if (typeof v === "string" && v) out.add(v);
    }
    return out;
  };
  const checks: LintCheck[] = [];
  // Every check already carries an id, so the words it shows are looked up here rather
  // than at twenty-one call sites - a product gives them its own wording without this
  // file being touched. See docs/i18n.md.
  const add = (id: string, title: string, severity: Severity, hint: string, type: string, affected: EntityRecord[]) =>
    checks.push({ id, title: tr(`check.${id}.title`, title), severity,
      hint: tr(`check.${id}.hint`, hint), affected, total: ents(type).length });

  // Kill-chain steps not covered by any measure — the biggest exposure.
  if (has("kill_chain_step") && has("security_measure")) {
    const covered = referenced("security_measure", "covers");
    add("uncovered-steps", "Kill-chain steps with no security measure", "high",
      "Add a security measure that covers each exposed step, or accept the gap explicitly.",
      "kill_chain_step", ents("kill_chain_step").filter((s) => !covered.has(s.id)));
  }
  // Operational scenarios without any kill-chain step.
  if (has("operational_scenario") && has("kill_chain_step")) {
    const withSteps = referenced("kill_chain_step", "operational_scenario");
    add("empty-opscenario", "Operational scenarios with no kill-chain steps", "medium",
      "Model the kill chain (steps + tactics) for each operational scenario.",
      "operational_scenario", ents("operational_scenario").filter((o) => !withSteps.has(o.id)));
  }
  // Strategic scenarios not refined into an operational scenario.
  if (has("strategic_scenario") && has("operational_scenario")) {
    const refined = referenced("operational_scenario", "strategic_scenario");
    add("unrefined-strategic", "Strategic scenarios with no operational scenario", "low",
      "Refine each strategic scenario into at least one operational (kill-chain) scenario.",
      "strategic_scenario", ents("strategic_scenario").filter((s) => !refined.has(s.id)));
  }
  // Strategic scenarios (risks) with no treatment decision.
  if (has("strategic_scenario") && has("risk_treatment")) {
    const treated = referenced("risk_treatment", "strategic_scenario");
    add("untreated-risk", "Risks with no treatment decision", "medium",
      "Add a risk treatment (reduce / accept / share / avoid) with a residual level.",
      "strategic_scenario", ents("strategic_scenario").filter((s) => !treated.has(s.id)));
  }
  // Business assets with no feared event.
  if (has("business_asset") && has("feared_event")) {
    const feared = referenced("feared_event", "business_asset");
    add("asset-no-feared", "Business assets with no feared event", "medium",
      "Identify what could go wrong for each business asset (a feared event).",
      "business_asset", ents("business_asset").filter((a) => !feared.has(a.id)));
  }
  // Feared events never used by a strategic scenario.
  if (has("feared_event") && has("strategic_scenario")) {
    const used = referenced("strategic_scenario", "feared_event");
    add("feared-unused", "Feared events not linked to any strategic scenario", "low",
      "Connect each feared event to the scenario(s) that would cause it.",
      "feared_event", ents("feared_event").filter((f) => !used.has(f.id)));
  }
  // Supporting assets that support no business asset (orphans).
  if (has("supporting_asset")) {
    add("orphan-support", "Supporting assets not linked to a business asset", "low",
      "Link each supporting asset to the business asset(s) it supports.",
      "supporting_asset", ents("supporting_asset").filter((s) => {
        const v = s.values.supports; return !(Array.isArray(v) ? v.length : v);
      }));
  }
  // Requirements not fulfilled by any measure.
  if (has("requirement") && has("security_measure")) {
    const fulfilled = referenced("security_measure", "fulfills");
    add("req-uncovered", "Requirements not fulfilled by any measure", "medium",
      "Map a security measure to each requirement, or mark it out of scope.",
      "requirement", ents("requirement").filter((r) => !fulfilled.has(r.id)));
  }
  // Measures with no link (cover nothing, protect nothing, fulfil nothing).
  if (has("security_measure")) {
    add("measure-dangling", "Security measures with no target", "low",
      "Point each measure at the steps it covers, the assets it protects, or the requirements it fulfils.",
      "security_measure", ents("security_measure").filter((m) => {
        const any = (k: string) => { const v = m.values[k]; return Array.isArray(v) ? v.length : !!v; };
        return !any("covers") && !any("protects") && !any("fulfills");
      }));
  }
  // Measures with no effect class - they are quantified as preventive by default,
  // which is right for most controls but wrong for backups, monitoring or deterrence.
  if (has("security_measure") && hasEffectField(tax, "security_measure")) {
    add("measure-unclassified", "Security measures with no effect class", "medium",
      "Set the measure type. The quantification derives a control's effect from it - a corrective control reduces the loss, a detective one can break the chain, a deterrent one reduces attempts. Unclassified measures are counted as preventive.",
      "security_measure", ents("security_measure").filter((m) => !declaredClass(m)));
  }
  // ── What the effect classes make visible ────────────────────────────────
  // A measure on a step is not the same as a defence at that step: only blocking and
  // detecting measures stop an attacker there. These rules surface the gaps that a plain
  // "is anything attached" count cannot see - and that the quantification acts on.
  if (has("kill_chain_step") && has("security_measure")) {
    const steps = ents("kill_chain_step");
    const measures = ents("security_measure");
    const coversOf = (m: EntityRecord) => (Array.isArray(m.values.covers) ? m.values.covers as string[] : []);
    const onStep = (id: string) => measures.filter((m) => coversOf(m).includes(id));
    const stops = (m: EntityRecord) => { const c = effectClassOf(m); return c === "Preventive" || c === "Detective"; };
    const stepsOfScenario = (opId: string) => steps.filter((s) => s.values.operational_scenario === opId);

    // A step that carries measures, none of which stops anybody there. Reads as handled
    // in every "covered" count, and is wide open in the model.
    add("damage-control-only", "Kill-chain steps where nothing blocks or detects", "medium",
      "The measures on these steps act on the loss or on the number of attacks; none of them prevents or detects an attacker at the step itself. Add a preventive or detective measure, or accept the gap explicitly.",
      "kill_chain_step", steps.filter((s) => { const m = onStep(s.id); return m.length > 0 && !m.some(stops); }));

    // Steps that never show up in the tactic view because they carry no tactic.
    add("step-no-tactic", "Kill-chain steps with no tactic", "low",
      "A step without a tactic is missing from the tactic defence view. Set the tactic so the step is counted.",
      "kill_chain_step", steps.filter((s) => !String(s.values.tactic ?? "").trim()));

    if (has("operational_scenario")) {
      const ops = ents("operational_scenario");
      const measuresOf = (op: EntityRecord) => stepsOfScenario(op.id).flatMap((s) => onStep(s.id));

      // The finding the averaged model used to hide: a chain nothing stops anywhere.
      add("chain-nothing-stops", "Kill chains that nothing blocks or detects", "high",
        "No measure on these chains prevents or detects an attacker at any step; the measures present act on the loss or on the number of attacks. The quantification will show most attempts reaching the objective.",
        "operational_scenario", ops.filter((op) => stepsOfScenario(op.id).length > 0 && !measuresOf(op).some(stops)));

      // Watched everywhere, barred nowhere. Easy to miss, because every step looks
      // attended to - and it is the posture the averaged model flattered most.
      add("chain-detection-only", "Kill chains defended by detection alone", "high",
        "These chains carry no preventive measure at any step - they are only monitored. Detection provides an opportunity to interrupt an intrusion, and only where a response capability exists; it does not prevent access. Add at least one preventive measure, or record the exposure as accepted.",
        "operational_scenario", ops.filter((op) => {
          const m = measuresOf(op);
          return m.some((x) => effectClassOf(x) === "Detective") && !m.some((x) => effectClassOf(x) === "Preventive");
        }));

      // Detection is only worth what the response makes of it - the model scales it by
      // the corrective capability, so a chain watched but not recoverable is a real gap.
      add("detection-no-response", "Monitored chains with no way to respond", "medium",
        "These chains carry detective measures but no corrective one, so the model credits them with almost no response capability. Detection that cannot be acted upon reduces risk only marginally.",
        "operational_scenario", ops.filter((op) => {
          const m = measuresOf(op);
          return m.some((x) => effectClassOf(x) === "Detective") && !m.some((x) => effectClassOf(x) === "Corrective");
        }));

      // Without predecessors the chain is read as a straight line, so alternative routes
      // and true prerequisites never enter the calculation.
      add("chain-no-prerequisites", "Kill chains modelled as a straight line", "low",
        "No step in these chains names its prerequisites, so the chain is read as a sequence in step order. Set 'preceded by' wherever a step genuinely requires an earlier one - alternative routes and choke points only become visible once the prerequisites are modelled.",
        "operational_scenario", ops.filter((op) => {
          const ss = stepsOfScenario(op.id);
          return ss.length > 2 && !ss.some((s) => Array.isArray(s.values.predecessors) && (s.values.predecessors as string[]).length);
        }));

      // A treatment that claims to reduce, with nothing on the chain doing the reducing.
      if (has("risk_treatment") && has("strategic_scenario")) {
        add("reduce-without-measures", "Risks treated as 'Reduce' with nothing reducing them", "medium",
          "The decision states reduction, but no measure is attached to any step of the chains behind this risk. Either attach the measures that justify the decision, or change it to accepted.",
          "risk_treatment", ents("risk_treatment").filter((t) => {
            if (String(t.values.decision ?? "") !== "Reduce") return false;
            const sid = t.values.strategic_scenario;
            const chains = ops.filter((op) => op.values.strategic_scenario === sid);
            return chains.length > 0 && !chains.some((op) => measuresOf(op).length > 0);
          }));
      }
    }
  }

  // ── What the quantification cannot read ─────────────────────────────────
  //
  // The model derives how often a scenario is attempted, and what an attempt is up
  // against, from fields the analyst fills in. Where one is missing it falls back to a
  // neutral default rather than guessing - which is honest, but silent. These checks
  // are what makes the silence visible: each one names a figure that is currently
  // resting on a default instead of on the analysis.

  // The actor class selects the base rate - the one figure the whole frequency side
  // hangs off. Without it every actor is charged the same generic rate.
  if (has("risk_origin")) {
    add("actor-no-category", "Risk sources with no category", "medium",
      "The category selects how often an actor of this kind attacks at all - a criminal crew and a state actor differ by more than an order of magnitude. Without it the quantification charges a generic rate.",
      "risk_origin", ents("risk_origin").filter((r) => !String(r.values.category ?? "").trim()));
  }

  // Target objectives answer "why us", the strongest study-specific term in the
  // attempt rate. Without any, the model can only fall back to the relevance rating.
  if (has("risk_origin") && has("target_objective")) {
    const pursued = referenced("target_objective", "risk_origin");
    add("actor-no-objective", "Risk sources with no target objective", "low",
      "An objective linked to a business asset is what tells the model this actor wants something of yours specifically. Without one, how often it attacks rests on the relevance rating alone.",
      "risk_origin", ents("risk_origin").filter((r) => !pursued.has(r.id)));
  }

  // The entry step's technique feeds BOTH sides: how easily contact happens, and how
  // much skill the first foothold takes. It is the single most valuable field on a chain.
  if (has("kill_chain_step")) {
    const steps = ents("kill_chain_step");
    const isPred = new Set<string>();
    for (const st of steps) {
      const v = st.values.predecessors;
      if (Array.isArray(v)) for (const id of v) { if (typeof id === "string") isPred.add(id); }
    }
    const anyEdge = isPred.size > 0;
    const entries = steps.filter((st) => {
      const v = st.values.predecessors;
      const preds = Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
      return anyEdge ? preds.length === 0 : Number(st.values.step_order ?? 0) === 1;
    });
    add("entry-no-technique", "Chains whose first step names no technique", "medium",
      "The entry technique decides two things at once: how often the actor gets into contact, and how much skill the first foothold takes. Naming it (e.g. T1566 Phishing) is the cheapest way to sharpen both.",
      "kill_chain_step", entries.filter((st) => !/T\d{4}/.test(String(st.values.technique ?? ""))));
  }

  // Risk sources not used by any strategic scenario.
  if (has("risk_origin") && has("strategic_scenario")) {
    const used = referenced("strategic_scenario", "risk_origin");
    add("source-unused", "Risk sources not used in any scenario", "low",
      "Either build a scenario for the risk source or remove it.",
      "risk_origin", ents("risk_origin").filter((o) => !used.has(o.id)));
  }
  return checks;
}

const RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
/** Failing checks first, by severity then size. */
export function sortChecks(checks: LintCheck[]): LintCheck[] {
  return [...checks].sort((a, b) => {
    const af = a.affected.length > 0, bf = b.affected.length > 0;
    if (af !== bf) return af ? -1 : 1;
    if (a.severity !== b.severity) return RANK[a.severity] - RANK[b.severity];
    return b.affected.length - a.affected.length;
  });
}
