# Roadmap

This roadmap is **indicative, not a commitment** — no dates, priorities may change. It exists so
that teams evaluating Aurelian Lite for multi-year work can see where the open-source edition is
heading. Feedback and contributions on any of these are welcome via
[issues](https://github.com/aurelian-risk/aurelian-lite/issues).

For what already exists, see the [CHANGELOG](CHANGELOG.md); for the honest status of the tool, see
[MATURITY](MATURITY.md).

## Planned — open-source edition

- **Configurable scale length (1..N).** Move beyond the fixed 1..4 scales so V1..V5 / L1..L5 and
  other institutional scales map without information loss — making the method neutral. (Requires
  normalising the quantification calibration and coverage to ratios rather than fixed buckets.)
- **Pre-built requirement catalogs.** Bundle **NIST SP 800-53** (US-Government public domain) and
  provide importable catalog templates for licensed frameworks such as **IEC 62443-3-3** (kept as
  user-import, since the standard is copyrighted). NIS2 and NIST CSF are already bundled.
- **Per-entity change history.** Who / when / what, with a comment, per change — **hash-chained**
  for tamper-evidence, with optional signed exports. (Single-user desktop: "who" is a configured
  editor name, not an authenticated identity — see [MATURITY](MATURITY.md).)
- **Import diff & merge.** On bundle import, preview what changes, flag conflicts, and choose per
  item — combined with a **git-friendly export format** (stable ordering) so teams can collaborate
  through their own git remote, serverlessly.
- **Attack graph + STIX.** Model non-linear, multi-vector attacks (AND/OR predecessors between
  kill-chain steps) and add **STIX 2.1** import/export (attack-pattern / course-of-action /
  relationship) for threat-intelligence interoperability.

## Explicitly out of scope for the open-source edition

These belong to the commercial **Aurelian Risk Manager**, not to Aurelian Lite:

- Real-time, multi-user **server-based collaboration** (Lite stays serverless — collaboration is via
  file/git exchange).
- Premium **deliverable templates** (e.g. Word/ANSSI/NATO report formats). Lite already produces a
  print-ready HTML report (print to PDF from the browser).
- **Generative (LLM) extraction.** Lite is embedding-only and runs entirely on-device.

Aurelian Lite is *not affiliated with* ANSSI, MITRE, NIST, IEC, or ISO. Framework references are for
mapping and are not compliance advice.
