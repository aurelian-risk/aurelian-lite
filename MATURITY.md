# Maturity & suitability

This document states honestly what Aurelian Lite **is** and **is not**, so that institutions can
weigh the investment fairly. Read it alongside the [LICENSE](LICENSE) (Mozilla Public License 2.0 — provided "as is").

## Status: Stable

Aurelian Lite is in productive use and actively developed. It is a **single-user, desktop-class
analysis aid** that runs entirely in your browser from one HTML file. The data format is settled:
a study written by an earlier version is read by a later one, and where the schema grows, the
change is stated in the [CHANGELOG](CHANGELOG.md).

## What it is

- A structured **cyber risk analysis** tool inspired by EBIOS RM and ISO/IEC 27005 — for modelling
  assets, threats, attack paths, treatments, coverage, and (deterministic, offline) Monte-Carlo
  risk quantification.
- **Local and private:** no server, no account, no telemetry. Nothing leaves your machine unless
  *you* export a file.

## What it is **not** (current limitations)

- **Not multi-user and not access-controlled.** There is no authentication, no authorisation, and
  no server. Any "author"/editor attribution is a self-declared name, **not** a verified identity.
  Collaboration today is by exchanging exported files.
- **Not evaluated for classified or protectively-marked information.** It has no accreditation,
  certification, or formal security evaluation. Do not use it to process information whose handling
  requires controls the tool does not provide. You are responsible for classifying your data and
  choosing an appropriate environment.
- **Not a system of record.** Persistence is your responsibility: export and back up your studies.
  Browser storage can be cleared by the browser or the OS.
- **Not professional advice and not a compliance guarantee.** Outputs — including any suggestions,
  scores, coverage figures, and monetary estimates — are modelling aids that **must be reviewed by
  qualified personnel**. Framework mappings are illustrative, not certification.
- **No warranty.** Provided under the Mozilla Public License 2.0, "as is", without warranty of
  any kind and without liability, to the extent permitted by law.

## Data & format stability

- Studies and the taxonomy are stored/exported as JSON/YAML. The schema is migrated forward on
  load, so an older export opens in a newer build. Keep your own backups all the same.
- Model weights are never bundled or exported; on-device embedding models are fetched at runtime by
  their library and cached.

## Changes

- What has changed: [CHANGELOG.md](CHANGELOG.md).

## Relationship to Aurelian Risk Manager

Aurelian Lite is the open-source companion to the commercial **Aurelian Risk Manager**. Capabilities
that require a server or ongoing service — real-time collaboration, premium deliverable templates,
generative extraction — are intentionally part of the commercial product, not this edition.
