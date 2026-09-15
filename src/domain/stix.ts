// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// A STIX 2.1 bundle as a graph to walk, and the projection of its objects onto the
// study's own types.
//
// The reader knows STIX core and nothing else: objects by type, relationships in both
// directions, the ATT&CK external id where there is one. Anything it does not recognise
// stays visible under its own type with a count - a feed's custom objects are not lost,
// they are shown as not mapped. What an object BECOMES is not decided here: a rule per
// STIX type (src/profile/*/stix.ts) says which entity type, and where each field's value
// comes from. The engine only applies rules.
//
// A selection is walked to from any object - an actor, a technique, a sector, a campaign -
// one hop at a time through the relationships, each hop grouped by relationship and
// target type with a count, so the analyst chooses what comes along. Nothing about the
// walk depends on where it started.
import type { FieldValue } from "./types";
import { sha256hex } from "./audit";
import { TACTIC_OF_PHASE, RETIRED_TACTICS, currentTechnique } from "./mitre";

export interface StixObject {
  id: string; type: string;
  name?: string; description?: string;
  revoked?: boolean; x_mitre_deprecated?: boolean;
  external_references?: { source_name: string; external_id?: string; url?: string }[];
  kill_chain_phases?: { kill_chain_name: string; phase_name: string }[];
  [k: string]: unknown;
}
export interface StixRelationship extends StixObject {
  type: "relationship"; relationship_type: string; source_ref: string; target_ref: string;
}
/** One end of a relationship as seen from an object: the relation, the other object, and
 *  which way the arrow points. Embedded refs (`created_by_ref`, `object_refs`, a flow's
 *  `effect_refs`) are edges too, named after the property. */
export interface Edge { rel: string; dir: "out" | "in"; other: string; via?: string }

export interface StixIndex {
  /** The bundle's own id, and the spec version it claims. */
  bundle: { id?: string; spec: string; objects: number };
  objects: Map<string, StixObject>;
  byType: Map<string, StixObject[]>;
  edges: Map<string, Edge[]>;
  /** Objects set aside: revoked or deprecated (kept, so an old id still resolves), and
   *  relationships whose ends are not in the bundle. */
  aside: { revoked: number; dangling: number };
}

/** ATT&CK's id for an object - T1566, G0046, M1032, C0015 - or null. */
export function extId(o: StixObject): string | null {
  return o.external_references?.find((r) => r.source_name === "mitre-attack" && r.external_id)?.external_id ?? null;
}

/** Properties whose values are object ids: the relationships STIX embeds rather than
 *  writing as relationship objects. */
const REF_PROPS = ["object_refs", "sighting_of_ref", "where_sighted_refs", "observed_data_refs",
  "effect_refs", "asset_refs", "on_completion", "on_true", "on_false", "start_refs"];
// Not walked: `created_by_ref` and `object_marking_refs` hang on every object and say who
// wrote the bundle and how it may be shared - bookkeeping, not part of what is chosen.

/** Does this text carry STIX rather than a study? A bundle object, or a bare list of
 *  objects whose ids are typed UUIDs. Cheap to ask before parseBundle refuses it. */
export function isStix(text: string): boolean {
  const head = text.slice(0, 4000);
  if (/"type"\s*:\s*"bundle"/.test(head) && /"objects"\s*:/.test(head)) return true;
  return /"id"\s*:\s*"[a-z][a-z0-9-]*--[0-9a-f-]{36}"/.test(head) && /"spec_version"\s*:/.test(head);
}

export function readStix(input: string | unknown): StixIndex {
  const data = typeof input === "string" ? JSON.parse(input) : input;
  const list: StixObject[] = Array.isArray(data) ? data
    : data && typeof data === "object" && Array.isArray((data as { objects?: unknown }).objects) ? (data as { objects: StixObject[] }).objects
    : [];
  if (!list.length) throw new Error("Not a STIX bundle: no objects.");
  const objects = new Map<string, StixObject>();
  const byType = new Map<string, StixObject[]>();
  const edges = new Map<string, Edge[]>();
  const aside = { revoked: 0, dangling: 0 };
  const push = (id: string, e: Edge) => { const l = edges.get(id); l ? l.push(e) : edges.set(id, [e]); };
  for (const o of list) {
    if (!o || typeof o !== "object" || typeof o.id !== "string" || typeof o.type !== "string") continue;
    objects.set(o.id, o);
    if (o.revoked || o.x_mitre_deprecated) { aside.revoked++; continue; }
    if (o.type === "relationship") continue;
    const l = byType.get(o.type); l ? l.push(o) : byType.set(o.type, [o]);
  }
  for (const o of objects.values()) {
    if (o.type === "relationship") {
      const r = o as StixRelationship;
      if (!objects.has(r.source_ref) || !objects.has(r.target_ref)) { aside.dangling++; continue; }
      if (r.revoked) continue;
      push(r.source_ref, { rel: r.relationship_type, dir: "out", other: r.target_ref, via: r.id });
      push(r.target_ref, { rel: r.relationship_type, dir: "in", other: r.source_ref, via: r.id });
      continue;
    }
    for (const p of REF_PROPS) {
      const v = o[p];
      for (const ref of Array.isArray(v) ? v : typeof v === "string" ? [v] : []) {
        if (typeof ref !== "string" || !objects.has(ref) || ref === o.id) continue;
        push(o.id, { rel: p, dir: "out", other: ref });
        push(ref, { rel: p, dir: "in", other: o.id });
      }
    }
  }
  const spec = String((data as { spec_version?: string })?.spec_version ?? list.find((o) => o.spec_version)?.spec_version ?? "2.1");
  return { bundle: { id: (data as { id?: string })?.id, spec, objects: objects.size }, objects, byType, edges, aside };
}

