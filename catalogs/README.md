# Requirement catalogs

Aurelian Lite maps your security measures to **requirements** (a compliance/traceability matrix).
Some catalogs are **built in** and can be seeded from the app; others you **import** as JSON — this
folder holds importable catalogs and a template, and is meant to be **community-extended** (PRs
welcome).

## Built in (seed from the app)

**Compliance → Requirements → Add → seed** offers these catalogs directly:

- **NIS2** — Directive (EU) 2022/2555, Art. 21(2) measures.
- **NIST CSF 2.0** — Functions & Categories (US-Gov, public domain).
- **NIST SP 800-53 Rev.5** — the 20 control families (US-Gov, public domain).

## Import a catalog

**Compliance → Requirements → Add → import a catalog** reads a JSON file in this format:

```json
{
  "name": "IEC 62443-3-3",
  "source": "…where the content came from…",
  "items": [
    { "ref_id": "FR 1", "title": "Identification and authentication control", "category": "Foundational Requirement", "description": "" }
  ]
}
```

- A bare array of items is also accepted (the file name becomes the framework name).
- Field aliases are tolerated: `ref_id`/`id`/`control`, `title`/`name`/`label`.
- `category` and `description` are optional.

### `iec-62443-3-3.json`

A **structure-only starter**: the seven Foundational Requirements (FR 1–FR 7); extend it with the
detailed System Requirements as needed.

### `template.json`

A minimal example you can copy to start a new catalog.
