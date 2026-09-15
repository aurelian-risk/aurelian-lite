// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Does what leaves for a language model come back through the import?
//
// The LLM exports close with the records as the application stores them, so an answer in
// that shape can be pasted into the import dialog. This takes each export, cuts the
// fenced blocks the way the import does, and checks that what is inside is the study:
// the same id, every record's type in the taxonomy, every value byte-equal - and that
// the block a model would echo (the schema excerpt) is NOT taken for the data.
//
// Run: npm run test:llmcontext
import { pathToFileURL } from "node:url";
import yaml from "js-yaml";

const need = (k) => { const v = process.env[k]; if (!v) { console.error(`set ${k}`); process.exit(2); } return v; };
const { workshopMarkdown, quantLlmMarkdown } = await import(pathToFileURL(need("MOD_R")).href);
const { parseBundle } = await import(pathToFileURL(need("MOD_PS")).href);
const { DEFAULT_TAXONOMY } = await import(pathToFileURL(need("MOD_P")).href);
const { makeSampleStudy } = await import(pathToFileURL(need("MOD_S")).href);

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "✓" : "✗"} ${name}${detail && !cond ? `  (${detail})` : ""}`);
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const tax = DEFAULT_TAXONOMY;
const study = makeSampleStudy();
const byId = new Map(study.entities.map((e) => [e.id, e]));
const typeKeys = new Set(tax.entityTypes.map((t) => t.key));

// The whole export pasted, fences and prose and all - the lazy path, and the one a
// person actually takes.
const roundTrip = (label, md, seedTypes) => {
  const bundle = parseBundle(md);
  ok(`${label}: the pasted export parses as a data bundle, not a taxonomy`, bundle.kind === "ebios-data" && !bundle.taxonomy, bundle.kind);
  const s = bundle.studies?.[0];
  ok(`${label}: the study id is the study's`, s?.id === study.id);
  const ents = s?.entities ?? [];
  const want = study.entities.filter((e) => seedTypes.has(e.type));
  ok(`${label}: every record of the export's types is in the block`, ents.length === want.length, `${ents.length} vs ${want.length}`);
  ok(`${label}: every record has a type the taxonomy knows`, ents.every((e) => typeKeys.has(e.type)));
  ok(`${label}: every value is byte-equal to the study's`, ents.every((e) => eq(e.values, byId.get(e.id)?.values)));
  ok(`${label}: records carry no timestamps or provenance`, ents.every((e) => !("createdAt" in e) && !("source" in e)));
  // The schema excerpt describes every type the records use.
  const schema = yaml.load(md.match(/### Data model[\s\S]*?```yaml\n([\s\S]*?)```/)[1]);
  ok(`${label}: the model excerpt names every type in the block`, [...seedTypes].every((k) => schema.entityTypes.some((t) => t.key === k)));
  ok(`${label}: the excerpt keeps what validates a value`, schema.entityTypes.every((t) => t.fields.every((f) =>
    (f.type !== "enum" || Array.isArray(f.options)) && (f.type !== "scale" || Array.isArray(f.scaleLabels)) && (f.type !== "ref" || f.refType))));
  ok(`${label}: presentation keys stay out`, !/\b(column|toggle|polarity|optionLabels):/.test(md.match(/### Data model[\s\S]*?```yaml\n([\s\S]*?)```/)[1]));
  // Every id a record points at is either in the block or in the reference list.
  const listed = new Set([...md.matchAll(/^- `([^`]+)` - /gm)].map((m) => m[1]));
  const inBlock = new Set(ents.map((e) => e.id));
  const dangling = [];
  for (const e of ents) for (const v of Object.values(e.values)) for (const id of Array.isArray(v) ? v : [v])
    if (typeof id === "string" && byId.has(id) && !inBlock.has(id) && !listed.has(id)) dangling.push(id);
  ok(`${label}: every referenced id is resolvable from the text`, dangling.length === 0, dangling.slice(0, 3).join(","));
  // A referenced record is NOT a record of the block: an echo must not overwrite it.
  ok(`${label}: referenced records are outside the YAML`, [...listed].every((id) => !inBlock.has(id)));
  return ents;
};

for (const g of tax.groups) {
  const seed = new Set(tax.entityTypes.filter((t) => t.group === g.key).map((t) => t.key));
  roundTrip(`workshop "${g.key}"`, workshopMarkdown(tax, study, g.key), seed);
}

// The quant export: scenarios, steps and what defends them.
{
  const op = tax.entityTypes.find((t) => t.fields.some((f) => f.key === "difficulty"));
  const step = tax.entityTypes.find((t) => t.fields.some((f) => f.type === "ref" && f.refType) && t.fields.some((f) => f.type === "number"));
  const seed = new Set([op.key, step.key, ...tax.entityTypes.filter((t) => t.fields.some((f) => f.type === "multiref" && f.refType === step.key)).map((t) => t.key)]);
  const md = quantLlmMarkdown(tax, study);
  roundTrip("quant", md, seed);
  ok("quant: the prose still precedes the block", md.indexOf("## 1. The model") < md.indexOf("## Context for an additive import"));
}

// What a model answers with: one fenced block, a subset, one record new. The import must
// take the block for what it is even when the prose around it says "here is your file".
{
  const asset = study.entities.find((e) => e.type === tax.entityTypes[0].key);
  const answer = `Here are the changes you asked for.\n\n\`\`\`yaml\nstudies:\n  - id: ${study.id}\n    entities:\n      - id: ${asset.id}\n        type: ${asset.type}\n        values:\n          name: Renamed\n      - id: new-1\n        type: ${asset.type}\n        values:\n          name: A new one\n\`\`\`\n\nLet me know if you need more.\n`;
  const b = parseBundle(answer);
  ok("an answer wrapped in prose parses to its block", b.kind === "ebios-data" && b.studies?.[0]?.entities?.length === 2);
  ok("plain YAML without a fence still parses", parseBundle(`studies:\n  - id: x\n    entities: []\n`).kind === "ebios-data");
  let threw = false; try { parseBundle("just a sentence, no data"); } catch { threw = true; }
  ok("prose without a block is refused, not read as a study", threw);
}

console.log(`\n${pass}/${pass + fail} llm-context assertions passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
