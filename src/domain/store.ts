// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Central state (Zustand): taxonomy + studies, generic entity CRUD driven by
// the taxonomy, plus data-layer swap (bundle/taxonomy/data import) and
// migration from the legacy v1 fixed-schema format. Auto-persists (debounced).
import { create } from "zustand";
import { ownKey, sealStudy } from "./keys";
import { forgetStudy } from "./viewstate";
import type {
  AppState, Bundle, ChangeEntry, EntityRecord, FieldValue, ID, QuantTuning, Study, Taxonomy,
} from "./types";
import { DEFAULT_TAXONOMY, getType, recordTitle, reconcileTaxonomy, refFields } from "./taxonomy";
import { reconcileCalibration, type Calibration } from "./calibration";
import { scopeValue } from "./scope";
import { loadRaw, saveState } from "./persistence";
import { appendAll, appendLog, diffValues, entryKey, getEditor, hashValues, sealLog, STUDY_SCOPE, verdictText, verifyLog, type LogInput } from "./audit";

function uid(): ID {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function nowISO(): string { return new Date().toISOString(); }

export function emptyStudy(name: string, organization = "", scope = ""): Study {
  const ts = nowISO();
  return { id: uid(), name, organization, scope, createdAt: ts, updatedAt: ts, entities: [], layout: {} };
}

// ── Log helpers ───────────────────────────────────────────────────────────
const titleOf = (tax: Taxonomy, rec?: EntityRecord): string => {
  if (!rec) return "a record";
  const t = getType(tax, rec.type);
  return t ? recordTitle(t, rec) : rec.id;
};
/** The identifying part of a log entry: who, when, and which record (typed and named,
 *  so the entry still reads properly once the record itself is gone). */
const stamp = (tax: Taxonomy, rec: EntityRecord, ts: string) => ({
  ts, editor: getEditor() || "anonymous",
  entity: rec.id, entityType: rec.type, title: titleOf(tax, rec),
});

// ── Cascade delete across ref fields ──────────────────────────────────────
/** Deleting a record also removes whatever required it, and clears references to it on
 *  the records that survive. Both have to be reported: the removals become delete
 *  entries in the log, and the cleared references are real value changes that need
 *  update entries - without them those records would immediately read as edited
 *  outside the application. */
function cascadeDelete(tax: Taxonomy, study: Study, removeId: ID, ts: string): {
  study: Study; removed: EntityRecord[]; touched: Array<{ before: EntityRecord; after: EntityRecord }>;
} {
  const toRemove = new Set<ID>([removeId]);
  const before = new Map(study.entities.map((e) => [e.id, e]));
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
      next.push(dirty ? { ...r, values, updatedAt: ts } : r);
    }
    entities = next;
  }
  const removed = [...toRemove].map((id) => before.get(id)!).filter(Boolean);
  const touched = entities
    .filter((r) => before.get(r.id) && before.get(r.id) !== r)
    .map((r) => ({ before: before.get(r.id)!, after: r }));
  return { study: { ...study, entities }, removed, touched };
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
    // Stored taxonomies predate later additions to the default vocabulary; pick
    // those up additively instead of forcing a reset (see reconcileTaxonomy).
    const taxonomy = reconcileTaxonomy((obj.taxonomy as Taxonomy) ?? DEFAULT_TAXONOMY);
    return {
      version: 2,
      taxonomy,
      // A stored study keeps its calibration edits and picks up tables added to the
      // defaults since it was saved, rather than being reset or left short.
      studies: ((obj.studies as Study[]) ?? []).map((s) => {
        const st = migrateStudyLog(taxonomy, s);
        return st.calibration ? { ...st, calibration: reconcileCalibration(st.calibration) } : st;
      }),
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

/** Bring a study onto the study-wide log.
 *
 *  Studies written before it carry a per-entity `history`; those entries are folded into
 *  one chain in timestamp order. Records that never had a history at all still have to be
 *  accounted for, or they would read as "added from outside" - they get a create entry
 *  from their own createdAt, attributed to nobody, which is the honest statement: the
 *  record predates the log. Idempotent - a study that already has a log is left alone. */
function migrateStudyLog(tax: Taxonomy, study: Study): Study {
  if (study.log) return study;
  type Pending = LogInput & { _sort: string };
  const pending: Pending[] = [];
  for (const rec of study.entities) {
    const base = { entity: rec.id, entityType: rec.type, title: titleOf(tax, rec) };
    const hist = rec.history ?? [];
    if (!hist.length) {
      pending.push({ ...base, ts: rec.createdAt, editor: "unknown", kind: "create", _sort: rec.createdAt,
        comment: "Recorded before this study kept a change log." });
      continue;
    }
    hist.forEach((h, i) => pending.push({
      ...base, ts: h.ts, editor: h.editor, kind: h.kind === "delete" ? "update" : h.kind,
      changes: h.changes, comment: h.comment, _sort: h.ts + String(i).padStart(4, "0"),
    }));
  }
  pending.sort((a, b) => (a._sort < b._sort ? -1 : a._sort > b._sort ? 1 : 0));
  // Only the newest entry per record carries a state fingerprint - earlier states cannot
  // be reconstructed, and verification only ever compares against the newest one.
  const lastIdx = new Map<string, number>();
  pending.forEach((p, i) => lastIdx.set(p.entity, i));
  const now = new Map(study.entities.map((e) => [e.id, e]));
  const entries: LogInput[] = pending.map(({ _sort, ...p }, i) => {
    void _sort;
    const rec = now.get(p.entity);
    return rec && lastIdx.get(p.entity) === i ? { ...p, state: hashValues(rec.values) } : p;
  });
  return { ...study, log: sealLog(entries), entities: study.entities.map(({ history, ...e }) => { void history; return e; }) };
}

/** The entries to write when a study arrives in a file and the analyst confirms it.
 *
 *  The incoming entries are ADOPTED, not discarded: taking on external data means taking
 *  on its history too, so a colleague's work stays visible. They are re-hashed as part of
 *  our chain and de-duplicated against what we already hold.
 *
 *  Whatever the file's own log did not cover - records edited outside their app, or never
 *  logged at all - gets an entry that states so and fixes the fingerprint. A closing
 *  study-level entry records the import and what the source's log was worth, so a chain
 *  that had to be re-established never looks like one that was always sound.
 *
 *  `known` is the receiving study's existing log, if we are merging into one. */
function importEntries(
  tax: Taxonomy, incoming: Study, result: EntityRecord[], removed: EntityRecord[],
  ts: string, from: string, mode: "replace" | "merge", known?: ChangeEntry[],
  sealNote?: string,
): LogInput[] {
  const base = migrateStudyLog(tax, incoming);
  // The verdict shown to the analyst is about the FILE, and only about the file - that is
  // what they are being asked to vouch for.
  const verdict = verifyLog(base.log, base.entities);
  const editor = getEditor() || "anonymous";
  const seen = new Set((known ?? []).map(entryKey));
  // A seal from the file is taken over as a RECEIVED one. It was made about that file's
  // chain and is being re-chained here, so it can never bind to this log again - asking it
  // to would report tampering where nothing was tampered with. What it was worth is
  // checked before the import and written into the closing entry below.
  const strip = ({ seq, hash, prevHash, seal, ...rest }: ChangeEntry): LogInput => {
    void seq; void hash; void prevHash;
    return seal ? { ...rest, seal: { ...seal, received: from } } : rest;
  };
  const adopted = (base.log ?? []).map(strip).filter((e) => !seen.has(entryKey(e)));

  // Which records are STILL unaccounted for once the file's entries have been folded in -
  // measured against the resulting study, not against the file on its own. When we are
  // merging, our own log already covers most of it, and writing "not covered by that
  // file's log" for records we have tracked all along would be noise, not evidence.
  const tentative = appendAll(known, adopted);
  const after = verifyLog(tentative, result);
  const gaps = new Set([...after.drifted, ...after.untracked]);
  const fixes: LogInput[] = result.filter((e) => gaps.has(e.id)).map((e) => ({
    ts, editor, kind: "import" as const, entity: e.id, entityType: e.type, title: titleOf(tax, e),
    comment: `Taken over from ${from}; not accounted for by that file's change log.`,
    state: hashValues(e.values),
  }));
  // Records a destructive import drops. They are a consequence of the import like any
  // other, so they belong IN the chain - the alternative would be to discard the chain
  // that is supposed to prove the replacement happened.
  const drops: LogInput[] = removed.map((e) => ({
    ts, editor, kind: "delete" as const, entity: e.id, entityType: e.type, title: titleOf(tax, e),
    comment: `Not present in ${from}; dropped when that file replaced this study.`,
  }));
  return [...adopted, ...drops, ...fixes, {
    ts, editor, kind: "import" as const, entity: STUDY_SCOPE, entityType: "", title: base.name,
    // The seal verdict belongs IN the chain. Once written here, "this file arrived sealed
    // by that key, and the signature checked out" is itself a tamper-evident record - which
    // is the only durable answer, since the seal itself cannot be re-verified against this
    // log after being re-chained into it.
    comment: `${mode === "replace" ? "Replaced by" : "Merged with"} ${from} - ${verdictText(verdict)}. `
      + (sealNote ? `${sealNote} ` : "Carried no seal. ")
      + `Confirmed, and the chain continues from here.`,
  }];
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
  /** Set (or clear, restoring the defaults) the active study's quantification
   *  parameters. Part of the study, so it travels with every export of it. */
  setCalibration: (cal: Calibration | null) => void;
  /** Apply an imported bundle. studiesMode: replace|merge (ignored if no studies).
   *  `source` names the file: confirming an import re-seals the affected study's log and
   *  records the import in it, which is how a chain broken by an outside edit is put
   *  back on a defensible footing. */
  applyBundle: (b: Bundle, opts: { studiesMode: "replace" | "merge"; source?: string;
    /** What the file's seals were worth, checked BEFORE the import - one line per study,
     *  by study id. Written into the chain, because a seal cannot be re-verified against
     *  this log once it has been re-chained into it. */
    sealNotes?: Record<string, string> }) => void;
  mergeStudies: (studies: Study[]) => number;

  createStudy: (name: string, organization?: string, scope?: string) => ID;
  updateStudy: (id: ID, patch: Partial<Pick<Study, "name" | "organization" | "scope" | "sector">>) => void;
  deleteStudy: (id: ID) => void;
  /** Sign the head of the active study's log. Resolves to the fingerprint used, or null
   *  when there is no key or nothing to seal. */
  sealActive: (by: string) => Promise<string | null>;
  setActiveStudy: (id: ID | null) => void;

  addEntity: (type: string, values: Record<string, FieldValue>, source?: string, comment?: string) => ID;
  updateEntity: (id: ID, values: Record<string, FieldValue>, comment?: string) => void;
  /** Put a set of records in or out of scope in ONE action - the record asked about and
   *  everything scope.ts says goes with it. One entry per record, all in the same instant,
   *  so the log reads as the single decision it was rather than as five separate edits. */
  setScope: (ids: ID[], inPlay: boolean, comment?: string) => void;
  deleteEntity: (id: ID, comment?: string) => void;
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
  setCalibration: (cal) => mutateActive(get, set, (st) => {
    const next = { ...st };
    if (cal) next.calibration = cal; else delete next.calibration;
    return next;
  }),

  applyBundle: (b, opts) => {
    const patch: Partial<StoreState> = {};
    const tax = b.taxonomy ? reconcileTaxonomy(b.taxonomy) : get().taxonomy;
    if (b.taxonomy) patch.taxonomy = tax;
    if (b.studies) {
      const ts = nowISO();
      const from = opts.source ? `“${opts.source}”` : "an imported file";
      // Both modes CONTINUE the receiving study's chain rather than replacing it. The
      // difference is what happens to the records: additive folds the incoming ones in,
      // destructive lets the file decide the contents and records the dropped records as
      // deletions. Throwing the chain away on a destructive import would destroy the very
      // evidence that the replacement took place.
      const known = new Map(get().studies.map((s) => [s.id, s]));
      const built = b.studies.map((inc) => {
        const cur = known.get(inc.id);
        const keepOwn = opts.studiesMode === "merge" && !!cur;
        const ents = new Map(keepOwn ? cur!.entities.map((e) => [e.id, e]) : []);
        for (const e of inc.entities) ents.set(e.id, e);
        const entities = [...ents.values()];
        const dropped = cur && !keepOwn ? cur.entities.filter((e) => !ents.has(e.id)) : [];
        return {
          ...(cur ?? {}), ...inc, entities, updatedAt: ts,
          log: appendAll(cur?.log, importEntries(tax, inc, entities, dropped, ts, from, opts.studiesMode, cur?.log,
            opts.sealNotes?.[inc.id])),
        } as Study;
      });
      if (opts.studiesMode === "merge") {
        const all = new Map(known);
        for (const s of built) all.set(s.id, s);
        patch.studies = [...all.values()];
      } else {
        // Studies the file does not mention are dropped wholesale, logs and all - there is
        // no app-wide chain for them to be recorded in.
        patch.studies = built;
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
    const ts = nowISO(), editor = getEditor() || "unknown";
    set({ studies: get().studies.map((s) => {
      if (s.id !== id) return s;
      // What the study says about itself is part of the study. The sector is the one that
      // moves numbers - it selects the base-rate exception behind every attempt rate - so
      // a change to it that left no trace was a change to every risk figure that left no
      // trace. Name, organisation and scope are printed in the report and belong for the
      // same reason. Nothing is written when nothing actually changed.
      const before = { name: s.name, organization: s.organization, scope: s.scope, sector: s.sector ?? "" };
      const after = { ...before, ...Object.fromEntries(
        Object.entries(patch).map(([k, v]) => [k, v ?? ""])) } as typeof before;
      const changes = diffValues(before as unknown as Record<string, FieldValue>,
        after as unknown as Record<string, FieldValue>);
      const next = { ...s, ...patch, updatedAt: ts };
      if (!changes.length) return next;
      return { ...next, log: appendLog(s.log, {
        ts, editor, kind: "update", entity: STUDY_SCOPE, entityType: "", title: after.name,
        changes, state: hashValues(after as unknown as Record<string, FieldValue>),
      }) };
    }) });
    schedulePersist(get);
  },
  deleteStudy: (id) => {
    set({
      studies: get().studies.filter((s) => s.id !== id),
      activeStudyId: get().activeStudyId === id ? null : get().activeStudyId,
    });
    forgetStudy(id);   // its folds have nothing left to describe
    schedulePersist(get);
  },
  sealActive: async (by) => {
    const study = get().studies.find((s) => s.id === get().activeStudyId);
    const key = ownKey();
    if (!study || !key) return null;
    const log = study.log ?? [];
    const head = log.length ? log[log.length - 1].hash : "";
    const ts = new Date().toISOString();
    const seal = await sealStudy(study, head, log.length, by, key, ts);
    // The seal is an entry like any other, so the next change chains onto it and a later
    // seal covers the earlier ones. Its own hash covers the signature (see payloadOf).
    set({ studies: get().studies.map((s) => s.id !== study.id ? s : {
      ...s, updatedAt: ts,
      log: appendLog(s.log, { ts, editor: by, kind: "seal", entity: STUDY_SCOPE,
        entityType: "", title: "Sealed", comment: `Sealed by ${seal.kid}`, seal }),
    }) });
    schedulePersist(get);
    return seal.kid;
  },
  setActiveStudy: (id) => { set({ activeStudyId: id }); schedulePersist(get); },

  addEntity: (type, values, source, comment) => {
    const id = uid();
    const ts = nowISO();
    const tax = get().taxonomy;
    mutateActive(get, set, (study) => {
      const rec: EntityRecord = { id, type, values, createdAt: ts, updatedAt: ts, ...(source ? { source } : {}) };
      return {
        ...study,
        entities: [...study.entities, rec],
        log: appendLog(study.log, { ...stamp(tax, rec, ts), kind: "create", comment, state: hashValues(values) }),
      };
    });
    return id;
  },
  updateEntity: (id, values, comment) => {
    const tax = get().taxonomy;
    mutateActive(get, set, (study) => {
      const cur = study.entities.find((e) => e.id === id);
      if (!cur) return study;
      const changes = diffValues(cur.values, values);
      if (!changes.length && !comment) return study;   // no-op edit: leave record and log alone
      const ts = nowISO();
      const next = { ...cur, values, updatedAt: ts };
      return {
        ...study,
        entities: study.entities.map((e) => (e.id === id ? next : e)),
        log: appendLog(study.log, { ...stamp(tax, next, ts), kind: "update", changes, comment, state: hashValues(values) }),
      };
    });
  },
  setScope: (ids, inPlay, comment) => {
    const tax = get().taxonomy;
    mutateActive(get, set, (study) => {
      const ts = nowISO();
      const want = new Set(ids);
      const entries: LogInput[] = [];
      const entities = study.entities.map((e) => {
        if (!want.has(e.id)) return e;
        const sv = scopeValue(tax, e, inPlay);
        if (!sv || String(e.values[sv.key] ?? "") === sv.value) return e;   // already there
        const values = { ...e.values, [sv.key]: sv.value };
        const next = { ...e, values, updatedAt: ts };
        entries.push({ ...stamp(tax, next, ts), kind: "update",
          changes: diffValues(e.values, values), comment, state: hashValues(values) });
        return next;
      });
      if (!entries.length) return study;
      return { ...study, entities, log: appendAll(study.log, entries) };
    });
  },
  deleteEntity: (id, comment) => {
    const tax = get().taxonomy;
    mutateActive(get, set, (study) => {
      const ts = nowISO();
      const { study: pruned, removed, touched } = cascadeDelete(tax, study, id, ts);
      const layout = { ...(pruned.layout ?? {}) };
      for (const r of removed) delete layout[r.id];
      // One entry per removed record - the primary one and everything the cascade took
      // with it - plus an update for every record whose references were cleared.
      const entries: LogInput[] = [
        ...removed.map((r) => ({
          ...stamp(tax, r, ts), kind: "delete" as const,
          comment: r.id === id ? comment : `Removed with “${titleOf(tax, study.entities.find((e) => e.id === id))}”.`,
        })),
        ...touched.map((t) => ({
          ...stamp(tax, t.after, ts), kind: "update" as const,
          changes: diffValues(t.before.values, t.after.values),
          comment: "Reference cleared by a deletion.",
          state: hashValues(t.after.values),
        })),
      ];
      return { ...pruned, layout, log: appendAll(study.log, entries) };
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
