// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// ─────────────────────────────────────────────────────────────────────────
// Generic, schema-driven data model. The taxonomy (meta-schema) defines
// entity types, their fields and the relationships between them (via ref
// fields). Instances are stored as generic records. Everything — taxonomy
// and data — is exportable/importable as a single swappable file.
// ─────────────────────────────────────────────────────────────────────────

import type { Calibration } from "./calibration";

export type ID = string;

export type FieldType =
  | "text"
  | "textarea"
  | "enum"
  | "scale"
  | "number"
  | "boolean"
  | "ref" // single relationship to another entity type
  | "multiref"; // multiple relationships

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  help?: string;
  /** text: id of a bundled suggestion dataset for a typeahead (e.g. "mitre_technique"). */
  suggest?: string;
  /** enum: allowed values (extensible). */
  options?: string[];
  /** enum with exactly two options: render the cell as a switch rather than a label, so a
   *  state that is flipped often is one press away instead of an edit. The SECOND option is
   *  the engaged one and is shown as such. */
  toggle?: boolean;
  /** Fields that hold the record in play while they say anything, naming them on the
   *  toggle itself. A measure put on an attack step is in use by that very fact, so
   *  switching it back would leave the study saying two things at once: the switch is
   *  refused in that direction and says why. Switching a record IN is never refused. */
  lockedWhile?: string[];
  /** enum: what to SHOW for each option, positionally. The stored value stays the option.
   *  A published vocabulary is an identifier as much as a word — the engine matches on it,
   *  an auditor checks it against the publisher's list, and translating it would break
   *  both. This is how a product can read in one language while recording in another. */
  optionLabels?: string[];
  /** This field is where a derivation writes its account of itself - why a record was
   *  placed here, in the words of the rule that placed it. A method that requires a
   *  justification says so by declaring this, rather than the engine knowing a product's
   *  field name. */
  accountsForDerivation?: boolean;
  /** Where this field's values come from in a published catalogue, so the vocabulary can
   *  be refreshed from the source instead of being maintained by hand:
   *   · a property name  — the values that property takes across the catalogue
   *                        (a value listing several, comma-separated, counts as each);
   *   · "@groups"        — the labels of the catalogue's top-level groups.
   *  For an imported record the same declaration says where the field's own value comes
   *  from, so declaring it once serves both the option list and the import. */
  vocabulary?: string;
  /** scale: labels per step; length = max value. Value stored as 1..N. */
  scaleLabels?: string[];
  /** scale: is a HIGH value good or bad? Drives the colour ramp direction.
   *  "negative" (default) = high is bad → red at the top (likelihood, gravity, …).
   *  "positive" = high is good → green at the top (implementation, resistance, …). */
  polarity?: "positive" | "negative";
  /** ref/multiref: key of the target entity type. */
  refType?: string;
  /** ref/multiref: relationship label used on graph edges (defaults to `label`). */
  relation?: string;
  /** Show this field as a table column (defaults: everything except textarea). */
  column?: boolean;
}

export interface EntityTypeDef {
  key: string;
  label: string;
  labelPlural: string;
  /** group key (→ tab). */
  group: string;
  /** field key used as the display title (defaults to "name"). */
  titleField?: string;
  fields: FieldDef[];
}

export interface GroupDef {
  key: string;
  label: string;
  description?: string;
  /** CSS color value, e.g. "var(--color-workshop-1)" or "#33aaff". */
  color: string;
}

export interface Taxonomy {
  /** Vocabulary generation of the default taxonomy this one descends from. Read by
   *  reconcileTaxonomy to apply additive vocabulary migrations exactly once. Older
   *  stored taxonomies carry 2 (or nothing at all). */
  schemaVersion: number;
  name: string;
  description?: string;
  groups: GroupDef[];
  entityTypes: EntityTypeDef[];
  /** Which published catalogue the vocabularies were last refreshed from, so a taxonomy
   *  can state its own currency rather than leaving it to be guessed. */
  vocabularySource?: { name: string; version?: string; at: string };
  /** For a vocabulary that is a tree rather than a list: child → parent, per source. A
   *  class inherits what its parents require, which is what lets a catalogue state a rule
   *  once and have it reach every special case (see modelling.ts). */
  vocabularyHierarchy?: Record<string, Record<string, string>>;
}

// ── Instances ────────────────────────────────────────────────────────────

export type FieldValue = string | number | boolean | string[] | null;

/** One field's change within a history entry. */
export interface FieldChange { field: string; from: FieldValue; to: FieldValue }

/** A hash-chained change-history entry (see domain/audit.ts). `editor` is a
 *  self-declared name — there is no authentication (single-user desktop). */
export interface ChangeEntry {
  /** Position in the study log, starting at 1. Consecutive by construction, so a log
   *  truncated at the end is detectable - a bare hash chain alone would still verify. */
  seq: number;
  ts: string;
  editor: string;
  kind: "create" | "update" | "delete" | "import" | "seal";
  /** The record this entry is about. */
  entity: ID;
  /** Type key and title AS OF this entry, so a deleted record stays readable in the
   *  timeline after the record itself is gone. */
  entityType: string;
  title: string;
  changes?: FieldChange[];
  comment?: string;
  /** Fingerprint of the record's values AFTER this change; absent for a delete. This is
   *  what binds the log to the data: editing a value outside the app leaves the log
   *  intact but no longer matching, and verification says so. */
  state?: string;
  /** Present on a `seal` entry: a signature over the head of the chain as it stood, so
   *  rewriting anything before it needs the private key. See keys.ts for what that does
   *  and does not prove. */
  seal?: { jws: string; kid: string; jwk: JsonWebKey;
    /** Set when this seal arrived with an imported file. Such a seal was made about
     *  ANOTHER log, so it cannot bind to this one - re-chaining it here moved it. What it
     *  still proves is that the sender held the key, and what it was worth at the moment
     *  of import is recorded in the import entry. */
    received?: string };
  prevHash: string;
  hash: string;
}