/** The types in the bundle with their counts, largest first; relationships and
 *  markings are bookkeeping, not content, and are listed last. */
export function typeCounts(ix: StixIndex): { type: string; count: number }[] {
  const meta = new Set(["relationship", "marking-definition", "x-mitre-collection", "identity", "language-content"]);
  return [...ix.byType.entries()].map(([type, l]) => ({ type, count: l.length }))
    .sort((a, b) => (meta.has(a.type) ? 1 : 0) - (meta.has(b.type) ? 1 : 0) || b.count - a.count || a.type.localeCompare(b.type));
}

/** One hop from an object, grouped by relation, direction and the other object's type,
 *  so a choice can be made per group ("uses → 67 attack-pattern") rather than per edge.
 *  Objects set aside (revoked) are not offered. */
export interface Hop { rel: string; dir: "out" | "in"; type: string; items: StixObject[] }
export function hops(ix: StixIndex, id: string): Hop[] {
  const groups = new Map<string, Hop>();
  for (const e of ix.edges.get(id) ?? []) {
    const o = ix.objects.get(e.other);
    if (!o || o.revoked || o.x_mitre_deprecated || o.type === "relationship") continue;
    const k = `${e.dir}:${e.rel}:${o.type}`;
    const g = groups.get(k) ?? { rel: e.rel, dir: e.dir, type: o.type, items: [] };
    if (!g.items.some((x) => x.id === o.id)) g.items.push(o);
    groups.set(k, g);
  }
  return [...groups.values()].sort((a, b) => b.items.length - a.items.length || a.rel.localeCompare(b.rel));
}

/** What a walk reaches: the objects within `maxDepth` hops of `rootId` that `wanted`
 *  says become something, each with the path it was found by. An indicator is a dead end
 *  by itself - malware and infrastructure on every side - and the actor behind it two
 *  hops away; this is what tells the reader so. Breadth-first, shortest path wins. */
export interface Reach { obj: StixObject; depth: number; via: StixObject[] }
export function reach(ix: StixIndex, rootId: string, wanted: (type: string) => boolean, maxDepth = 3): Reach[] {
  const seen = new Set<string>([rootId]);
  let frontier: { id: string; via: StixObject[] }[] = [{ id: rootId, via: [] }];
  const out: Reach[] = [];
  for (let d = 1; d <= maxDepth && frontier.length; d++) {
    const next: typeof frontier = [];
    for (const f of frontier) {
      for (const h of hops(ix, f.id)) for (const o of h.items) {
        if (seen.has(o.id)) continue;
        seen.add(o.id);
        if (wanted(o.type)) out.push({ obj: o, depth: d, via: f.via });
        next.push({ id: o.id, via: [...f.via, o] });
      }
    }
    frontier = next;
  }
  return out;
}

/** A readable name for any object: its name, its ATT&CK id and name, its pattern, its
 *  type and a short id - never nothing. */
export function labelOf(o: StixObject): string {
  const x = extId(o);
  if (o.name) return x ? `${x} ${o.name}` : o.name;
  if (typeof o.pattern === "string") return o.pattern.slice(0, 60);
  if (typeof o.value === "string") return o.value;
  if (typeof o.abstract === "string") return o.abstract;
  if (typeof o.description === "string") return o.description.slice(0, 70);
  return `${o.type} ${o.id.split("--")[1]?.slice(0, 8) ?? ""}`;
}

/** The tactic names an attack-pattern is filed under, in the product's vocabulary.
 *  Old phase names (a feed written against v18) read to the first successor. */
