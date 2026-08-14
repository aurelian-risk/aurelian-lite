// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Reading an OSCAL catalog.
//
// OSCAL is NIST's data model for control catalogues; NIST publishes SP 800-53 in it and
// the BSI publishes its Stand-der-Technik library in it. Nothing here knows either of
// them: a catalogue is groups of controls, a control has an id, a title, prose parts and
// named properties, and that is all this reads.
//
// The properties are carried through verbatim as `props`. What a study does with them is
// decided by its taxonomy - a field whose key matches a property name receives it (see
// catalog.ts). That is why no publisher's vocabulary appears in this file.
import type { Framework, FrameworkItem } from "./frameworks";

interface OscalProp { name: string; value: string; ns?: string; class?: string }
interface OscalPart { id?: string; name: string; prose?: string; props?: OscalProp[]; parts?: OscalPart[] }
interface OscalParam { id: string; label?: string; values?: string[]; select?: { choice?: string[] } }
interface OscalControl { id: string; title: string; class?: string; params?: OscalParam[]; props?: OscalProp[]; parts?: OscalPart[]; controls?: OscalControl[] }
interface OscalGroup { id?: string; title?: string; props?: OscalProp[]; groups?: OscalGroup[]; controls?: OscalControl[] }
interface OscalCatalog {
  uuid?: string;
  metadata?: { title?: string; version?: string; "last-modified"?: string; "oscal-version"?: string };
  groups?: OscalGroup[];
  controls?: OscalControl[];
}

/** True for JSON that is an OSCAL catalog. A profile references controls rather than
 *  defining them, so it is recognised and refused rather than read as empty. */
export function looksLikeOscal(text: string): "catalog" | "profile" | null {
  const head = text.slice(0, 4000);
  if (!/^\s*\{/.test(head)) return null;
  if (/"catalog"\s*:/.test(head)) return "catalog";
  if (/"profile"\s*:/.test(head)) return "profile";
  return null;
}

/** All prose under a part, including nested parts, in document order. */
function proseOf(part: OscalPart): string {
  const here = (part.prose ?? "").trim();
  const below = (part.parts ?? []).map(proseOf).filter(Boolean);
  return [here, ...below].filter(Boolean).join("\n\n");
}

/** OSCAL leaves blanks in the prose for the reader to fill: `{{ insert: param, x-prm1 }}`.
 *  Left as they are, that markup is what the user reads. Resolved here:
 *
 *   · a parameter the publisher has already set is substituted outright;
 *   · one left open keeps its suggested wording, in guillemets, so it reads as prose and
 *     still shows where a decision of the reader's own belongs;
 *   · a parameter the control does not declare is dropped rather than shown as markup.
 *
 *  Which parameters an item carries is reported separately (`params`), so a product can
 *  ask for them without parsing prose. */
const PARAM_RE = /\{\{\s*insert:\s*param,\s*([^}\s]+)\s*\}\}/g;

function resolveParams(text: string, params: OscalParam[] | undefined): string {
  if (!text.includes("{{")) return text;
  const by = new Map((params ?? []).map((p) => [p.id, p]));
  return text.replace(PARAM_RE, (_m, id: string) => {
    const p = by.get(id);
    if (!p) return "";
    if (p.values?.length) return p.values.join(", ");
    const choice = p.select?.choice?.length ? p.select.choice.join(" / ") : undefined;
    const open = choice ?? p.label;
    return open ? `«${open}»` : "";
  }).replace(/ {2,}/g, " ").replace(/ ([,.;:])/g, "$1").trim();
}

const flatten = (props: OscalProp[] | undefined, into: Record<string, string>) => {
  for (const p of props ?? []) {
    if (!p.name || p.value == null) continue;
    // Repeated names (OSCAL allows several `tags`) accumulate rather than overwrite.
    into[p.name] = into[p.name] ? `${into[p.name]}, ${p.value}` : String(p.value);
  }
};

function readControl(c: OscalControl, path: string[], out: FrameworkItem[]): void {
  const props: Record<string, string> = {};
  flatten(c.props, props);
  const parts = c.parts ?? [];
  const statement = parts.find((p) => p.name === "statement");
  const guidance = parts.find((p) => p.name === "guidance");
  // A statement's own props (modal verb, action word, expected result) describe the
  // requirement, so they belong beside the control's own.
  flatten(statement?.props, props);

  const body = [statement ? proseOf(statement) : "", guidance ? proseOf(guidance) : ""]
    .filter(Boolean).join("\n\n");
  // Parts other than statement/guidance are kept rather than dropped - a publisher may
  // carry examples or references there.
  const extra = parts.filter((p) => p !== statement && p !== guidance)
    .map(proseOf).filter(Boolean).join("\n\n");

  // Parameters are declared on the control and referenced from the prose beneath it.
  const open = (c.params ?? []).filter((p) => !p.values?.length)
    .map((p) => `${p.id} = ${p.select?.choice?.join(" / ") ?? p.label ?? ""}`.trim());

  out.push({
    ref_id: c.id,
    title: resolveParams(c.title ?? c.id, c.params),
    category: path[path.length - 1] ?? "",
    description: resolveParams([body, extra].filter(Boolean).join("\n\n"), c.params),
    section: path.join(" / "),
    ...(Object.keys(props).length ? { props } : {}),
    ...(open.length ? { params: open.join(" · ") } : {}),
  });

  for (const nested of c.controls ?? []) readControl(nested, path, out);
}

function readGroup(g: OscalGroup, path: string[], out: FrameworkItem[]): void {
  const label = [g.id, g.title].filter(Boolean).join(" ").trim();
  const next = label ? [...path, label] : path;
  for (const c of g.controls ?? []) readControl(c, next, out);
  for (const sub of g.groups ?? []) readGroup(sub, next, out);
}

/** Parse an OSCAL catalog into a framework. Throws on a profile or on JSON that is not
 *  a catalog, with a message that says what was found instead. */
export function parseOscalCatalog(raw: string, fallbackName: string): Framework {
  const doc = JSON.parse(raw) as { catalog?: OscalCatalog; profile?: unknown };
  if (doc.profile && !doc.catalog) {
    throw new Error("this is an OSCAL profile - it selects controls from a catalog rather than defining them, so import the catalog it refers to");
  }
  const cat = doc.catalog;
  if (!cat) throw new Error("no OSCAL catalog in this file");

  const items: FrameworkItem[] = [];
  for (const c of cat.controls ?? []) readControl(c, [], items);
  for (const g of cat.groups ?? []) readGroup(g, [], items);

  const name = cat.metadata?.title?.trim() || fallbackName || "OSCAL catalog";
  const version = cat.metadata?.version?.trim();
  return {
    key: name,
    name,
    source: ["OSCAL", version ? `version ${version}` : "", cat.metadata?.["oscal-version"] ? `OSCAL ${cat.metadata["oscal-version"]}` : ""]
      .filter(Boolean).join(" · "),
    items,
  };
}
