# Changelog

All notable changes to Aurelian Lite are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and the project aims to follow
[Semantic Versioning](https://semver.org/). Each released version is also published as a
downloadable single-file build under [Releases](https://github.com/aurelian-risk/aurelian-lite/releases).

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
