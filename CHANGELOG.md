# Changelog

All notable changes to Aurelian Lite are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and the project aims to follow
[Semantic Versioning](https://semver.org/). Each released version is also published as a
downloadable single-file build under [Releases](https://github.com/aurelian-risk/aurelian-lite/releases).

## [0.4.5] — 2026-08-09

Attempt rate and resistance are derived from the modelled scenario instead of being
rated. The parameters they use are editable in the app.

### Changed
- **Attempt rate replaces contact frequency × probability of action.** Derived as base
  rate (actor class × sector) × tempo × throughput × target pull × reachability. The two
  former factors are not separable from available data: outside exposure-driven attacks
  one of them is structurally 1. Six previously unread fields now feed the derivation:
  actor category, resources, relevance, target objectives, entry technique, study sector.
- **The likelihood rating is no longer an input.** It is compared against the model's own
  result and flagged where the two differ by more than one level.
- **The bar an attempt must beat is derived from the kill chain** — entry cost, tooling
  maturity, count of distinct tactics, dwell requirement — instead of from the difficulty
  rating. Resistance is therefore contributed only by modelled measures. Access granted by
  a stakeholder lowers the entry cost. Scenarios without a modelled chain continue to use
  the difficulty rating.
- **Splitting a step still leaves results unchanged.** The new terms use a maximum over
  tooling maturity and a count of distinct tactics.
- **Parameters revised against published figures.** Sector multipliers 1.4–1.8 → 1.10–1.15:
  victim counts have no denominator, and incidence among comparable organisations differs
  by tens of percent rather than by factors. Valid accounts as an entry route 0.8 → 1.2,
  the most common initial-access vector rather than the rarest. Control strengths
  unchanged, now with published support.

### Added
- **Calibration section in the Quantification workshop.** 14 parameter tables, each value
  on a track with its default marked, reset per table or as a whole. Each table states its
  question, its effect, its source, and its basis: *measured* (published figure,
  derivation documented), *derived* (published figure plus a stated assumption) or
  *judgement* (no published figure). 6 of 14 are measured or derived. Stored on the study
  and included in its export.
- **Sector selection in the scope workshop**, with the rate exceptions it triggers.
- **Text export of the quantification for a language model**: model rules, parameters in
  force, each derived term, the chain with its measures, results, and stated limits.
- **Derivations shown in the factor popups**: the attempt rate as its multiplication, the
  bar as its four contributions.
- **Three completeness checks**: risk source without a category, risk source without a
  target objective, chain whose first step names no technique.
- **`docs/calibration-sources.md`**: the derivation behind each default, the anchors
  considered and rejected, and the remaining limitations.

## [0.4.1] — 2026-08-06

The change history becomes one hash-chained log per study instead of a separate history
per record. Studies written by earlier versions are migrated on load.

### Changed
- **Deletions are recorded.** A per-record history died with the record it described, so a
  deletion could not be logged anywhere. The log now belongs to the study; a record's
  history is that log filtered by id. Deleted records keep their name and type in the
  timeline, and a cascade also records the references it cleared on the records that
  survive.
- **The log is bound to the data.** Each entry carries a fingerprint of the record's values
  after the change, and entries are consecutively numbered. Editing a value in an exported
  file, adding a record to it, or truncating the log now shows up as *changed outside the
  app* / *not in the log* rather than passing unnoticed.
- **Imports continue the chain rather than replacing it.** Both the additive and the
  destructive mode append to the receiving study's log. A destructive import records the
  records it drops as deletions instead of discarding the history that shows the
  replacement happened.

### Added
- **An imported file is verified before you confirm it.** The preview says whether the
  file's own log is complete and matching, broken at a given entry, or leaves records
  unaccounted for - and what the selected mode will do with it. The verdict is written into
  the entry that records the import, so a chain that had to be re-established is never
  mistaken later for one that was always intact.
- Incoming entries are **adopted**, so a colleague's history stays visible after an import.

## [0.4.0] — 2026-08-05

Security measures no longer all mean the same thing to the quantification, and the kill
chain is now the calculation rather than documentation beside it. **Risk figures move
compared with 0.3.x** — this is a method change, not a refactor.

### Changed
- **A measure now acts through the mechanism it works by.** *Preventive* measures block an
  attacker at the step they cover, *detective* ones can interrupt the intrusion before it
  reaches its objective, *corrective* ones are damage control (they reduce the loss, not the
  chance of it), *deterrent* ones reduce the number of attempts, and the new *avoidance*
  class removes the exposure itself. Previously every measure was counted as resistance —
  which claimed, for instance, that backups make ransomware less likely to succeed.
- **The kill chain is traversed instead of averaged.** Each attempt walks the chain in
  order, honouring the `all` / `any` prerequisites of every step. Only steps that something
  defends are hurdles, so describing a chain in more detail never makes it look safer, and a
  control on a route the attacker does not need is correctly worth nothing.
- **Recalibrated against reference situations.** Ordinal ratings now map to deliberately wide
  bands, so a single step on a 1–4 scale shifts the outcome instead of deciding it, and no
  configuration of controls reduces a capable attacker to zero. The calibration is held in
  place by automated tests.
- **Residual risk and the coverage views read the same model** as the risk figures. A
  treatment that only buys recovery now moves a risk *down* the matrix, not left.

### Added
- **Where the attempts are stopped** — out of every 100 attacks on a chain, how many are
  stopped by the scenario itself, how many at each step, and how many reach the objective.
- **Chain defence ring** — blocked / detected in time / reaches the objective.
- **Explain any figure** — the tactic tiles open the full working; the factor popup walks the
  chain step by step with each measure and its effect class.
- **Seven new quality checks** built on the effect model, including kill chains defended by
  detection alone and monitored chains with no way to respond.
- Loss event frequency is also given as a return period ("about one loss event every 32
  years"), which is the readable form for a rare event.

## [0.3.7] — 2026-08-04

### Changed
- **Relationship graph** is now a focus / ego-network: one entity at the centre with its
  neighbours around it, plus a searchable, workshop-grouped index of every entity on the left.
- **Flow view** — thinner connectors and column headers that freeze while you scroll (`Esc` clears
  the selection).
- First workshop renamed **“Assets & Scope”** (was “Foundation”).

### Added
- **Multi-focus compare** (Shift-click), **inspect vs. double-click to re-centre**, and
  **draggable nodes** that spring back into place.

## [0.3.6] — 2026-08-03

### Added
- **Security-measure catalog** — the **+ Security Measure** button now offers a bundled, curated
  library of common controls (MFA, network segmentation, EDR, backups, security awareness, …) plus
  the free frameworks (NIS2, NIST CSF, NIST 800-53) as measure sources — the same catalog picker
  requirements already had. Pick from a catalog or create a custom measure.
- **Framework / catalog import** (Documents) — a **semi-deterministic** importer for requirement
  *and* measure catalogs. Paste or load a table (CSV / TSV / JSON), map its columns to fields
  (auto-detected, with an optional embedding-assisted **Suggest with AI**), then pick which rows to
  add. Values are read **verbatim**; the embedding model only *assists* column mapping — it never
  extracts field values. Robust to quoting, multi-line cells, BOM, `,`/`;`/tab delimiters and
  non-ASCII content.

### Changed
- **Asset-criticality heatmap** — tiles now share a uniform height, so they pack together without
  ragged gaps between different-length names; an expanded tile widens to two columns instead of
  spanning the whole row.

## [0.3.5] — 2026-08-03

### Added
- **Change history & Timeline** — every create and edit is recorded in a per-entity,
  hash-chained, tamper-evident audit trail (with editor and an optional note); integrity is
  verified on load, and a global **Timeline** view lists all changes. The history travels
  inside the exported bundle.
- **Import diff / merge** — preview exactly what an imported revision *adds, changes or
  removes* (per entity, with editor, time and comment) before applying it, in additive or
  destructive mode.
- **Attack Paths view** — a read-only projection of all operational-scenario kill chains onto
  their target assets, highlighting **choke points** (pass-through assets that several chains
  converge on — the highest-leverage place to add a control). A collapsible sub-section of the
  Operational Scenarios workshop.
- **Kill-chain attack graph** — a step may declare predecessors, turning the linear chain into
  a DAG with AND/OR joins: earlier steps within a scenario, or a step from *another* scenario to
  model a **cascade**. Choices that would break the forward escalation or create a cycle are
  hidden, so the graph stays acyclic by construction.
- **Importable requirement catalogs** — an IEC 62443-3-3 starter and a documented catalog
  format for bringing your own frameworks.

### Changed
- **Deterministic export** — bundles are written with sorted keys and stable YAML so successive
  exports produce clean, review-friendly git diffs.
- **Workshop navigation redesigned** as a colour-coded 1→7 stepper with a clearer active state;
  the view tabs (Flow / Graph / Checks) are set apart as secondary.
- Rating scales: the risk matrices and quantification now adapt to any scale length.
- Added project governance docs (CHANGELOG, MATURITY).

## [0.3.1] — 2026-08-01

### Changed
- **HTML report:** entity attributes are now rendered as elevated *field chips* (caption + value)
  instead of a flat line of text, with a polarity-aware **severity level bar** on rated fields
  (criticality, likelihood, gravity, difficulty, …).
- **HTML report:** kill-chain **techniques are grouped under their operational scenario** — a
  numbered "Kill chain" sequence per scenario with tactic and MITRE ATT&CK® technique chips —
  instead of one flat block. Inline `code` renders as a chip.
- Repository keywords/topics focused on cyber risk analysis (removed generic implementation tags).

## [0.3.0] — 2026-08-01

### Added
- **Monte-Carlo risk quantification** — an own, fully offline simulation engine producing an
  annual-loss distribution (loss-exceedance curve, percentiles); every factor derived
  parametrically from the study inputs and traceable back to them; opt-in per operational scenario.
- **Treatment & residual risk** — ISO-27005-style decision (reduce / accept / share / avoid) per
  risk; residual position on the matrix derived from kill-chain coverage.
- **Defense-in-depth coverage** — kill-chain step coverage weighted by each measure's implementation
  level *and* lifecycle status, with saturation.
- **Quality checks** — a completeness linter surfacing gaps (uncovered steps, untreated risks, …).
- **Word / PDF corpus import** — fully offline text extraction (bundled PDF.js for PDF, native
  decompression for `.docx`) with automatic source attribution.
- **Optional AES-256 encryption** of exports.

### Changed
- Markdown/HTML report is fully offline (inline attack-flow and kill-chain SVGs — no CDN).
- Asset-criticality heatmap sits between the business- and supporting-asset tables.
- Event-flow swimlane centres vertically on the clicked node and keeps horizontal scroll on refine.

## [0.2.0] — 2026-07-30

### Added
- MITRE ATT&CK® kill-chain mitigation view (measures mapped onto kill-chain steps).
- Compliance mapping — bundled NIS2 and NIST CSF requirement catalogs + coverage/traceability matrix.
- Analytics: asset heatmap, threat-actor and framework radars, coverage charts.
- Richer, print-ready HTML report.

## [0.1.0]

### Added
- Initial public release: EBIOS-RM-inspired workshops, taxonomy-driven entity model, interactive
  knowledge graph, likelihood × severity risk matrix, and on-device embedding-assisted extraction.
- Offline, single-file, private by design.

[0.3.6]: https://github.com/aurelian-risk/aurelian-lite/releases/tag/v0.3.6
[0.3.5]: https://github.com/aurelian-risk/aurelian-lite/releases/tag/v0.3.5
[0.3.1]: https://github.com/aurelian-risk/aurelian-lite/releases/tag/v0.3.1
[0.3.0]: https://github.com/aurelian-risk/aurelian-lite/releases/tag/v0.3.0
[0.2.0]: https://github.com/aurelian-risk/aurelian-lite/releases/tag/v0.2.0
[0.1.0]: https://github.com/aurelian-risk/aurelian-lite/releases/tag/v0.1.0
