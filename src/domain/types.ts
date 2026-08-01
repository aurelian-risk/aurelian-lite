// ─────────────────────────────────────────────────────────────────────────
// Generic, schema-driven data model. The taxonomy (meta-schema) defines
// entity types, their fields and the relationships between them (via ref
// fields). Instances are stored as generic records. Everything — taxonomy
// and data — is exportable/importable as a single swappable file.
// ─────────────────────────────────────────────────────────────────────────

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
  schemaVersion: 2;
  name: string;
  description?: string;
  groups: GroupDef[];
  entityTypes: EntityTypeDef[];
}

// ── Instances ────────────────────────────────────────────────────────────

export type FieldValue = string | number | boolean | string[] | null;

export interface EntityRecord {
  id: ID;
  type: string; // EntityTypeDef.key
  values: Record<string, FieldValue>;
  createdAt: string;
  updatedAt: string;
  /** Provenance for extracted entities: where they came from (e.g. a document name
   *  and chunk). Meta, not a taxonomy field - shown as a source badge. */
  source?: string;
}

export interface Study {
  id: ID;
  name: string;
  organization: string;
  scope: string;
  createdAt: string;
  updatedAt: string;
  entities: EntityRecord[];
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
 *  are never included (too large — the embedding model is a separate .bin);
 *  only the selection. */
export interface PortableSettings {
  modelId?: string;      // selected embedding model
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
