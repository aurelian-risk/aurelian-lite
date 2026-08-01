# Changelog

All notable changes to Aurelian Lite are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and the project aims to follow
[Semantic Versioning](https://semver.org/). Each released version is also published as a
downloadable single-file build under [Releases](https://github.com/aurelian-risk/aurelian-lite/releases).

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

[0.3.1]: https://github.com/aurelian-risk/aurelian-lite/releases/tag/v0.3.1
[0.3.0]: https://github.com/aurelian-risk/aurelian-lite/releases/tag/v0.3.0
[0.2.0]: https://github.com/aurelian-risk/aurelian-lite/releases/tag/v0.2.0
[0.1.0]: https://github.com/aurelian-risk/aurelian-lite/releases/tag/v0.1.0
