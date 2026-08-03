# Requirement catalogs

Aurelian Lite maps your security measures to **requirements** (a compliance/traceability matrix).
Some catalogs are **built in** and can be seeded from the app; others you **import** as JSON — this
folder holds importable catalogs and a template, and is meant to be **community-extended** (PRs
welcome).

## Built in (seed from the app)

**Compliance → Requirements → Add → seed** offers these public/free catalogs directly:

- **NIS2** — Directive (EU) 2022/2555, Art. 21(2) measures.
- **NIST CSF 2.0** — Functions & Categories (US-Gov, public domain).
- **NIST SP 800-53 Rev.5** — the 20 control families (US-Gov, public domain).

## Import (bring your own / licensed catalogs)

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

Copyrighted or restrictively-licensed standards (ISO/IEC 27001/27002, **IEC 62443-3-3** detailed
system requirements, CIS Controls, BSI IT-Grundschutz) are **not** bundled. Import them from your
own licensed copy — the files here give you the structure to fill in.

### `iec-62443-3-3.json`

A **structure-only starter**: the seven Foundational Requirements (FR 1–FR 7), which are a
high-level public reference. It intentionally does **not** include the copyrighted detailed
System Requirements (SR x.y) text — add those from your licensed copy of the standard.

### `template.json`

A minimal example you can copy to start a new catalog.