export interface EntityRecord {
  id: ID;
  type: string; // EntityTypeDef.key
  values: Record<string, FieldValue>;
  createdAt: string;
  updatedAt: string;
  /** Provenance for extracted entities: where they came from (e.g. a document name
   *  and chunk). Meta, not a taxonomy field - shown as a source badge. */
  source?: string;
  /** LEGACY: per-entity history of studies written before the study-wide log. Read on
   *  load and folded into `Study.log`, never written any more. */
  history?: ChangeEntry[];
}

export interface Study {
  id: ID;
  name: string;
  organization: string;
  scope: string;
  /** Selects the base-rate column of the calibration: actor classes go after some
   *  sectors far more than others. Free of a value = no sector adjustment. */
  sector?: string;
  /** The parameters the quantification runs on. Part of the study, so it is exported,
   *  imported and shared with it - no separate file and no separate mechanism.
   *  Absent = the defaults. */
  calibration?: Calibration;
  createdAt: string;
  updatedAt: string;
  entities: EntityRecord[];
  /** Hash-chained log of every change to this study's records - creates, updates,
   *  deletes and confirmed imports alike. One chain for the whole study, because a
   *  delete removes its record and the entry has to outlive it. A record's own history
   *  is this log filtered by entity id. */
  log?: ChangeEntry[];
  /** Persisted canvas positions per entity id (shared with the graph view). */
  layout?: Record<ID, { x: number; y: number }>;
  /** Persisted quantification tunings per operational-scenario id. The factors
   *  themselves derive parametrically from the study inputs; this only stores the
   *  study-specific MANUAL overrides (dragged factor ranges + PERT shape) so they
   *  survive a reload. */
  quant?: Record<ID, QuantTuning>;
  /** Operational-scenario ids the user has opted in to quantify. Quantification is
   *  opt-in per scenario so a half-finished study doesn't show premature monetary
   *  values. Undefined = none added yet. */
  quantScenarios?: ID[];
}

/** One operational scenario's manual quantification tuning. */
export interface QuantTuning {
  /** Per-factor override ranges (min/mode/max + optional PERT lambda), keyed by factor. */
  overrides?: Record<string, { min: number; mode: number; max: number; lambda?: number }>;
}

/** Complete, swappable application state (taxonomy + data). */
export interface AppState {
  version: 2;
  taxonomy: Taxonomy;
  studies: Study[];
  activeStudyId: ID | null;
}

/** A reference document, portable form — carries the cached text too. */
export interface RefDocRecord {
  id: string;
  studyId: string;
  name: string;
  mime: string;
  size: number;
  note?: string;
  addedAt: string;
  text?: string;
}

/** App-level settings that travel with a fully portable export. Model WEIGHTS
 *  are never included (too large — the embedding model is a separate .bin, the
 *  language model is re-fetched/cached by its library); only the selections. */
export interface PortableSettings {
  modelId?: string;      // selected embedding model
  genModelId?: string;   // selected generative (language) model
  theme?: "light" | "dark";
}

/** A file that carries a taxonomy and/or studies (the swap unit). With
 *  `documents` and `settings` it captures a 100% portable session. */
export interface Bundle {
  kind: "ebios-bundle" | "ebios-taxonomy" | "ebios-data";
  version: 2;
  taxonomy?: Taxonomy;
  studies?: Study[];
  documents?: RefDocRecord[];
  settings?: PortableSettings;
}

/** Product identity. Supplied by the active profile (src/profile), consumed by the shell. */
export interface Product {
  name: string;
  tagline: string;
  /** Accessible name for the logo mark. */
  mark: string;
  /** Which theme a fresh install opens in. Defaults to dark. */
  scheme?: "light" | "dark";
  /** Where the source of THIS build can be obtained. Under a file-level copyleft the
   *  distributed single file has to say this: a recipient who has only the built HTML
   *  must still be able to find the source it came from. */
  source?: string;
  /** CSS custom properties this product overrides, on top of src/styles/tokens.css.
   *  `base` applies to both themes, `light` and `dark` only to theirs. Written as a
   *  stylesheet at startup, so a product can carry its own palette, radii and type
   *  without the shared token file diverging between builds. */
  theme?: {
    base?: Record<string, string>;
    light?: Record<string, string>;
    dark?: Record<string, string>;
  };
  /** What the generated document is called — a security concept, a risk analysis, an
   *  assessment. The method decides the name of its own deliverable. */
  documentTitle?: string;
  /** A stylesheet for the generated report, appended after the engine's. The report is
   *  read beside the publisher's own documents; a product may need it to look the part. */
  reportCss?: string;
  /** A stylesheet of this product's own, appended after the engine's. Tokens carry a
   *  palette; a product whose voice is a different KIND of document — ruled tables, no
   *  cards, a printed rather than an assembled page — needs to restate some rules. Kept
   *  in the profile so the shared stylesheet stays identical between builds. */
  styles?: string;
}