export function tacticsOf(o: StixObject): string[] {
  const out: string[] = [];
  for (const k of o.kill_chain_phases ?? []) {
    if (k.kill_chain_name !== "mitre-attack") continue;
    let t = TACTIC_OF_PHASE[k.phase_name];
    if (!t) {
      // "defense-evasion" → "Defense Evasion" → its successor
      const guess = k.phase_name.split("-").map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");
      t = RETIRED_TACTICS[guess]?.[0] ?? guess;
    }
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

// ── projection ───────────────────────────────────────────────────────────────

/** Where a field's value comes from. Declared per rule, applied here. */
export type FieldSource =
  | { from: "property"; path: string; vocab?: Record<string, FieldValue>; fallback?: FieldValue; join?: string }
  | { from: "const"; value: FieldValue }
  | { from: "extId" }
  | { from: "label" }
  /** A description built from several properties, each under a caption; empty ones are
   *  left out. `aliases`, `goals`, the ATT&CK id and the description are the usual set. */
  | { from: "compose"; parts: { caption?: string; path: string }[] }
  /** The tactics of an attack-pattern, first one or all. */
  | { from: "tactics"; pick?: "first" | "all" }
  /** The technique as the kill-chain step stores it, read through to what ATT&CK calls
   *  it now when the feed names a revoked one. */
  | { from: "technique" }
  /** Related objects one hop away: their labels joined, or their count. */
  | { from: "related"; rel: string; dir: "out" | "in"; type?: string; as: "labels" | "count" | "extIds"; join?: string };

export interface StixRule {
  /** Which STIX type this rule projects. */
  stixType: string;
  /** Which entity type it becomes. */
  entityType: string;
  fields: Record<string, FieldSource>;
  /** A word for the panel: what this projection is. */
  note?: string;
}

export interface Projected {
  id: string; type: string; values: Record<string, FieldValue>;
  /** The object it came from, for provenance. */
  source: string;
  /** Fields the rule could not fill: the property was absent, or the value was outside
   *  the vocabulary. Listed, not silently blank. */
  gaps: { field: string; why: string }[];
}

/** A record id that is a function of the STIX id, so importing the same object twice
 *  is a change to one record, not a second record. */
export const stixRecordId = (stixId: string): string => "stix-" + sha256hex(stixId).slice(0, 24);

const get = (o: unknown, path: string): unknown => path.split(".").reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined), o);

export function project(ix: StixIndex, o: StixObject, rule: StixRule): Projected {
  const values: Record<string, FieldValue> = {};
  const gaps: Projected["gaps"] = [];
  for (const [field, src] of Object.entries(rule.fields)) {
    switch (src.from) {
      case "const": values[field] = src.value; break;
      case "extId": { const x = extId(o); if (x) values[field] = x; else gaps.push({ field, why: "no ATT&CK id" }); break; }
      case "label": values[field] = labelOf(o); break;
      case "property": {
        const raw = get(o, src.path);
        const list = Array.isArray(raw) ? raw : raw == null || raw === "" ? [] : [raw];
        if (!list.length) { if (src.fallback !== undefined) values[field] = src.fallback; else gaps.push({ field, why: `${src.path} not given` }); break; }
        if (src.vocab) {
          // The first value the vocabulary knows wins; none known is a gap that names them.
          const hit = list.map((v) => src.vocab![String(v)]).find((v) => v !== undefined);
          if (hit !== undefined) values[field] = hit;
          else if (src.fallback !== undefined) { values[field] = src.fallback; gaps.push({ field, why: `${src.path} "${list.join(", ")}" not in the vocabulary; fallback used` }); }
          else gaps.push({ field, why: `${src.path} "${list.join(", ")}" not in the vocabulary` });
        } else values[field] = list.length === 1 ? (typeof list[0] === "object" ? JSON.stringify(list[0]) : list[0] as FieldValue) : list.map(String).join(src.join ?? ", ");
        break;
      }
      case "compose": {
        const parts = src.parts.map((p) => { const v = get(o, p.path); const s = Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v); return s ? (p.caption ? `${p.caption}: ${s}` : s) : ""; }).filter(Boolean);
        if (parts.length) values[field] = parts.join("\n\n"); else gaps.push({ field, why: "nothing to compose" });
        break;
      }
      case "tactics": {
        const t = tacticsOf(o);
        if (!t.length) gaps.push({ field, why: "no kill-chain phase" });
        else values[field] = src.pick === "all" ? t.join(", ") : t[0];
        break;
      }
      case "technique": { const v = techniqueValueOf(o); if (v) values[field] = v; else gaps.push({ field, why: "no technique id or name" }); break; }
      case "related": {
        const items = hops(ix, o.id).filter((h) => h.rel === src.rel && h.dir === src.dir && (!src.type || h.type === src.type)).flatMap((h) => h.items);
        if (src.as === "count") values[field] = items.length;
        else if (!items.length) gaps.push({ field, why: `no ${src.rel} ${src.type ?? ""}`.trim() });
        else values[field] = items.map((x) => src.as === "extIds" ? extId(x) ?? labelOf(x) : labelOf(x)).join(src.join ?? ", ");
        break;
      }
    }
  }
  return { id: stixRecordId(o.id), type: rule.entityType, values, source: `stix:${o.id}`, gaps };
}

