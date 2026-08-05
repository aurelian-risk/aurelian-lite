// Central state (Zustand): taxonomy + studies, generic entity CRUD driven by
// the taxonomy, plus data-layer swap (bundle/taxonomy/data import) and
// migration from the legacy v1 fixed-schema format. Auto-persists (debounced).
import { create } from "zustand";
import type {
  AppState, Bundle, EntityRecord, FieldValue, ID, QuantTuning, Study, Taxonomy,
} from "./types";
import { DEFAULT_TAXONOMY, getType, reconcileTaxonomy, refFields } from "./taxonomy";
import { loadRaw, saveState } from "./persistence";
import { appendChange, diffValues, getEditor } from "./audit";

function uid(): ID {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function nowISO(): string { return new Date().toISOString(); }

export function emptyStudy(name: string, organization = "", scope = ""): Study {
  const ts = nowISO();
  return { id: uid(), name, organization, scope, createdAt: ts, updatedAt: ts, entities: [], layout: {} };
}

// ── Cascade delete across ref fields ──────────────────────────────────────
function cascadeDelete(tax: Taxonomy, study: Study, removeId: ID): Study {
  const toRemove = new Set<ID>([removeId]);
  let changed = true;
  let entities = study.entities;

  while (changed) {
    changed = false;
    const next: EntityRecord[] = [];
    for (const r of entities) {
      if (toRemove.has(r.id)) continue;
      const t = getType(tax, r.type);
      if (!t) { next.push(r); continue; }
      let values = r.values;
      let dirty = false;
      for (const f of refFields(t)) {
        const v = values[f.key];
        if (f.type === "multiref" && Array.isArray(v)) {
          const filtered = v.filter((x) => !toRemove.has(x as ID));
          if (filtered.length !== v.length) { values = { ...values, [f.key]: filtered }; dirty = true; }
        } else if (f.type === "ref" && typeof v === "string" && toRemove.has(v)) {
          if (f.required) { toRemove.add(r.id); changed = true; break; }
          values = { ...values, [f.key]: null }; dirty = true;
        }
      }
      if (toRemove.has(r.id)) { changed = true; continue; }
      next.push(dirty ? { ...r, values, updatedAt: nowISO() } : r);
    }
    entities = next;
  }
  return { ...study, entities };
}

// ── Legacy v1 → v2 migration ──────────────────────────────────────────────
const LEGACY_MAP: Record<string, { type: string; rename?: Record<string, string> }> = {
  businessAssets: { type: "business_asset", rename: { assetType: "asset_type" } },
  supportingAssets: { type: "supporting_asset", rename: { assetType: "asset_type" } },
  fearedEvents: { type: "feared_event", rename: { businessAssetId: "business_asset", impactType: "impact" } },
  riskOrigins: { type: "risk_origin" },
  targetObjectives: { type: "target_objective", rename: { riskOriginId: "risk_origin", aimsAt: "aims_at" } },
  stakeholders: { type: "stakeholder", rename: { providesAccessTo: "provides_access_to" } },
  strategicScenarios: { type: "strategic_scenario", rename: { riskOriginId: "risk_origin", stakeholderId: "stakeholder", fearedEventId: "feared_event" } },
};

function migrate(raw: unknown): AppState {
  const fresh: AppState = { version: 2, taxonomy: DEFAULT_TAXONOMY, studies: [], activeStudyId: null };
  if (!raw || typeof raw !== "object") return fresh;
  const obj = raw as Record<string, unknown>;
  if (obj.version === 2) {
    return {
      version: 2,
      // Stored taxonomies predate later additions to the default vocabulary; pick
      // those up additively instead of forcing a reset (see reconcileTaxonomy).
      taxonomy: reconcileTaxonomy((obj.taxonomy as Taxonomy) ?? DEFAULT_TAXONOMY),
      studies: (obj.studies as Study[]) ?? [],
      activeStudyId: (obj.activeStudyId as ID) ?? null,
    };
  }
  // v1: fixed arrays per study → generic entities.
  const studies = ((obj.studies as Record<string, unknown>[]) ?? []).map((s) => {
    const entities: EntityRecord[] = [];
    for (const [field, map] of Object.entries(LEGACY_MAP)) {
      for (const e of (s[field] as Record<string, FieldValue>[]) ?? []) {
        const values: Record<string, FieldValue> = {};
        for (const [k, v] of Object.entries(e)) {
          if (["id", "kind", "createdAt", "updatedAt"].includes(k)) continue;
          values[map.rename?.[k] ?? k] = v;
        }
        entities.push({
          id: (e.id as ID) ?? uid(), type: map.type, values,
          createdAt: (e.createdAt as string) ?? nowISO(), updatedAt: (e.updatedAt as string) ?? nowISO(),
        });
      }
    }
    return {
      id: (s.id as ID) ?? uid(), name: (s.name as string) ?? "Untitled",
      organization: (s.organization as string) ?? "", scope: (s.scope as string) ?? "",
      createdAt: (s.createdAt as string) ?? nowISO(), updatedAt: (s.updatedAt as string) ?? nowISO(),
      entities,
    } satisfies Study;
  });
  return { ...fresh, studies, activeStudyId: (obj.activeStudyId as ID) ?? null };
}

// ── Persistence scheduling ────────────────────────────────────────────────
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist(get: () => StoreState): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { taxonomy, studies, activeStudyId } = get();
    void saveState({ version: 2, taxonomy, studies, activeStudyId });
  }, 300);
}

