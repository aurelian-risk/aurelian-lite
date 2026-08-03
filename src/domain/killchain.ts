// Domain rules for the kill-chain step graph (the `predecessors` / cascade edges).
//
// A kill chain is a left-to-right escalation. `predecessors` turns it into a DAG,
// but must not break that escalation, so we constrain which steps may be chosen:
//   • within the SAME operational scenario: only steps with a strictly smaller
//     step_order (forward-only — the order IS the escalation axis);
//   • from ANOTHER scenario: any step is allowed — this models a CASCADE (one
//     scenario's step enables another's), where a per-phase rule would be wrong
//     because each scenario has its own progression;
//   • never a choice that would close a cycle (checked transitively).
// These candidate rules apply only when AUTHORING; stored (possibly legacy) values
// are always tolerated on read — see [[killchain-predecessors-design]].
import type { EntityTypeDef, Study, Taxonomy } from "./types";
import { getType, recordTitle } from "./taxonomy";

// Detect the three fields we rely on, taxonomy-driven (no hard-coded keys):
// the self-referential multiref (predecessors), the parent scenario ref, the order.
export function stepFields(type: EntityTypeDef) {
  const predField = type.fields.find((f) => f.type === "multiref" && f.refType === type.key);
  const scenarioField = type.fields.find((f) => f.type === "ref" && f.refType && f.refType !== type.key);
  const orderField = type.fields.find((f) => f.type === "number");
  if (!predField || !scenarioField || !orderField) return null;
  return { predField, scenarioField, orderField };
}

export interface PredOption { id: string; label: string; group: string }

// Valid predecessor choices for a step, grouped for the dropdown. `self` carries the
// current (possibly unsaved) values: its id (undefined for a new step), its scenario,
// and its order.
export function predecessorCandidates(
  tax: Taxonomy, study: Study, type: EntityTypeDef,
  self: { id?: string; scenario: string; order: number },
): PredOption[] {
  const sf = stepFields(type);
  if (!sf) return [];
  const { predField, scenarioField, orderField } = sf;
  const steps = study.entities.filter((e) => e.type === type.key);

  // forward "precedes" graph: edge p → s whenever p is listed in s.predecessors.
  const fwd = new Map<string, string[]>();
  for (const s of steps) {
    const preds = Array.isArray(s.values[predField.key]) ? (s.values[predField.key] as string[]) : [];
    for (const p of preds) (fwd.get(p) ?? fwd.set(p, []).get(p)!).push(s.id);
  }
  // steps reachable FORWARD from self — picking any of them would close a cycle.
  const reach = new Set<string>();
  if (self.id) {
    const stack = [self.id];
    while (stack.length) {
      const n = stack.pop()!;
      for (const nx of fwd.get(n) ?? []) if (!reach.has(nx)) { reach.add(nx); stack.push(nx); }
    }
  }

  const scenTitle = (id: string) => {
    const sc = study.entities.find((e) => e.id === id);
    const st = sc ? getType(tax, sc.type) : undefined;
    return sc && st ? recordTitle(st, sc) : "another scenario";
  };

  const intra: PredOption[] = [], cross: PredOption[] = [];
  for (const c of steps) {
    if (c.id === self.id) continue;          // no self-edge
    if (reach.has(c.id)) continue;           // would close a cycle (hard block)
    const cScen = String(c.values[scenarioField.key] ?? "");
    const cOrder = Number(c.values[orderField.key] ?? 0);
    const title = recordTitle(type, c);
    if (cScen && cScen === self.scenario) {
      if (cOrder >= self.order) continue;    // intra: only strictly earlier
      intra.push({ id: c.id, label: `${cOrder} · ${title}`, group: "This scenario", order: cOrder } as PredOption & { order: number });
    } else {
      cross.push({ id: c.id, label: title, group: `Cascade from: ${scenTitle(cScen)}` });
    }
  }
  intra.sort((a, b) => ((a as PredOption & { order: number }).order) - ((b as PredOption & { order: number }).order));
  cross.sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
  return [...intra.map(({ id, label, group }) => ({ id, label, group })), ...cross];
}