/** The technique as a kill-chain step stores it ("T1566 Phishing"). A revoked id reads
 *  through to its live successor - the feed was written against an older ATT&CK, and the
 *  step should say what the technique is called now. A feed-own technique with no
 *  ATT&CK id is stored by its name alone. */
export function techniqueValueOf(o: StixObject): string | null {
  const x = extId(o);
  if (!x) return o.name ?? null;
  const t = currentTechnique(x);
  return t ? `${t.id} ${t.name}` : `${x} ${o.name ?? ""}`.trim();
}

// ── where the records land ───────────────────────────────────────────────────

/** A projected record's contact with what the study already holds. A suggestion with
 *  its reason, never a decision: a name in common is not proof of the same actor, and
 *  the analyst chooses whether to create beside or update. */
export interface Touch {
  recordId: string;
  /** The existing record it touches. */
  existing: { id: string; type: string; title: string };
  kind: "same-name" | "same-technique" | "same-mitigation";
  why: string;
}

const norm = (s: unknown): string => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const aliasesOf = (desc: unknown): string[] => {
  const m = String(desc ?? "").match(/Aliases:\s*([^\n]+)/);
  return m ? m[1].split(",").map((a) => norm(a)).filter(Boolean) : [];
};

/** The touches of projected records with the study's records, by three signs: the same
 *  name or alias (any type), the same ATT&CK technique on a kill-chain step, the same
 *  mitigation named by a measure. Records the projection already targets by id (a
 *  repeat import) are not touches - they are the same record. */
export function touches(
  projected: { id: string; type: string; values: Record<string, FieldValue> }[],
  existing: { id: string; type: string; values: Record<string, FieldValue> }[],
  titleOf: (e: { id: string; type: string; values: Record<string, FieldValue> }) => string,
): Touch[] {
  const out: Touch[] = [];
  const tid = (v: unknown) => (typeof v === "string" ? v.toUpperCase().match(/T\d{4}(?:\.\d{3})?/)?.[0] ?? null : null);
  const mids = (v: unknown): string[] => (typeof v === "string" ? v.toUpperCase().match(/M\d{4}/g) ?? [] : []);
  for (const p of projected) {
    const names = new Set([norm(p.values.name), ...aliasesOf(p.values.description)].filter(Boolean));
    for (const e of existing) {
      if (e.id === p.id) continue;
      const title = titleOf(e);
      if (e.type === p.type && names.has(norm(title))) {
        out.push({ recordId: p.id, existing: { id: e.id, type: e.type, title }, kind: "same-name", why: `named "${title}" too` });
        continue;
      }
      if (p.type === e.type && tid(p.values.technique) && tid(p.values.technique) === tid(e.values.technique)) {
        out.push({ recordId: p.id, existing: { id: e.id, type: e.type, title }, kind: "same-technique", why: `${tid(e.values.technique)} is already a step` });
        continue;
      }
      const m = mids(p.values.mitigations);
      if (m.length && p.type === e.type && mids(e.values.mitigations).some((x) => m.includes(x))) {
        out.push({ recordId: p.id, existing: { id: e.id, type: e.type, title }, kind: "same-mitigation", why: `names ${m.find((x) => mids(e.values.mitigations).includes(x))} too` });
      }
    }
  }
  return out;
}

// ── a large type, in buckets ─────────────────────────────────────────────────

/** A type too large to fan out, cut into buckets a stage can show: techniques by the
 *  tactic they are filed under (the matrix's own order), everything else by the leading
 *  letters of its label, in as few even cuts as keep each bucket drawable. */
