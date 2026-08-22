# Changelog

All notable changes to Aurelian Lite are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and the project aims to follow
[Semantic Versioning](https://semver.org/). Each released version is also published as a
downloadable single-file build under [Releases](https://github.com/aurelian-risk/aurelian-lite/releases).

## [0.6.0] — 2026-08-22

Sealing a study, checking one against the key it was sent with, tables that stay as you
arranged them, and a report that says what the model computes.

### Added
- **A study can be sealed.** A seal signs the head of the change log, so altering anything
  recorded before it needs the private key — where the hash chain alone only proves the log
  is consistent with itself, and anyone holding the file can recompute that. Seals are
  entries in the chain, so a later one covers the earlier ones.
- **A seal is checked against the key it claims.** Three states, named rather than implied:
  *verified* (signature valid, history intact, and the key is one you have named),
  *signature valid · key not named*, and *does not check out*. The middle one is a task, not
  a warning: compare the fingerprint by some route other than the file, name the key, and
  the same seal reads as verified.
- **An imported file is checked before it is taken in.** The import dialog shows who sealed
  it, up to which entry, how many changes followed, and whether the key is known — and
  offers to check it against a public-key file you already hold. A key that does not match
  says so, naming both fingerprints. What the seal was worth is then written into the
  chain itself, because a seal cannot be re-verified once it has been re-chained into a
  receiving log.
- **Public and private keys are files.** The private one is saved encrypted with a password;
  the public one carries its own fingerprint, and a file claiming one it does not have is
  refused.
- **An export can be addressed to a key instead of a password.** A password has to reach the
  recipient somehow, and in practice travels the same way the file does. One content key
  encrypts the study once and is wrapped per recipient; a second recipient costs a few
  hundred bytes, not a second copy. The recipient list is readable in the file, so someone
  can see whether it is for them.
- **Tables stay as you arranged them.** Which groups are folded away and which field a table
  is grouped by survive leaving the tab and coming back. Kept outside the study on purpose:
  a fold belongs to whoever is reading, and a study that recorded it would carry it into
  every export and into the change log.
- **A launcher script**, next to the built file: serves the app from a local address, and
  with `--llm` runs a local model server that answers on the same one.

### Changed
- **The report speaks the model's language.** It says what becomes of an attack attempt —
  blocked, detected in time, or through to the objective — and where on the chain attempts
  end, instead of an averaged coverage figure. A step counts as defended only where
  something stops or catches an attacker there; each measure names the class it acts
  through, and a step held only by damage control says so.
- **The loss curve is read as frequencies.** "One year in fifty costs more than €X" rather
  than a density whose vertical axis nobody quotes, and the years with no loss at all are
  stated instead of hidden in the shape.
- **Each factor says what your measures did to it** — one branch per effect class, with a
  gate measured in steps rather than as a percentage, because a gate is not a multiplier.
- **Tables in the report render as tables.** Document control and the change record arrived
  as paragraphs of vertical bars.
- **Chain defence sits with the operational scenarios** whose chains it is about.
- **A catalogue import reads what the parser reads.** The gate in front of it judged the
  text by splitting raw lines, so a control text running over several lines — or simply
  carrying a comma — was refused as "not a catalogue" while the parser behind it read it
  without complaint. NIST SP 800-53 and OWASP ASVS were both refused this way.
- **Escape closes a drop-down.**

## [0.5.2] — 2026-08-19

The table toolbar became one thing, and a field with two states is now a switch rather
than a form.

### Added
- **A two-state field renders as a switch in the cell.** Selecting a requirement no longer
  means opening the record: the cell is pressed and the state flips, with a hover preview
  of what the press would take. The compliance table declares its scope field this way, so
  a seeded framework arrives out of scope and is taken in one press at a time. Such a field
  sorts to the front of the filters, since what it records is usually what you filter by.
  Only a recorded state sets a record back: a study written before this release says
  nothing about the switch, and everything in it stays in use. What is set back is left
  out of the completeness checks as well, so a seeded framework reports the study rather
  than itself.
- **A field can be locked in one direction while something depends on it.** A measure
  placed on an attack step is in use by that very fact, and switching it out would leave
  the study saying two things at once — the switch is refused in that direction and names
  what holds it, naming the records rather than counting them. Switching a record in is
  never refused. Putting a measure on a step
  switches it in by the same reasoning, so one taken from a catalogue no longer sits on the
  chain switched off. A measure not in use fulfils nothing in the coverage matrix or the
  framework radar either.

- **The catalogue is reachable where a measure is missing.** "From a catalogue…" is the
  last entry of a kill-chain step's own measure list, rather than a button elsewhere on the
  page: what is chosen there arrives already covering that step and in use. A custom one
  starts the same way.
- **What points at a record is grouped by who points and through which relation.** An asset
  a hundred requirements name was a flat wall of chips; it reads "Requirements — applies to
  (93)" now, largest group first, with the first twelve shown and the rest one press away.

### Changed
- **One table toolbar, used everywhere.** The toolbar moved out of the entity tables into
  a component of its own and now serves the coverage matrix as well. A facet is a menu
  rather than a row of every value it holds, so the whole bar fits on one line however many
  values a field has.
- **The facet counts follow the current filters.** Which fields and values are offered
  stays fixed by the whole table — chips that appeared and vanished as you filtered would
  move under the pointer — but the numbers narrow, and a value left with nothing reads zero
  instead of disappearing. A field is counted ignoring its own selection, because its
  values are alternatives: having picked one, the others must still show what picking them
  instead would give. The row count beside a table's name likewise shows what is shown of
  how many.

## [0.5.1] — 2026-08-14

### Added
- **A body can be built from several columns.** A document read as a list rarely puts one
  entry's text in one place — a clause-numbered standard leaves the term, its definition
  and its note in separate detected columns, and mapping a single one threw the rest away.
  Parts that only repeat one already taken are dropped, so a reader that puts the whole
  entry in both title and description no longer doubles every record.
- **The sections a document is divided into can be dropped.** A standard numbers its
  introduction like its clauses, so it arrived looking like a requirement. Sections are
  listed with their counts; all are kept until you say otherwise.
- **Re-classify a candidate in the extraction dialogue** from a dropdown on its row. The
  row moves to the type it now belongs to and keeps its selection; on import only the
  fields the new type declares are carried over.
- **Each candidate opens the passage it came from**, with 900 characters either side and
  the matched sentence marked. The sentence alone rarely settles whether a match is right.
- **A modelling panel above the catalogue-backed tables**, showing what the catalogue
  itself says applies here, derived and accounted for.

### Changed
- The report takes its heading from the taxonomy's and the product's own names instead of
  strings fixed in the generator, and carries a control block stating what it was made from.

## [0.5.0] — 2026-08-14

Long tables became usable, catalogues arrive in the form their publishers issue them, and
the licence changed.

### Added
- **Search, facet filters and grouping on every table** past eight rows. What can be
  filtered or grouped by is read from the data rather than declared: a requirement's
  framework and category are plain text fields, and they are the two worth grouping by.
  Values within one field are alternatives, different fields must all hold, and rows
  without a value form their own group instead of disappearing.
- **OSCAL catalogue import.** OSCAL is NIST's model for control catalogues; NIST publishes
  SP 800-53 in it and the BSI its Stand-der-Technik library. Groups, controls nested inside
  controls and prose split across parts are read, and a catalogue's own named properties
  are carried into any taxonomy field of the same name — so an import can fill more than
  title and identifier without a mapping step.
- **Documents that are not tables are read as lists.** A PDF whose text is one entry per
  identifier is recognised as such, with the identifier scheme derived rather than
  configured. Measured against nine published documents from six publishers.
- **A product profile** (`src/profile/`) holding what makes this build what it is — its
  identity, taxonomy, sample study and bundled catalogues — so the engine underneath
  carries no product knowledge.

### Fixed
- **A chosen PDF or Word file is extracted, not read as bytes.** The file picker accepted
  neither, and a file chosen anyway put its compressed streams into the preview.
- **A document is classified before it is parsed.** Arbitrary text used to be read as a
  delimited table and turn into hundreds of rows of noise that looked like a result; input
  that is not a catalogue is now refused, with the reason.

### Changed
- **The licence is now the Mozilla Public License 2.0**, replacing MIT. Releases up to and
  including v0.4.6 stay MIT for anyone holding them; the change applies from the next
  release on.

  MPL-2.0 is copyleft per file. Files carrying `SPDX-License-Identifier: MPL-2.0` stay
  under it, and modifications to them have to be available. Files you add are yours, under
  a licence of your choosing — a proprietary product can be built around this without
  opening it. `npm run spdx:check` reports any source file without the marker.

  What is new in practice: the distributed `index.html` states where its source can be
  obtained, as section 3.2 requires. The banner at the top of the file carries it.

### Added
- `TRADEMARK.md` — what may be done with the name without asking. The licence covers the
  code, not the name.

## [0.4.6] — 2026-08-13

What a measure is worth, and what a second one on the same step adds, is now visible and
adjustable.

### Changed
- **Implementation levels are a parameter**, weighing 0 / ⅓ / ⅔ / 1 in line with the
  scale's own labels, and editable like every other band. Studies that record partly
  rolled-out measures will see their residual figures move.
- **Explanations rewritten for readers without a background in the method.** Each section
  states the idea it rests on before any number: an attack needs a level of skill to get
  past a step, a measure raises that level, and skill is expressed as a rank among
  attackers. The parameter texts run to 490 words where they ran to 1,047.
- **Effect strengths are grouped by the class of control they belong to** — detective,
  corrective, deterrent, avoidance — each with the channel it acts through, instead of a
  flat list of nine figures.
- **Sector notes state what is specific to each sector**, with the published figures where
  they exist, and say why there is no rate adjustment where none applies.

### Added
- **A defence-in-depth curve** showing how many of every 100 attempts get through a step
  as measures are added, switchable by implementation level. It makes the trade visible:
  four half-rolled-out measures let 26 through where one finished one lets 7.
- **A control-parametrization panel in the Treatment workshop**, holding the parameters
  that decide what the measures recorded there are worth.
- **Every row of the attempt break-down opens its own derivation**: the measures behind
  the figure with their roll-out and status, how they combine, and how that becomes the
  skill an attempt has to clear.
- **A section in the method note** on what a measure is worth and what a second one adds.

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
