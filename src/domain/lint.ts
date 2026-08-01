// Analysis quality / completeness checks ("linter"). Surfaces gaps in a study -
// uncovered kill-chain steps, untreated risks, orphan entities, unfulfilled
// requirements, etc. - each with the affected entities and a fix hint. Purely
// deterministic and taxonomy-guarded: a rule is skipped if its types are absent.
import type { EntityRecord, Study, Taxonomy } from "./types";

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
  const ents = (key: string) => study.entities.filter((e) => e.type === key);
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
  const add = (id: string, title: string, severity: Severity, hint: string, type: string, affected: EntityRecord[]) =>
    checks.push({ id, title, severity, hint, affected, total: ents(type).length });

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