export interface Bucket { key: string; label: string; items: StixObject[] }
export function buckets(objs: StixObject[], tacticOrder: readonly string[], cap = 40): Bucket[] {
  if (objs.length && objs.every((o) => (o.kill_chain_phases?.length ?? 0) > 0)) {
    const by = new Map<string, StixObject[]>();
    for (const o of objs) { const t = tacticsOf(o)[0] ?? "—"; const l = by.get(t) ?? []; l.push(o); by.set(t, l); }
    return [...by.entries()].sort((a, b) => tacticOrder.indexOf(a[0]) - tacticOrder.indexOf(b[0])).map(([t, items]) => ({ key: "tactic:" + t, label: t, items }));
  }
  const sorted = [...objs].sort((a, b) => labelOf(a).localeCompare(labelOf(b)));
  const n = Math.min(12, Math.max(2, Math.ceil(sorted.length / cap)));
  const size = Math.ceil(sorted.length / n);
  const out: Bucket[] = [];
  for (let i = 0; i < sorted.length; i += size) {
    const items = sorted.slice(i, i + size);
    const a = labelOf(items[0]).slice(0, 2), b = labelOf(items[items.length - 1]).slice(0, 2);
    out.push({ key: "abc:" + i, label: `${a} – ${b}`, items });
  }
  return out;
}

// ── search across the bundle ─────────────────────────────────────────────────

/** Every object whose text answers the query - name, aliases, ATT&CK id, description,
 *  sectors, tactics, pattern - grouped by type, best matches first: an id or a name that
 *  starts with the query outranks a word somewhere in a description. All words of the
 *  query must occur, in any field. */
export interface SearchHit { obj: StixObject; score: number; where: string }
export function searchStix(ix: StixIndex, query: string, limit = 200): { type: string; hits: SearchHit[] }[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const out = new Map<string, SearchHit[]>();
  let n = 0;
  for (const o of ix.objects.values()) {
    if (o.type === "relationship" || o.revoked || o.x_mitre_deprecated) continue;
    const id = (extId(o) ?? "").toLowerCase();
    const name = String(o.name ?? "").toLowerCase();
    const fields: [string, string][] = [
      ["id", id], ["name", name],
      ["aliases", ((o.aliases as string[]) ?? []).join(" ").toLowerCase()],
      ["sectors", ((o.sectors as string[]) ?? []).join(" ").toLowerCase()],
      ["tactics", tacticsOf(o).join(" ").toLowerCase()],
      ["pattern", String(o.pattern ?? "").toLowerCase()],
      ["description", String(o.description ?? "").toLowerCase()],
    ];
    let score = 0; let where = "";
    for (const w of words) {
      let best = 0, at = "";
      for (const [f, v] of fields) {
        if (!v.includes(w)) continue;
        const s = f === "id" && v.startsWith(w) ? 100 : f === "name" && v.startsWith(w) ? 80 : f === "name" || f === "aliases" ? 60 : f === "id" ? 50 : f === "description" ? 10 : 30;
        if (s > best) { best = s; at = f; }
      }
      if (!best) { score = 0; break; }
      score += best; if (!where || best > 60) where = at;
    }
    if (!score) continue;
    const l = out.get(o.type) ?? []; l.push({ obj: o, score, where }); out.set(o.type, l);
    if (++n >= limit * 5) break;
  }
  return [...out.entries()].map(([type, hits]) => ({ type, hits: hits.sort((a, b) => b.score - a.score).slice(0, limit) }))
    .sort((a, b) => b.hits[0].score - a.hits[0].score || b.hits.length - a.hits.length);
}

// ── what the chosen objects have to do with each other ───────────────────────

/** The relationships the bundle records BETWEEN the chosen objects, and the chosen
 *  objects grouped into what hangs together by them. A component of one is an object
 *  the bundle does not connect to anything else chosen - disjoint, which is worth seeing
 *  before it is imported as if it belonged. */
export interface Weave {
  edges: { from: string; to: string; rel: string }[];
  /** Connected components, largest first; each a list of object ids. */
  components: string[][];
}
export function weave(ix: StixIndex, ids: string[]): Weave {
  const set = new Set(ids);
  const edges: Weave["edges"] = [];
  const seen = new Set<string>();
  for (const id of ids) for (const e of ix.edges.get(id) ?? []) {
    if (e.dir !== "out" || !set.has(e.other)) continue;
    const k = `${id}|${e.rel}|${e.other}`;
    if (seen.has(k)) continue;
    seen.add(k); edges.push({ from: id, to: e.other, rel: e.rel });
  }
  const parent = new Map(ids.map((i) => [i, i]));
  const find = (x: string): string => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; parent.set(x, r); return r; };
  for (const e of edges) parent.set(find(e.from), find(e.to));
  const comp = new Map<string, string[]>();
  for (const id of ids) { const r = find(id); const l = comp.get(r) ?? []; l.push(id); comp.set(r, l); }
  return { edges, components: [...comp.values()].sort((a, b) => b.length - a.length) };
}