function mutateActive(
  get: () => StoreState, set: (p: Partial<StoreState>) => void, fn: (s: Study) => Study,
): void {
  const { studies, activeStudyId } = get();
  if (!activeStudyId) return;
  set({ studies: studies.map((s) => (s.id === activeStudyId ? { ...fn(s), updatedAt: nowISO() } : s)) });
  schedulePersist(get);
}

export interface StoreState {
  hydrated: boolean;
  taxonomy: Taxonomy;
  studies: Study[];
  activeStudyId: ID | null;

  hydrate: () => Promise<void>;
  exportState: () => AppState;

  setTaxonomy: (tax: Taxonomy) => void;
  resetTaxonomy: () => void;
  /** Apply an imported bundle. studiesMode: replace|merge (ignored if no studies). */
  applyBundle: (b: Bundle, opts: { studiesMode: "replace" | "merge" }) => void;
  mergeStudies: (studies: Study[]) => number;

  createStudy: (name: string, organization?: string, scope?: string) => ID;
  updateStudy: (id: ID, patch: Partial<Pick<Study, "name" | "organization" | "scope">>) => void;
  deleteStudy: (id: ID) => void;
  setActiveStudy: (id: ID | null) => void;

  addEntity: (type: string, values: Record<string, FieldValue>, source?: string, comment?: string) => ID;
  updateEntity: (id: ID, values: Record<string, FieldValue>, comment?: string) => void;
  deleteEntity: (id: ID) => void;
  setNodePos: (id: ID, x: number, y: number) => void;
  setLayout: (layout: Record<ID, { x: number; y: number }>) => void;
  /** Persist (or clear, when tuning is null) the quantification tuning of an op scenario. */
  setQuantTuning: (opId: ID, tuning: QuantTuning | null) => void;
  /** Add or remove an operational scenario from quantification (opt-in). */
  toggleQuantScenario: (opId: ID, on: boolean) => void;
}

export const useStore = create<StoreState>((set, get) => ({
  hydrated: false,
  taxonomy: DEFAULT_TAXONOMY,
  studies: [],
  activeStudyId: null,

  hydrate: async () => {
    const raw = await loadRaw();
    const state = migrate(raw);
    set({ ...state, hydrated: true });
  },

  exportState: () => {
    const { taxonomy, studies, activeStudyId } = get();
    return { version: 2, taxonomy, studies, activeStudyId };
  },

  setTaxonomy: (tax) => { set({ taxonomy: tax }); schedulePersist(get); },
  resetTaxonomy: () => { set({ taxonomy: DEFAULT_TAXONOMY }); schedulePersist(get); },

  applyBundle: (b, opts) => {
    const patch: Partial<StoreState> = {};
    if (b.taxonomy) patch.taxonomy = reconcileTaxonomy(b.taxonomy);
    if (b.studies) {
      if (opts.studiesMode === "merge") {
        // Additive: fold incoming studies into existing ones sharing an id
        // (merging their entities, incoming overrides by entity id); append the rest.
        const byId = new Map(get().studies.map((s) => [s.id, s]));
        for (const inc of b.studies) {
          const cur = byId.get(inc.id);
          if (cur) {
            const ents = new Map(cur.entities.map((e) => [e.id, e]));
            for (const e of inc.entities) ents.set(e.id, e);
            byId.set(inc.id, { ...cur, ...inc, entities: [...ents.values()], updatedAt: nowISO() });
          } else byId.set(inc.id, inc);
        }
        patch.studies = [...byId.values()];
      } else {
        patch.studies = b.studies;
        patch.activeStudyId = null;
      }
    }
    set(patch);
    schedulePersist(get);
  },

  mergeStudies: (incoming) => {
    const existing = new Set(get().studies.map((s) => s.id));
    const added = incoming.map((s) => (existing.has(s.id) ? { ...s, id: uid() } : s));
    set({ studies: [...get().studies, ...added] });
    schedulePersist(get);
    return added.length;
  },

  createStudy: (name, organization = "", scope = "") => {
    const study = emptyStudy(name, organization, scope);
    set({ studies: [...get().studies, study], activeStudyId: study.id });
    schedulePersist(get);
    return study.id;
  },
  updateStudy: (id, patch) => {
    set({ studies: get().studies.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: nowISO() } : s)) });
    schedulePersist(get);
  },
  deleteStudy: (id) => {
    set({
      studies: get().studies.filter((s) => s.id !== id),
      activeStudyId: get().activeStudyId === id ? null : get().activeStudyId,
    });
    schedulePersist(get);
  },
  setActiveStudy: (id) => { set({ activeStudyId: id }); schedulePersist(get); },

  addEntity: (type, values, source, comment) => {
    const id = uid();
    const ts = nowISO();
    const history = appendChange(undefined, { editor: getEditor() || "anonymous", kind: "create", ts, comment });
    mutateActive(get, set, (study) => ({
      ...study, entities: [...study.entities, { id, type, values, createdAt: ts, updatedAt: ts, ...(source ? { source } : {}), history }],
    }));
    return id;
  },
  updateEntity: (id, values, comment) => {
    mutateActive(get, set, (study) => ({
      ...study,
      entities: study.entities.map((e) => {
        if (e.id !== id) return e;
        const changes = diffValues(e.values, values);
        if (!changes.length && !comment) return e;   // no-op edit: don't touch the record or its history
        const ts = nowISO();
        const history = appendChange(e.history, { editor: getEditor() || "anonymous", kind: "update", ts, changes, comment });
        return { ...e, values, updatedAt: ts, history };
      }),
    }));
  },
  deleteEntity: (id) => {
    const tax = get().taxonomy;
    mutateActive(get, set, (study) => {
      const layout = { ...(study.layout ?? {}) };
      delete layout[id];
      return cascadeDelete(tax, { ...study, layout }, id);
    });
  },
  setNodePos: (id, x, y) => {
    mutateActive(get, set, (study) => ({ ...study, layout: { ...(study.layout ?? {}), [id]: { x, y } } }));
  },
  setLayout: (layout) => {
    mutateActive(get, set, (study) => ({ ...study, layout: { ...(study.layout ?? {}), ...layout } }));
  },
  setQuantTuning: (opId, tuning) => {
    mutateActive(get, set, (study) => {
      const quant = { ...(study.quant ?? {}) };
      if (tuning) quant[opId] = tuning; else delete quant[opId];
      return { ...study, quant };
    });
  },
  toggleQuantScenario: (opId, on) => {
    mutateActive(get, set, (study) => {
      const cur = study.quantScenarios ?? [];
      const next = on ? (cur.includes(opId) ? cur : [...cur, opId]) : cur.filter((id) => id !== opId);
      const quant = { ...(study.quant ?? {}) };
      if (!on) delete quant[opId];                       // drop its tunings too when removed
      return { ...study, quantScenarios: next, quant };
    });
  },
}));

export function useActiveStudy(): Study | null {
  return useStore((s) => s.studies.find((st) => st.id === s.activeStudyId) ?? null);
}
