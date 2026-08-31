// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Builds an LLM-friendly, taxonomy-valid text dump of one workshop (group):
// the schema (entity types + fields) followed by the data (entities with
// relationships resolved to names). Paste into an LLM chat as grounded context.
import type { EntityRecord, EntityTypeDef, FieldDef, FieldValue, Study, Taxonomy } from "./types";
import { tn } from "./i18n";
import { columnFields, fieldLabel, getType, groupDescription, groupLabel, isSetBack, recordTitle, scaleLabel, scaleMax, typeLabel, typeLabelPlural } from "./taxonomy";
import { spreadColumn } from "./graph";
import { PRODUCT } from "../profile";
import { deriveInputs, meanOf } from "./quantModel";
import { residualPos } from "./treatment";
import { simulate, type QuantInputs, type QuantResult } from "./montecarlo";
import { CALIBRATION_DOC, DEFAULT_CALIBRATION } from "./calibration";
import { effectClassOf } from "./controls";
import { likelihoodCheck } from "./frequency";

function fieldSpec(f: FieldDef, tax: Taxonomy): string {
  const parts: string[] = [f.type];
  if (f.type === "enum" && f.options) parts.push(`options: ${f.options.join(" | ")}`);
  if (f.type === "scale" && f.scaleLabels) parts.push(`scale: ${f.scaleLabels.join(" < ")}`);
  if ((f.type === "ref" || f.type === "multiref") && f.refType) {
    const rt = getType(tax, f.refType);
    parts.push(`→ ${rt?.label ?? f.refType}${f.type === "multiref" ? " (many)" : ""}`);
  }
  if (f.required) parts.push("required");
  return `\`${f.key}\` (${parts.join(", ")})`;
}

function valueMd(f: FieldDef, v: FieldValue, tax: Taxonomy, study: Study): string {
  const nameOf = (id: string) => {
    const r = study.entities.find((e) => e.id === id);
    const t = r && getType(tax, r.type);
    return r && t ? recordTitle(t, r) : "?";
  };
  if (v == null || v === "") return "—";
  switch (f.type) {
    case "scale": return typeof v === "number" ? scaleLabel(f, v) : String(v);
    case "boolean": return v ? "yes" : "no";
    case "ref": return typeof v === "string" ? nameOf(v) : "—";
    case "multiref": return Array.isArray(v) && v.length ? (v as string[]).map(nameOf).join(", ") : "—";
    default: return String(v);
  }
}

export function workshopMarkdown(tax: Taxonomy, study: Study, groupKey: string): string {
  const group = tax.groups.find((g) => g.key === groupKey);
  const types = tax.entityTypes.filter((t) => t.group === groupKey);
  const L: string[] = [];

  // The method is the taxonomy's to name, not this file's.
  L.push(`# ${tax.name} - ${group?.label ?? groupKey}`);
  if (group?.description) L.push(`_${group.description}_`);
  L.push("");
  L.push(`**Study:** ${study.name}${study.organization ? ` (${study.organization})` : ""}`);
  if (study.scope) L.push(`**Scope:** ${study.scope}`);
  L.push("");

  L.push("## Schema (valid taxonomy for this workshop)");
  for (const t of types) {
    L.push(`### ${typeLabel(t)} \`${t.key}\``);
    for (const f of t.fields) L.push(`- ${fieldLabel(f)}: ${fieldSpec(f, tax)}`);
    L.push("");
  }

  L.push("## Data");
  for (const t of types) {
    const items = study.entities.filter((e) => e.type === t.key);
    L.push(`### ${typeLabelPlural(t)} (${items.length})`);
    if (items.length === 0) L.push("_none_");
    items.forEach((e: EntityRecord, i) => {
      L.push(`${i + 1}. **${recordTitle(t, e)}**`);
      for (const f of t.fields) {
        if (f.key === (t.titleField ?? "name")) continue;
        const val = valueMd(f, e.values[f.key] ?? null, tax, study);
        if (val !== "—") L.push(`   - ${fieldLabel(f)}: ${val}`);
      }
    });
    L.push("");
  }

  return L.join("\n").trim() + "\n";
}

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Records above which a register is printed as a table rather than one card each. A dozen
 *  cards is a section someone reads; a hundred is a copy of the catalogue with the document
 *  somewhere inside it. */
const CARD_LIMIT = 12;
/** Columns a printed register can carry before it stops fitting a page. */
const TABLE_COLS = 6;
/** Rows above which a table is set dense rather than at reading size. */
const DENSE_ROWS = 20;

/** One table cell: a pipe would end the column early and a line break would end the row,
 *  so both are neutralised rather than escaped - the cell is a summary, and the record's
 *  own text is elsewhere in the document. */
const cellText = (v: string): string => v.replace(/\|/g, "/").replace(/\s*\n+\s*/g, " ").trim();

/** Sanitize + truncate a label for embedded SVG text (strip separators/newlines). */
const mm = (s: string, n = 46): string => {
  const out = String(s).replace(/[":;#<>|`\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  return out.length > n ? out.slice(0, n - 1) + "…" : out;
};

/** Inline SVG of the likelihood × gravity risk matrix (strategic scenarios), for
 *  embedding in the Markdown report. Returns null if there's no suitable type. */
export function riskMatrixSvg(tax: Taxonomy, study: Study, opts?: { posFn?: (e: EntityRecord) => { x: number; y: number } }): string | null {
  const type = tax.entityTypes.find((t) => /scenario/i.test(t.key) && !/operational/i.test(t.key) && t.fields.filter((f) => f.type === "scale").length >= 2);
  if (!type) return null;
  const scales = type.fields.filter((f) => f.type === "scale");
  const xF = scales[0], yF = scales[1];
  const xMax = scaleMax(xF), yMax = scaleMax(yF);
  const items = study.entities.filter((e) => e.type === type.key && !isSetBack(tax, e));
  if (!items.length) return null;
  const pos = opts?.posFn ?? ((e: EntityRecord) => ({ x: Number(e.values[xF.key]) || 1, y: Number(e.values[yF.key]) || 1 }));
  const at = (x: number, y: number) => items.filter((e) => { const p = pos(e); return p.x === x && p.y === y; });
  const colorFor = (r: number) => r < 0.3 ? "#2fa36f" : r < 0.55 ? "#e0a13a" : r < 0.8 ? "#dd7a33" : "#d1495b";

  // Wider cells + a per-label chip so long scenario names stay readable, and a
  // self-contained light card background so dark text is legible on ANY report
  // theme (GitHub/VS Code dark mode, etc.).
  const L0 = 118, B = 48, T = 14, PAD = 12, cw = 176, ch = 78, rowH = 15, chars = 26;
  const innerW = L0 + xMax * cw, innerH = T + yMax * ch + B;
  const W = innerW + PAD * 2, H = innerH + PAD * 2;
  const trunc = (s: string) => s.length > chars ? s.slice(0, chars - 1).trimEnd() + "…" : s;
  const p: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-sans-serif,system-ui,Segoe UI,Roboto,sans-serif">`];
  p.push(`<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14" fill="#f7f8fb" stroke="#d7dbe3"/>`);
  p.push(`<g transform="translate(${PAD} ${PAD})">`);
  for (let yi = 0; yi < yMax; yi++) {
    const y = yMax - yi, cy = T + yi * ch;
    p.push(`<text x="${L0 - 12}" y="${cy + ch / 2}" text-anchor="end" dominant-baseline="middle" font-size="11.5" fill="#5a6675">${esc(scaleLabel(yF, y))}</text>`);
    for (let x = 1; x <= xMax; x++) {
      const cx = L0 + (x - 1) * cw, c = colorFor((x / xMax) * (y / yMax));
      p.push(`<rect x="${cx + 3}" y="${cy + 3}" width="${cw - 6}" height="${ch - 6}" rx="9" fill="${c}" fill-opacity="0.16" stroke="${c}" stroke-opacity="0.5"/>`);
      const cell = at(x, y);
      cell.slice(0, 3).forEach((e, i) => {
        const t = trunc(recordTitle(type, e)); const ry = cy + 11 + i * rowH;
        p.push(`<rect x="${cx + 9}" y="${ry}" width="${cw - 20}" height="${rowH - 2}" rx="4" fill="#ffffff" fill-opacity="0.72"/>`);
        p.push(`<text x="${cx + 14}" y="${ry + 10}" font-size="10.5" fill="#1c2430">${esc(t)}</text>`);
      });
      if (cell.length > 3) p.push(`<text x="${cx + 14}" y="${cy + 11 + 3 * rowH + 9}" font-size="10" fill="#5a6675">+${cell.length - 3} more</text>`);
    }
  }
  for (let x = 1; x <= xMax; x++)
    p.push(`<text x="${L0 + (x - 1) * cw + cw / 2}" y="${innerH - 26}" text-anchor="middle" font-size="11.5" fill="#5a6675">${esc(scaleLabel(xF, x))}</text>`);
  p.push(`<text x="${L0 + (xMax * cw) / 2}" y="${innerH - 8}" text-anchor="middle" font-size="11.5" font-weight="600" fill="#3a4552">${esc(fieldLabel(xF))} →</text>`);
  const yc = T + (yMax * ch) / 2;
  p.push(`<text x="4" y="${yc}" text-anchor="middle" font-size="11.5" font-weight="600" fill="#3a4552" transform="rotate(-90 4 ${yc})">${esc(fieldLabel(yF))} →</text>`);
  p.push("</g></svg>");
  return p.join("");
}

// Shared hex palette for embedded report SVGs (theme-independent light cards).
const HEX = { green: "#2fa36f", amber: "#e0a13a", orange: "#dd7a33", red: "#d1495b", ink: "#1c2430", muted: "#5a6675", card: "#f7f8fb", edge: "#d7dbe3", track: "#e5e8ee" };
/** Good→bad colour on a scale value, respecting polarity (positive = high is good). */
function barColor(v: number, max: number, positive = false): string {
  const r = (v - 1) / Math.max(1, max - 1), bad = positive ? 1 - r : r;
  return bad < 0.25 ? HEX.green : bad < 0.5 ? HEX.amber : bad < 0.75 ? HEX.orange : HEX.red;
}

/** Colour-coded horizontal bar chart of ALL scale fields of one record (attacker
 *  profile, risk-quantification assessment, …), as a self-contained light SVG. */
function scaleBarsSvg(type: EntityTypeDef, rec: EntityRecord): string | null {
  const scales = type.fields.filter((f) => f.type === "scale");
  if (!scales.length) return null;
  const PAD = 13, rowH = 27, labelW = 150, barW = 160, valW = 100;
  const W = PAD * 2 + labelW + barW + valW, H = PAD * 2 + scales.length * rowH;
  const p: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-sans-serif,system-ui,Segoe UI,Roboto,sans-serif">`];
  p.push(`<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="12" fill="${HEX.card}" stroke="${HEX.edge}"/>`);
  scales.forEach((f, i) => {
    const v = Number(rec.values[f.key] ?? 1), max = scaleMax(f), c = barColor(v, max, f.polarity === "positive");
    const cy = PAD + i * rowH + rowH / 2;
    p.push(`<text x="${PAD}" y="${cy + 4}" font-size="11.5" fill="${HEX.muted}">${esc(mm(fieldLabel(f), 24))}</text>`);
    p.push(`<rect x="${PAD + labelW}" y="${cy - 4}" width="${barW}" height="8" rx="4" fill="${HEX.track}"/>`);
    p.push(`<rect x="${PAD + labelW}" y="${cy - 4}" width="${Math.max(6, barW * v / max).toFixed(1)}" height="8" rx="4" fill="${c}"/>`);
    p.push(`<text x="${PAD + labelW + barW + 9}" y="${cy + 4}" font-size="11" fill="${HEX.ink}">${esc(mm(scaleLabel(f, v), 16))}</text>`);
  });
  p.push("</svg>");
  return p.join("");
}

/** Asset-criticality heatmap (coloured tiles) + the expanded supporting-asset
 *  tree as a nested list. Returns the section body Markdown, or null. */
function assetHeatmapSection(tax: Taxonomy, study: Study): string | null {
  const biz = tax.entityTypes.find((t) => t.fields.some((f) => f.type === "scale") && tax.entityTypes.some((o) => o.fields.some((f) => f.type === "multiref" && f.refType === t.key)));
  const critF = biz?.fields.find((f) => f.type === "scale");
  if (!biz || !critF) return null;
  const supp = tax.entityTypes.find((t) => t.fields.some((f) => f.type === "multiref" && f.refType === biz.key));
  const suppRefF = supp?.fields.find((f) => f.type === "multiref" && f.refType === biz.key);
  const typeF = supp?.fields.find((f) => f.type === "enum");
  const items = study.entities.filter((e) => e.type === biz.key);
  if (!items.length) return null;
  const max = scaleMax(critF);
  const supportersOf = (id: string): EntityRecord[] => (supp && suppRefF)
    ? study.entities.filter((e) => e.type === supp.key && Array.isArray(e.values[suppRefF.key]) && (e.values[suppRefF.key] as string[]).includes(id)) : [];
  const tiles = items.map((e) => ({ e, v: Number(e.values[critF.key] ?? 1), sup: supportersOf(e.id) })).sort((a, b) => b.v - a.v);

  // Expanded tree: each business asset as a criticality-coloured header with its
  // supporting assets listed beneath (mirrors the in-app expanded heatmap tile).
  const PAD = 14, headH = 30, rowH = 20, gap = 12, W = 660;
  let H = PAD + 20;
  for (const t of tiles) H += headH + t.sup.length * rowH + gap;
  H += PAD - gap;
  const p: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-sans-serif,system-ui,Segoe UI,Roboto,sans-serif">`];
  p.push(`<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14" fill="${HEX.card}" stroke="${HEX.edge}"/>`);
  p.push(`<text x="${PAD}" y="${PAD + 11}" font-size="11" font-weight="600" fill="${HEX.muted}">Business assets by criticality - with supporting assets</text>`);
  let y = PAD + 22;
  for (const t of tiles) {
    const c = barColor(t.v, max, false);
    p.push(`<rect x="${PAD}" y="${y}" width="${W - 2 * PAD}" height="${headH}" rx="8" fill="${c}" fill-opacity="0.16" stroke="${c}" stroke-opacity="0.5"/>`);
    p.push(`<text x="${PAD + 12}" y="${y + 19}" font-size="13" font-weight="600" fill="${HEX.ink}">${esc(mm(recordTitle(biz, t.e), 46))}</text>`);
    const right = `${scaleLabel(critF, t.v)}${supp ? ` · ${t.sup.length} ${t.sup.length === 1 ? typeLabel(supp).toLowerCase() : typeLabelPlural(supp).toLowerCase()}` : ""}`;
    p.push(`<text x="${W - PAD - 12}" y="${y + 19}" text-anchor="end" font-size="11" font-weight="600" fill="${c}">${esc(mm(right, 40))}</text>`);
    let sy = y + headH;
    for (const sa of t.sup) {
      const midY = sy + rowH / 2;
      p.push(`<path d="M ${PAD + 16} ${y + headH} L ${PAD + 16} ${midY} L ${PAD + 27} ${midY}" fill="none" stroke="${HEX.edge}" stroke-width="1.2"/>`);
      let tx = PAD + 32;
      const tg = typeF && sa.values[typeF.key] ? mm(String(sa.values[typeF.key]), 16) : "";
      if (tg) { const tw2 = 10 + tg.length * 5.4; p.push(`<rect x="${tx}" y="${midY - 8}" width="${tw2.toFixed(0)}" height="16" rx="4" fill="${HEX.track}"/><text x="${(tx + tw2 / 2).toFixed(0)}" y="${midY + 4}" text-anchor="middle" font-size="9.5" fill="${HEX.muted}">${esc(tg)}</text>`); tx += tw2 + 9; }
      p.push(`<text x="${tx}" y="${midY + 4}" font-size="11.5" fill="${HEX.ink}">${esc(mm(recordTitle(supp!, sa), 64))}</text>`);
      sy += rowH;
    }
    y = sy + gap;
  }
  p.push("</svg>");

  const tree = tiles.map((t) => {
    const headLine = `- **${mm(recordTitle(biz, t.e), 60)}** - ${scaleLabel(critF, t.v)}`;
    const kids = t.sup.map((sa) => `  - ${mm(recordTitle(supp!, sa), 60)}${typeF && sa.values[typeF.key] ? ` _(${mm(String(sa.values[typeF.key]), 20)})_` : ""}`);
    return [headLine, ...kids].join("\n");
  }).join("\n");
  return `<div align="center">${p.join("")}</div>\n\n${tree}\n`;
}

const SERIES_HEX = ["#2a9d8f", "#7c5cbb", "#e0a13a", "#d1495b", "#4f8fd0", "#2fa36f", "#b5651d", "#3a7ca5"];
const polarPt = (cx: number, cy: number, r: number, deg: number): [number, number] => {
  const a = (deg - 90) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};
interface RSeries { label: string; color: string; values: number[]; sub?: string }

/** Static radar SVG (single or multi series). Falls back to horizontal bars when
 *  there are fewer than 3 axes (a radar would be unreadable). */
function radarSvg(axisLabels: string[], series: RSeries[], axisSubs?: string[]): string | null {
  const n = axisLabels.length;
  if (!n || !series.length) return null;
  const multi = series.length > 1;

  if (n < 3) { // bars fallback (single-series case, e.g. two frameworks)
    const s = series[0], PAD = 14, rowH = 26, labelW = 150, barW = 170, valW = 100;
    const W = PAD * 2 + labelW + barW + valW, H = PAD * 2 + n * rowH;
    const q: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-sans-serif,system-ui,Segoe UI,Roboto,sans-serif">`];
    q.push(`<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="12" fill="${HEX.card}" stroke="${HEX.edge}"/>`);
    axisLabels.forEach((lb, i) => {
      const cy = PAD + i * rowH + rowH / 2, v = s.values[i];
      q.push(`<text x="${PAD}" y="${cy + 4}" font-size="11.5" fill="${HEX.muted}">${esc(mm(lb, 24))}</text>`);
      q.push(`<rect x="${PAD + labelW}" y="${cy - 4}" width="${barW}" height="8" rx="4" fill="${HEX.track}"/>`);
      q.push(`<rect x="${PAD + labelW}" y="${cy - 4}" width="${Math.max(4, barW * v).toFixed(1)}" height="8" rx="4" fill="${s.color}"/>`);
      q.push(`<text x="${PAD + labelW + barW + 9}" y="${cy + 4}" font-size="11" fill="${HEX.ink}">${Math.round(v * 100)}%${axisSubs ? ` · ${esc(axisSubs[i])}` : ""}</text>`);
    });
    q.push("</svg>");
    return q.join("");
  }

  const cx = 210, cy = 130, R = 84, W = 420, legendRows = multi ? Math.ceil(series.length / 2) : 0;
  const H = 248 + legendRows * 20;
  const ring = (f: number) => axisLabels.map((_, i) => polarPt(cx, cy, R * f, i * 360 / n).join(",")).join(" ");
  const p: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-sans-serif,system-ui,Segoe UI,Roboto,sans-serif">`];
  p.push(`<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="12" fill="${HEX.card}" stroke="${HEX.edge}"/>`);
  [0.25, 0.5, 0.75, 1].forEach((f) => p.push(`<polygon points="${ring(f)}" fill="none" stroke="${HEX.edge}"/>`));
  axisLabels.forEach((_, i) => { const [x, y] = polarPt(cx, cy, R, i * 360 / n); p.push(`<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${HEX.edge}"/>`); });
  series.forEach((s) => {
    const pts = s.values.map((v, i) => polarPt(cx, cy, R * Math.max(0.02, v), i * 360 / n));
    p.push(`<polygon points="${pts.map((pp) => pp.map((z) => z.toFixed(1)).join(",")).join(" ")}" fill="${s.color}" fill-opacity="${multi ? 0.1 : 0.18}" stroke="${s.color}" stroke-width="2"/>`);
    pts.forEach((pp) => p.push(`<circle cx="${pp[0].toFixed(1)}" cy="${pp[1].toFixed(1)}" r="3" fill="${s.color}"/>`));
  });
  axisLabels.forEach((lb, i) => {
    const [x, y] = polarPt(cx, cy, R + 18, i * 360 / n), anchor = Math.abs(x - cx) < 8 ? "middle" : x > cx ? "start" : "end";
    p.push(`<text x="${x.toFixed(0)}" y="${y.toFixed(0)}" text-anchor="${anchor}" font-size="11" font-weight="600" fill="${HEX.ink}">${esc(mm(lb, 20))}</text>`);
    if (!multi) p.push(`<text x="${x.toFixed(0)}" y="${(y + 13).toFixed(0)}" text-anchor="${anchor}" font-size="10" fill="${HEX.muted}">${Math.round(series[0].values[i] * 100)}%${axisSubs ? ` · ${esc(axisSubs[i])}` : ""}</text>`);
  });
  if (multi) series.forEach((s, i) => {
    const lx = 14 + (i % 2) * ((W - 28) / 2), ly = 248 + Math.floor(i / 2) * 20 - 4;
    p.push(`<rect x="${lx}" y="${ly - 9}" width="11" height="11" rx="2" fill="${s.color}"/>`);
    p.push(`<text x="${lx + 16}" y="${ly}" font-size="11" fill="${HEX.ink}">${esc(mm(s.label + (s.sub ? ` · ${s.sub}` : ""), 34))}</text>`);
  });
  p.push("</svg>");
  return p.join("");
}

/** Threat-landscape radar: actors compared across their EBIOS rating scores. */
function threatRadarSvg(tax: Taxonomy, study: Study): string | null {
  const t = tax.entityTypes.find((x) => x.fields.some((f) => f.type === "scale" && f.key === "capability"));
  if (!t) return null;
  const scales = t.fields.filter((f) => f.type === "scale");
  if (scales.length < 3) return null;
  const catF = t.fields.find((f) => f.type === "enum");
  const actors = study.entities.filter((e) => e.type === t.key && !isSetBack(tax, e));
  if (!actors.length) return null;
  const series: RSeries[] = actors.map((a, i) => ({
    label: recordTitle(t, a), color: SERIES_HEX[i % SERIES_HEX.length],
    sub: catF ? String(a.values[catF.key] ?? "") : undefined,
    values: scales.map((f) => (Number(a.values[f.key] ?? 1) - 1) / Math.max(1, scaleMax(f) - 1)),
  }));
  return radarSvg(scales.map((f) => fieldLabel(f)), series);
}

/** Framework-coverage radar: share of each framework's requirements fulfilled. */
function frameworkRadarSvg(tax: Taxonomy, study: Study): string | null {
  const reqType = tax.entityTypes.find((t) => t.fields.some((f) => f.key === "framework"));
  const fwF = reqType?.fields.find((f) => f.key === "framework");
  const measureType = tax.entityTypes.find((t) => t.fields.some((f) => f.type === "multiref" && f.refType === reqType?.key));
  const fulfillsF = measureType?.fields.find((f) => f.type === "multiref" && f.refType === reqType?.key);
  if (!reqType || !fwF || !measureType || !fulfillsF) return null;
  const reqs = study.entities.filter((e) => e.type === reqType.key);
  if (!reqs.length) return null;
  const measures = study.entities.filter((e) => e.type === measureType.key);
  const fulfilled = (id: string) => measures.some((m) => Array.isArray(m.values[fulfillsF.key]) && (m.values[fulfillsF.key] as string[]).includes(id));
  const g = new Map<string, { t: number; c: number }>();
  for (const r of reqs) { const fw = String(r.values[fwF.key] || "Other"); const e = g.get(fw) ?? { t: 0, c: 0 }; e.t++; if (fulfilled(r.id)) e.c++; g.set(fw, e); }
  const entries = [...g.entries()];
  return radarSvg(entries.map(([k]) => k), [{ label: "coverage", color: "#7c5cbb", values: entries.map(([, v]) => (v.t ? v.c / v.t : 0)) }], entries.map(([, v]) => `${v.c}/${v.t}`));
}

const truncTxt = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

/** Inline SVG (offline, no mermaid/CDN) of the attack chain: risk source ->
 *  strategic scenario -> feared event (origin -> action -> result), as a 3-column
 *  layered flow with curved edges. */
function attackFlowSvg(tax: Taxonomy, study: Study): string | null {
  const originType = getType(tax, "risk_origin"), stratType = getType(tax, "strategic_scenario"), fearedType = getType(tax, "feared_event");
  if (!originType || !stratType) return null;
  // Out of scope is out of the picture: the diagram draws the perimeter as it stands now.
  const origins = study.entities.filter((e) => e.type === "risk_origin" && !isSetBack(tax, e));
  const strat = study.entities.filter((e) => e.type === "strategic_scenario" && !isSetBack(tax, e)
    && origins.some((o) => o.id === e.values.risk_origin));
  if (!origins.length || !strat.length) return null;
  const byId = new Map(study.entities.map((e) => [e.id, e]));
  const get = (id: FieldValue | undefined) => (typeof id === "string" ? byId.get(id) : undefined);
  const catF = originType.fields.find((f) => f.type === "enum");
  const likeF = stratType.fields.find((f) => f.key === "likelihood"), gravF = stratType.fields.find((f) => f.key === "gravity");
  const impF = fearedType?.fields.find((f) => f.type === "enum"), sevF = fearedType?.fields.find((f) => f.type === "scale");

  interface Node { id: string; title: string; sub: string }
  const sNodes = strat.map((s) => {
    const lg = [likeF && `L ${scaleLabel(likeF, Number(s.values[likeF.key] ?? 1))}`, gravF && `G ${scaleLabel(gravF, Number(s.values[gravF.key] ?? 1))}`].filter(Boolean).join(" · ");
    const fe = fearedType ? get(s.values.feared_event) : undefined;
    return { id: s.id, title: recordTitle(stratType, s), sub: lg, originId: String(s.values.risk_origin), fearedId: fe?.id };
  });
  const feared = new Map<string, Node>();
  for (const s of sNodes) {
    if (!s.fearedId) continue;
    const fe = get(s.fearedId); if (!fe || !fearedType || feared.has(s.fearedId)) continue;
    const sub = [impF && String(fe.values[impF.key] ?? ""), sevF && scaleLabel(sevF, Number(fe.values[sevF.key] ?? 1))].filter(Boolean).join(", ");
    feared.set(s.fearedId, { id: s.fearedId, title: recordTitle(fearedType, fe), sub });
  }

  // The middle column gets one row per scenario, so the sheet used to grow with the study
  // and nothing else: 90 boxes came to 2772px. The rows are compressed instead, down to a
  // floor where both lines of a box still fit, and past what even that can hold the rest is
  // left out AND SAID SO - a diagram that silently drops half a study is worse than a
  // diagram that admits where it stopped.
  const PAD = 14, colW = 272, gap = 42;
  const MAX_H = 1500, ROW_MAX = 62, ROW_MIN = 44;
  const capacity = Math.floor((MAX_H - PAD * 2 - 16) / ROW_MIN);
  const omitted = Math.max(0, sNodes.length - capacity);
  const shown = omitted ? sNodes.slice(0, capacity) : sNodes;
  const rowH = Math.max(ROW_MIN, Math.min(ROW_MAX, (MAX_H - PAD * 2 - 16) / Math.max(1, shown.length)));
  const boxH = Math.min(46, rowH - 16);
  const x0 = PAD, x1 = PAD + colW + gap, x2 = PAD + 2 * (colW + gap), W = x2 + colW + PAD;
  const H = PAD * 2 + shown.length * rowH + 16 + (omitted ? 18 : 0);
  const yMid = (i: number) => PAD + i * rowH + rowH / 2;
  const sY = new Map(shown.map((s, i) => [s.id, yMid(i)]));
  const avgY = (ids: string[]) => ids.reduce((a, id) => a + (sY.get(id) ?? 0), 0) / (ids.length || 1);
  // An outer box sits at the mean height of what it connects to - which puts two of them on
  // top of each other as soon as their scenarios interleave. Sorting by that mean and then
  // enforcing a gap keeps the ORDER the means expressed and gives up only the exact height.
  const spread = (ids: string[], wants: number[]) => {
    const ys = spreadColumn(wants, boxH + 6, PAD + boxH / 2, H - PAD - 16 - boxH / 2);
    return new Map(ids.map((id, i) => [id, ys[i]]));
  };
  const oIds = origins.filter((o) => shown.some((s) => s.originId === o.id)).map((o) => o.id);
  const oY = spread(oIds, oIds.map((id) => avgY(shown.filter((s) => s.originId === id).map((s) => s.id))));
  const fIds = [...feared.keys()].filter((fid) => shown.some((s) => s.fearedId === fid));
  const fY = spread(fIds, fIds.map((fid) => avgY(shown.filter((s) => s.fearedId === fid).map((s) => s.id))));

  const p: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-sans-serif,system-ui,Segoe UI,Roboto,sans-serif">`];
  p.push(`<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14" fill="${HEX.card}" stroke="${HEX.edge}"/>`);
  const edge = (xa: number, ya: number, xb: number, yb: number) => `<path d="M${xa} ${ya} C${xa + gap * 0.6} ${ya}, ${xb - gap * 0.6} ${yb}, ${xb} ${yb}" fill="none" stroke="#b7c0cd" stroke-width="1.4"/>`;
  for (const s of shown) {                               // edges first (under boxes)
    if (oY.has(s.originId)) p.push(edge(x0 + colW, oY.get(s.originId)!, x1, sY.get(s.id)!));
    if (s.fearedId && fY.has(s.fearedId)) p.push(edge(x1 + colW, sY.get(s.id)!, x2, fY.get(s.fearedId)!));
  }
  // Both lines keep their place inside a box that may have been compressed.
  const box = (x: number, ycenter: number, n: { title: string; sub: string }, tint: string) => {
    const y = ycenter - boxH / 2;
    const t1 = y + (n.sub ? boxH * 0.42 : boxH * 0.62), t2 = y + boxH * 0.78;
    return `<rect x="${x}" y="${y.toFixed(1)}" width="${colW}" height="${boxH.toFixed(1)}" rx="9" fill="${tint}" fill-opacity="0.14" stroke="${tint}" stroke-opacity="0.55"/>`
      + `<text x="${x + 12}" y="${t1.toFixed(1)}" font-size="11.5" font-weight="600" fill="${HEX.ink}">${esc(truncTxt(n.title, 44))}</text>`
      + (n.sub ? `<text x="${x + 12}" y="${t2.toFixed(1)}" font-size="10" fill="${HEX.muted}">${esc(truncTxt(n.sub, 44))}</text>` : "");
  };
  for (const o of origins) if (oY.has(o.id)) p.push(box(x0, oY.get(o.id)!, { title: recordTitle(originType, o), sub: catF ? String(o.values[catF.key] ?? "") : "" }, HEX.red));
  for (const s of shown) p.push(box(x1, sY.get(s.id)!, s, HEX.amber));
  for (const [fid, n] of feared) if (fY.has(fid)) p.push(box(x2, fY.get(fid)!, n, HEX.orange));
  // column captions
  const cap = (x: number, t: string) => `<text x="${x + colW / 2}" y="${H - 2}" text-anchor="middle" font-size="10" font-weight="600" fill="${HEX.muted}">${t}</text>`;
  p.push(cap(x0, "Risk source") + cap(x1, "Strategic scenario") + cap(x2, "Feared event"));
  if (omitted) {
    p.push(`<text x="${W / 2}" y="${H - 20}" text-anchor="middle" font-size="10.5" fill="${HEX.muted}">`
      + `${tn("report.furtherScenarios", omitted, "{0} further scenario", "{0} further scenarios")} not drawn - the full list is in the Strategic Scenarios section</text>`);
  }
  p.push("</svg>");
  return p.join("");
}

/** A human-readable, taxonomy-driven Markdown report of the whole study:
 *  overview, per-workshop entities (data, relationships resolved to names) and a
 *  deterministic chain-defence section. */
// ── Quantitative risk (Monte-Carlo) for the report ───────────────────────────
const fmtMoney = (v: number): string => {
  const a = Math.abs(v);
  if (a >= 1e9) return `€${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `€${(v / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `€${(v / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
  return `€${Math.round(v)}`;
};
const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
const fmtRate = (v: number) => `${v >= 10 ? Math.round(v) : v.toFixed(2)}/yr`;

/** Loss-exceedance curve as an inline SVG (offline): P(annual loss ≥ x), comparing
 *  inherent (without controls) vs residual (with controls). */
/** What becomes of an attack attempt, as one bar: blocked, detected in time, or through
 *  to the objective. The same three outcomes the app's chain-defence ring shows, and the
 *  same traversal produced them - a reader who sees both must not have to reconcile two
 *  accounts of the same run. */
function outcomeBarSvg(r: QuantResult): string {
  const W = 640, H = 108, PAD = 12, BX = 14, BY = 40, BW = W - 28, BH = 30;
  const through = clamp01(r.vuln);
  const caught = clamp01(r.detected);
  const blocked = clamp01(1 - through - caught);
  const parts: { label: string; v: number; c: string }[] = [
    { label: "blocked", v: blocked, c: HEX.green },
    { label: "detected in time", v: caught, c: "#3d7fd1" },
    { label: "reaches the objective", v: through, c: HEX.red },
  ];
  const p: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W + PAD * 2}" height="${H + PAD * 2}" viewBox="0 0 ${W + PAD * 2} ${H + PAD * 2}" font-family="ui-sans-serif,system-ui,Segoe UI,Roboto,sans-serif">`];
  p.push(`<rect x="0.5" y="0.5" width="${W + PAD * 2 - 1}" height="${H + PAD * 2 - 1}" rx="14" fill="${HEX.card}" stroke="${HEX.edge}"/>`);
  p.push(`<g transform="translate(${PAD} ${PAD})">`);
  p.push(`<text x="${BX}" y="26" font-size="11.5" font-weight="600" fill="${HEX.muted}">Outcome of an attack attempt</text>`);
  let x = BX;
  for (const s of parts) {
    const w = Math.max(0, s.v * BW);
    if (w > 0.5) {
      p.push(`<rect x="${x.toFixed(1)}" y="${BY}" width="${w.toFixed(1)}" height="${BH}" fill="${s.c}"/>`);
      if (w > 46) p.push(`<text x="${(x + w / 2).toFixed(1)}" y="${BY + 20}" text-anchor="middle" font-size="11.5" font-weight="700" fill="#fff">${Math.round(s.v * 100)}%</text>`);
    }
    x += w;
  }
  p.push(`<rect x="${BX}" y="${BY}" width="${BW}" height="${BH}" rx="6" fill="none" stroke="${HEX.edge}"/>`);
  let lx = BX;
  for (const s of parts) {
    p.push(`<rect x="${lx}" y="${BY + BH + 16}" width="9" height="9" rx="2" fill="${s.c}"/>`);
    p.push(`<text x="${lx + 14}" y="${BY + BH + 24.5}" font-size="10.5" fill="${HEX.ink}">${esc(s.label)} ${Math.round(s.v * 100)}%</text>`);
    lx += 22 + esc(s.label).length * 5.6;
  }
  p.push("</g></svg>");
  return p.join("");
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** How bad a year gets: the chance per year of exceeding a given loss, with and without
 *  controls. Both axes logarithmic, and the vertical one labelled as frequencies - "one
 *  year in fifty" is a sentence a reader can quote, "2 %" is one they have to translate.
 *
 *  What stood here was the same data on linear axes, which put every rare year in the last
 *  few pixels and made the two runs impossible to compare. The app draws the same chart
 *  (QuantificationView), and deliberately so: a reader who sees both must not have to
 *  reconcile two pictures of one simulation. */
function lossCurveSvg(rW: QuantResult, rWo: QuantResult, refP: number): string {
  const W = 640, H = 268, PL = 76, PR = 20, PT = 22, PB = 46, PAD = 12;
  const base = H - PB, plotH = H - PT - PB;
  const P_HI = 0.5;
  const drawn = (r: QuantResult) => r.curve.filter((d) => d.loss > 0 && d.exceedance <= P_HI && d.exceedance > 0);
  const all = [...drawn(rW), ...drawn(rWo)];
  if (!all.length) return "";
  const P_LO = Math.max(0.002, Math.min(...all.map((d) => d.exceedance), 0.05) * 0.8);
  const lo = Math.max(1, Math.min(...all.map((d) => d.loss)) / 1.7);
  const hi = Math.max(...all.map((d) => d.loss), lo * 10) * 1.35;
  const Llo = Math.log10(lo), Lspan = Math.log10(hi) - Llo || 1;
  const X = (v: number) => PL + ((Math.log10(Math.min(Math.max(v, lo), hi)) - Llo) / Lspan) * (W - PL - PR);
  const Ylo = Math.log10(P_LO), Yspan = Math.log10(P_HI) - Ylo || 1;
  const Y = (q: number) => base - ((Math.log10(Math.min(Math.max(q, P_LO), P_HI)) - Ylo) / Yspan) * plotH;
  const path = (r: QuantResult) => {
    const pts = drawn(r);
    return pts.length < 2 ? "" : pts.map((d, i) => `${i ? "L" : "M"}${X(d.loss).toFixed(1)} ${Y(d.exceedance).toFixed(1)}`).join(" ");
  };
  const bands = [[0.5, "1 in 2"], [0.2, "1 in 5"], [0.1, "1 in 10"], [0.05, "1 in 20"],
    [0.02, "1 in 50"], [0.01, "1 in 100"], [0.005, "1 in 200"], [0.002, "1 in 500"]] as [number, string][];
  const ticks: number[] = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++)
    for (const m of [1, 3]) { const t = m * Math.pow(10, e); if (t >= lo * 0.999 && t <= hi * 1.001) ticks.push(t); }

  const p: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W + PAD * 2}" height="${H + PAD * 2}" viewBox="0 0 ${W + PAD * 2} ${H + PAD * 2}" font-family="ui-sans-serif,system-ui,Segoe UI,Roboto,sans-serif">`];
  p.push(`<rect x="0.5" y="0.5" width="${W + PAD * 2 - 1}" height="${H + PAD * 2 - 1}" rx="14" fill="${HEX.card}" stroke="${HEX.edge}"/>`);
  p.push(`<g transform="translate(${PAD} ${PAD})">`);
  for (const [q, label] of bands) {
    if (q > P_HI * 1.001 || q < P_LO * 0.999) continue;
    p.push(`<line x1="${PL}" y1="${Y(q)}" x2="${W - PR}" y2="${Y(q)}" stroke="${HEX.track}" stroke-opacity="${Math.abs(q - refP) < 1e-9 ? 1 : 0.6}"/>`);
    p.push(`<text x="${PL - 9}" y="${Y(q) + 3.5}" text-anchor="end" font-size="10.5" fill="${HEX.muted}">${label}</text>`);
  }
  for (const t of ticks) p.push(`<line x1="${X(t)}" y1="${PT}" x2="${X(t)}" y2="${base}" stroke="${HEX.track}" stroke-opacity="0.5"/>`);
  p.push(`<line x1="${PL}" y1="${PT}" x2="${PL}" y2="${base}" stroke="${HEX.edge}"/>`);
  p.push(`<path d="${path(rWo)}" fill="none" stroke="${HEX.orange}" stroke-width="2" stroke-dasharray="5 3"/>`);
  p.push(`<path d="${path(rW)}" fill="none" stroke="${HEX.green}" stroke-width="2.4"/>`);
  for (const t of ticks) p.push(`<text x="${X(t)}" y="${H - 22}" text-anchor="middle" font-size="10.5" fill="${HEX.muted}">${esc(fmtMoney(t))}</text>`);
  p.push(`<text x="${W - PR}" y="${H - 6}" text-anchor="end" font-size="10.5" fill="${HEX.muted}">annual loss (log €) →</text>`);
  p.push(`<text x="${PL - 9}" y="${PT - 6}" text-anchor="end" font-size="10.5" fill="${HEX.muted}">chance per year</text>`);
  const lx = PL + 10;
  p.push(`<line x1="${lx}" y1="${PT + 6}" x2="${lx + 18}" y2="${PT + 6}" stroke="${HEX.green}" stroke-width="2.4"/><text x="${lx + 24}" y="${PT + 9.5}" font-size="10.5" fill="${HEX.ink}">with controls</text>`);
  p.push(`<line x1="${lx + 112}" y1="${PT + 6}" x2="${lx + 130}" y2="${PT + 6}" stroke="${HEX.orange}" stroke-width="2" stroke-dasharray="5 3"/><text x="${lx + 136}" y="${PT + 9.5}" font-size="10.5" fill="${HEX.ink}">without</text>`);
  p.push("</g></svg>");
  return p.join("");
}

/** The reading of that curve, in words - the same sentence the app shows, from the same
 *  numbers. Only over the POSITIVE part of the curve: it starts at loss 0 with exceedance
 *  1 and jumps to 1 − zeroShare, and interpolating across that jump invents a loss level
 *  for a chance the run never produced. */
function lossAtChance(r: QuantResult, q: number): number | null {
  if (q > 1 - r.zeroShare) return null;
  const c = r.curve.filter((d) => d.loss > 0);
  for (let i = 1; i < c.length; i++) {
    if (c[i].exceedance <= q && c[i - 1].exceedance >= q) {
      const a = c[i - 1], b = c[i];
      const t = (a.exceedance - q) / Math.max(1e-9, a.exceedance - b.exceedance);
      return a.loss + t * (b.loss - a.loss);
    }
  }
  return null;
}

const CHANCE_RANKS: { p: number; l: string }[] = [
  { p: 0.5, l: "one year in two" }, { p: 0.2, l: "one year in five" },
  { p: 0.1, l: "one year in ten" }, { p: 0.05, l: "one year in twenty" },
  { p: 0.02, l: "one year in fifty" }, { p: 0.01, l: "one year in a hundred" },
];

/** Derived Monte-Carlo quantification per operational scenario (with vs without
 *  controls), honouring any persisted per-factor overrides so the report matches
 *  the app. Deterministic (seeded), so re-running gives identical numbers. */
function quantSection(tax: Taxonomy, study: Study): string[] | null {
  const opType = tax.entityTypes.find((t) => t.fields.some((f) => f.key === "difficulty"));
  const stepType = tax.entityTypes.find((t) => t.fields.some((f) => f.type === "ref" && f.refType) && t.fields.some((f) => f.type === "number"));
  const parentF = stepType?.fields.find((f) => f.type === "ref" && f.refType);
  if (!opType || !stepType || !parentF) return null;
  // Quantification is OPT-IN, one scenario at a time - the app derives a monetary figure
  // only for the ones the analyst picked. The report used to ignore that and quantify
  // every scenario that had a chain, so a study with the quantification switched off
  // still went out carrying annual-loss figures nobody had asked for. A study from before
  // the opt-in existed carries no list, which the app reads as "none"; the report now
  // reads it the same way, because two answers to "is this quantified" is one too many.
  const chosen = new Set(study.quantScenarios ?? []);
  const ops = study.entities.filter((e) => e.type === opType.key && chosen.has(e.id)
    && !isSetBack(tax, e)
    && study.entities.some((s) => s.type === stepType.key && s.values[parentF.key] === e.id));
  if (!ops.length) return null;

  const L: string[] = ["---\n", "## Quantitative risk\n",
    "_Monte-Carlo simulation (loss event frequency × loss magnitude), derived from the qualitative model. Annual loss shown with vs. without the current controls._\n"];
  const row = (k: string, a: string, b: string) => `<tr><td>${esc(k)}</td><td class="num">${a}</td><td class="num">${b}</td></tr>`;
  for (const op of ops) {
    const ov = study.quant?.[op.id]?.overrides as Partial<QuantInputs> | undefined;
    const dW = deriveInputs(study, tax, op, true), dWo = deriveInputs(study, tax, op, false);
    const inW: QuantInputs = { ...dW.inputs, ...ov }, inWo: QuantInputs = { ...dWo.inputs, ...ov };
    const rW = simulate(inW, 40000, dW.chain), rWo = simulate(inWo, 40000, dWo.chain);
    const lm = meanOf(inW.directImpact) + meanOf(inW.cascadingLikelihood) * meanOf(inW.cascadingImpact);
    const benefit = rWo.ale.mean - rW.ale.mean;
    const benefitPct = rWo.ale.mean > 0 ? Math.round((benefit / rWo.ale.mean) * 100) : 0;
    L.push(`### ${recordTitle(opType, op)}`);
    L.push(`<table class="qt-tbl"><thead><tr><th>Metric</th><th class="num">Inherent<br>(no controls)</th><th class="num">Residual<br>(with controls)</th></tr></thead><tbody>`
      + row("Expected annual loss (ALE)", fmtMoney(rWo.ale.mean), `<strong>${esc(fmtMoney(rW.ale.mean))}</strong>`)
      + row("P90 / P99 (bad years)", `${esc(fmtMoney(rWo.ale.p90))} / ${esc(fmtMoney(rWo.ale.p99))}`, `${esc(fmtMoney(rW.ale.p90))} / ${esc(fmtMoney(rW.ale.p99))}`)
      + row("Loss event frequency", esc(fmtRate(rWo.lef)), esc(fmtRate(rW.lef)))
      + row("Vulnerability P(adversary > control)", fmtPct(rWo.vuln), fmtPct(rW.vuln))
      + row("Loss magnitude / event", esc(fmtMoney(lm)), esc(fmtMoney(lm)))
      + `</tbody></table>`);
    L.push(`Controls cut the mean annual loss by **${fmtMoney(benefit)}** (-${benefitPct}%).`);
    L.push("");
    // What became of the attempts, not how much of the chain is "covered". A measure
    // stops an attacker at the step it acts on, or catches him on the way, or does
    // neither and reduces the loss instead - an averaged coverage figure cannot say which,
    // and the traversal that produced these numbers can.
    L.push(`<div align="center">${outcomeBarSvg(rW)}</div>`);
    L.push("");
    const stopped = Math.round((1 - rW.vuln) * 100);
    const atStart = Math.round(rW.blockedAtBaseline * 100);
    L.push(`**${stopped}% of attempts are stopped**, ${atStart}% of them by what the attack itself demands, before any specific measure. `
      + `${Math.round(rW.detected * 100)}% are caught in the act and answered before the objective is reached - a different capability from "they could not get in", and counted separately for that reason.`);
    // Where on the chain the attempts died. This is the part an averaged figure hides:
    // one step carrying every stop is a choke point, and an even spread is defence in depth.
    const deaths = rW.breaks.filter((b) => b.p >= 0.005).sort((a, b) => b.p - a.p).slice(0, 6);
    if (deaths.length) {
      const nameOf = (id: string) => {
        const st = study.entities.find((e) => e.id === id);
        const t = st && getType(tax, st.type);
        return st && t ? recordTitle(t, st) : id.slice(0, 8);
      };
      L.push("");
      L.push("<table class=\"qt-tbl\"><thead><tr><th>Attempts stop at</th><th class=\"num\">Share of all attempts</th></tr></thead><tbody>"
        + deaths.map((b) => `<tr><td>${esc(nameOf(b.id))}</td><td class="num">${fmtPct(b.p)}</td></tr>`).join("")
        + "</tbody></table>");
    }
    L.push("");
    // The same reading the app gives, from the same run: which ordinary year actually
    // costs anything, and what it costs with and without the controls in place.
    const ref = CHANCE_RANKS.find((b) => b.p <= 1 - rW.zeroShare) ?? CHANCE_RANKS[CHANCE_RANKS.length - 1];
    const badW = lossAtChance(rW, ref.p), badWo = lossAtChance(rWo, ref.p);
    const quiet = Math.round(rW.zeroShare * 100);
    L.push(`<div align="center">${lossCurveSvg(rW, rWo, ref.p)}</div>`);
    L.push("");
    L.push((quiet > 0 ? `**${quiet} years in 100 cost nothing at all.** ` : "")
      + (badW != null
        ? `The worst of the rest — **${ref.l}** — costs more than **${fmtMoney(badW)}**`
          + (badWo != null ? `, against **${fmtMoney(badWo)}** with no controls` : "") + "."
        : "Even the rarest year modelled here costs nothing; the percentiles above give the figures."));
    L.push("");
  }
  return L;
}

/** Risk-treatment plan + residual risk matrix (inherent -> residual after the
 *  applied measures). Null when no treatments exist. */
function treatmentSection(tax: Taxonomy, study: Study): string[] | null {
  const treatType = tax.entityTypes.find((t) => t.fields.some((f) => f.type === "ref" && f.refType)
    && t.fields.some((f) => f.key === "decision") && t.fields.some((f) => f.key === "status"));
  const refF = treatType?.fields.find((f) => f.type === "ref" && f.refType);
  const riskType = refF?.refType ? getType(tax, refF.refType) : undefined;
  if (!treatType || !refF || !riskType) return null;
  const treatments = study.entities.filter((e) => e.type === treatType.key && !isSetBack(tax, e));
  if (!treatments.length) return null;
  const byId = new Map(study.entities.map((e) => [e.id, e]));
  const scales = riskType.fields.filter((f) => f.type === "scale");
  const xF = scales[0], yF = scales[1];
  if (!xF || !yF) return null;
  const decF = treatType.fields.find((f) => f.key === "decision"), ownF = treatType.fields.find((f) => f.key === "owner");
  const ddF = treatType.fields.find((f) => f.key === "deadline"), stF = treatType.fields.find((f) => f.key === "status");
  const cell = (v: FieldValue | undefined) => esc(v == null || v === "" ? "—" : String(v));

  const L: string[] = ["---\n", "## Risk treatment\n",
    "_Treatment decision per risk (strategic scenario). The residual position is DERIVED, never typed in: "
    + "it comes from the same chain traversal as the risk figures, split across both axes. "
    + "**Reduce** moves the risk down and left by what the measures achieve on each side - "
    + "less often, or less costly when it happens - so a treatment that only buys recovery "
    + "moves it down rather than left. **Share** moves gravity, and by at least one level, "
    + "because that is what buying the transfer is for. **Accept** keeps the inherent level. "
    + "**Avoid** removes the exposure._\n"];
  // Words, not figures - so this one is set like any other table rather than as a column
  // of numbers: an owner and a target date belong at the left margin of their column.
  let tbl = `<table><thead><tr><th>Risk</th><th>Decision</th><th>Owner</th><th>Deadline</th><th>Status</th><th>Inherent → Residual (L·G)</th></tr></thead><tbody>`;
  for (const t of treatments) {
    const risk = byId.get(t.values[refF.key] as string);
    let shift = "—";
    if (risk) {
      const res = residualPos(study, tax, risk, t, xF.key, yF.key);
      const inh = `${scaleLabel(xF, Number(risk.values[xF.key]) || 1)}·${scaleLabel(yF, Number(risk.values[yF.key]) || 1)}`;
      shift = `${esc(inh)} → <strong>${esc(scaleLabel(xF, res.x))}·${esc(scaleLabel(yF, res.y))}</strong>`;
    }
    tbl += `<tr><td>${risk ? esc(recordTitle(riskType, risk)) : "—"}</td><td>${cell(decF && t.values[decF.key])}</td><td>${cell(ownF && t.values[ownF.key])}</td><td>${cell(ddF && t.values[ddF.key])}</td><td>${cell(stF && t.values[stF.key])}</td><td>${shift}</td></tr>`;
  }
  L.push(tbl + "</tbody></table>", "");

  const treatOf = new Map<string, EntityRecord>();
  for (const t of treatments) { const sid = t.values[refF.key]; if (typeof sid === "string") treatOf.set(sid, t); }
  const posFn = (e: EntityRecord) => {
    const t = treatOf.get(e.id);
    return t ? residualPos(study, tax, e, t, xF.key, yF.key) : { x: Number(e.values[xF.key]) || 1, y: Number(e.values[yF.key]) || 1 };
  };
  const svg = riskMatrixSvg(tax, study, { posFn });
  if (svg) { L.push("**Residual risk matrix** (position after treatment)  ", `<div align="center">${svg}</div>`, ""); }
  return L;
}

export function reportMarkdown(tax: Taxonomy, study: Study): string {
  const L: string[] = [];
  L.push(`# ${study.name} - ${PRODUCT.documentTitle ?? "Risk Analysis Report"}`);
  const meta: string[] = [];
  if (study.organization) meta.push(`**Organization:** ${study.organization}`);
  if (study.scope) meta.push(`**Scope:** ${study.scope}`);
  meta.push(`**Generated:** ${new Date().toISOString().slice(0, 10)}`);
  L.push(meta.join("  \n"));
  L.push("");

  L.push("---\n");

  // Document control. A concept handed to an auditor has to state what it was made from
  // and what has happened to it since — the vocabulary it works to, and the change record
  // with its integrity. Both are already held; not printing them was the omission.
  L.push("## Document control\n");
  const dc: string[] = [];
  dc.push(`| | |`, `|---|---|`);
  dc.push(`| Document | ${PRODUCT.documentTitle ?? "Risk Analysis Report"} |`);
  if (study.organization) dc.push(`| Institution | ${study.organization} |`);
  if (study.sector) dc.push(`| Sector | ${study.sector} |`);
  dc.push(`| Generated | ${new Date().toISOString().slice(0, 10)} |`);
  if (tax.vocabularySource) {
    dc.push(`| Vocabulary | ${tax.vocabularySource.name}${tax.vocabularySource.version ? `, version ${tax.vocabularySource.version}` : ""} |`);
  }
  const log = study.log ?? [];
  if (log.length) {
    const editors = [...new Set(log.map((e) => e.editor).filter(Boolean))];
    const last = log[log.length - 1];
    dc.push(`| Change record | ${log.length} entries, ${tn("report.editors", editors.length, "{0} editor", "{0} editors")}, last ${String(last?.ts ?? "").slice(0, 10)} |`);
  }
  L.push(dc.join("\n"));
  L.push("");

  if (log.length) {
    const updates = log.filter((e) => e.kind === "update" && e.comment).slice(-12);
    if (updates.length) {
      L.push("### Changes of record\n");
      L.push("| Date | Editor | Record | Reason |");
      L.push("|---|---|---|---|");
      for (const e of updates) {
        L.push(`| ${String(e.ts).slice(0, 10)} | ${e.editor} | ${(e.title ?? "").replace(/\|/g, "/")} | ${(e.comment ?? "").replace(/\|/g, "/")} |`);
      }
      L.push("");
    }
  }

  L.push("## Overview\n");
  for (const t of tax.entityTypes) {
    const n = study.entities.filter((e) => e.type === t.key).length;
    if (n) L.push(`- **${typeLabelPlural(t)}:** ${n}`);
  }
  L.push("");

  const svg = riskMatrixSvg(tax, study);
  if (svg) {
    L.push("## Risk matrix\n");
    L.push(`<div align="center">${svg}</div>`);
    L.push("");
  }

  const flow = attackFlowSvg(tax, study);
  if (flow) {
    L.push("## Attack paths (origin -> action -> result)\n");
    L.push(`<div align="center">${flow}</div>`);
    L.push("");
  }

  // Threat landscape (radar comparing actors) + per-actor rating bar charts.
  const attackerType = tax.entityTypes.find((t) => t.fields.some((f) => f.type === "scale" && f.key === "capability"));
  if (attackerType) {
    const actors = study.entities.filter((e) => e.type === attackerType.key && !isSetBack(tax, e));
    if (actors.length) {
      L.push("## Threat landscape & attacker profiles\n");
      const radar = threatRadarSvg(tax, study);
      if (radar) { L.push(`<div align="center">${radar}</div>`); L.push(""); }
      for (const a of actors) {
        const bars = scaleBarsSvg(attackerType, a);
        L.push(`**${recordTitle(attackerType, a)}**  `);
        if (bars) L.push(`<div align="center">${bars}</div>`);
        L.push("");
      }
    }
  }

  const assets = assetHeatmapSection(tax, study);
  if (assets) {
    L.push("## Assets\n");
    L.push(assets);
    L.push("");
  }

  // Kill-chain steps are nested under their operational scenario (not listed as one
  // flat block). Detect the step type (a ref to a parent + an order number) and
  // render each op scenario's ordered steps as an inline, styled sequence.
  const kcStepType = tax.entityTypes.find((t) => t.fields.some((f) => f.type === "ref" && f.refType) && t.fields.some((f) => f.type === "number"));
  const kcParentF = kcStepType?.fields.find((f) => f.type === "ref" && f.refType);
  const kcOrderF = kcStepType?.fields.find((f) => f.type === "number");
  const kcTacticF = kcStepType?.fields.find((f) => f.type === "enum");
  const kcTechF = kcStepType?.fields.find((f) => f.type === "text" && f.key !== (kcStepType?.titleField ?? "name"));
  const kcOpKey = kcParentF?.refType;
  const kcStepsHtml = (op: EntityRecord): string => {
    if (!kcStepType || !kcParentF || !kcOrderF) return "";
    const steps = study.entities.filter((s) => s.type === kcStepType.key && s.values[kcParentF.key] === op.id && !isSetBack(tax, s))
      .sort((a, b) => Number(a.values[kcOrderF.key] || 0) - Number(b.values[kcOrderF.key] || 0));
    if (!steps.length) return "";
    const rows = steps.map((s, i) => {
      const tac = kcTacticF ? String(s.values[kcTacticF.key] ?? "") : "";
      const tech = kcTechF ? String(s.values[kcTechF.key] ?? "") : "";
      return `<li><span class="kc-n">${i + 1}</span><span class="kc-body"><span class="kc-name">${esc(recordTitle(kcStepType, s))}</span>${tac ? `<span class="kc-tac">${esc(tac)}</span>` : ""}</span>${tech ? `<span class="kc-tech">${esc(tech)}</span>` : ""}</li>`;
    }).join("");
    return `<div class="kc-wrap"><div class="kc-h">Kill chain · ${tn("report.steps", steps.length, "{0} step", "{0} steps")}</div><ol class="kc">${rows}</ol></div>`;
  };

  // Where the chain-defence block belongs: with the scenarios whose chains it is about.
  // It needs the measures and so is computed further down; a marker holds its place.
  const CHAIN_MARK = "@@chain-defence@@";
  const chainGroup = kcParentF?.refType ? getType(tax, kcParentF.refType)?.group : undefined;

  for (const g of tax.groups) {
    const types = tax.entityTypes.filter((t) => t.group === g.key);
    if (!types.some((t) => study.entities.some((e) => e.type === t.key))) continue;
    L.push("---\n");
    L.push(`## ${groupLabel(g)}`);
    if (groupDescription(g)) L.push(`_${groupDescription(g)}._\n`);
    for (const t of types) {
      if (kcStepType && t.key === kcStepType.key) continue;   // nested under its op scenario instead
      const items = study.entities.filter((e) => e.type === t.key);
      if (!items.length) continue;
      const titleKey = t.titleField ?? "name";
      const descF = t.fields.find((f) => f.type === "textarea");
      L.push(`### ${typeLabelPlural(t)} (${items.length})\n`);
      // Past a dozen, a register is read across its rows rather than one card at a time.
      // A catalogue-backed type reaches the hundreds, and a headed block each turns a
      // document about this organisation into a reprint of the framework it works to.
      // The operational scenarios keep their cards whatever their number: each carries its
      // kill chain underneath, and a chain does not go in a cell.
      if (items.length > CARD_LIMIT && t.key !== kcOpKey) {
        const cols = columnFields(t).filter((f) => f.key !== titleKey).slice(0, TABLE_COLS);
        L.push(`| ${typeLabel(t)} | ${cols.map((f) => fieldLabel(f)).join(" | ")} |`);
        L.push(`|${" --- |".repeat(cols.length + 1)}`);
        for (const e of items) {
          const cells = cols.map((f) => cellText(valueMd(f, e.values[f.key] ?? null, tax, study)));
          L.push(`| ${cellText(recordTitle(t, e))} | ${cells.join(" | ")} |`);
        }
        L.push("");
        continue;
      }
      for (const e of items) {
        L.push(`#### ${recordTitle(t, e)}`);
        if (e.source) L.push(`_Source: ${esc(e.source)}_`);
        if (descF && e.values[descF.key]) L.push(String(e.values[descF.key]));
        const attrs: string[] = [];
        for (const f of t.fields) {
          if (f.key === titleKey || f.key === descF?.key) continue;
          const raw = e.values[f.key];
          const val = valueMd(f, raw ?? null, tax, study);
          if (val === "—") continue;
          if (f.type === "scale" && typeof raw === "number") {
            // Encode the level so the HTML report can draw a mini level bar: (n/m)
            // for "higher = worse" scales, [n/m] for "higher = better" (positive).
            const br = f.polarity === "positive" ? `[${raw}/${scaleMax(f)}]` : `(${raw}/${scaleMax(f)})`;
            attrs.push(`**${fieldLabel(f)}:** ${val} ${br}`);
          } else attrs.push(`**${fieldLabel(f)}:** ${val}`);
        }
        if (attrs.length) L.push(attrs.map((a) => `- ${a}`).join("\n"));
        if (kcStepType && t.key === kcOpKey) { const kc = kcStepsHtml(e); if (kc) L.push(kc); }
        L.push("");
      }
    }
    if (g.key === chainGroup) L.push(CHAIN_MARK);
  }

  // Deterministic chain defence: each step against what actually stops or catches an
  // attacker there, as opposed to what merely names it. Built here, printed with the
  // operational scenarios.
  const chainDefence: string[] = [];
  const stepType = tax.entityTypes.find((t) => t.fields.some((f) => f.type === "ref" && f.refType) && t.fields.some((f) => f.type === "number"));
  const parentF = stepType?.fields.find((f) => f.type === "ref" && f.refType);
  const orderF = stepType?.fields.find((f) => f.type === "number");
  const measureType = tax.entityTypes.find((t) => t.key !== stepType?.key && t.fields.some((f) => f.type === "multiref" && f.refType === stepType?.key));
  const coversF = measureType?.fields.find((f) => f.type === "multiref" && f.refType === stepType?.key);
  const opType = parentF?.refType ? getType(tax, parentF.refType) : undefined;
  if (stepType && parentF && orderF && measureType && coversF && opType) {
    // A measure that is present but not in use defends nothing - the coverage matrix,
    // the radar and the quantification all read it that way, and a report that counted it
    // would answer the same question differently.
    const measures = study.entities.filter((e) => e.type === measureType.key && !isSetBack(tax, e));
    const byId = new Map(study.entities.map((e) => [e.id, e]));
    const get = (id: FieldValue | undefined) => (typeof id === "string" ? byId.get(id) : undefined);
    const tacticF = stepType.fields.find((f) => f.type === "enum");
    const techF = stepType.fields.find((f) => f.type === "text" && f.key !== (stepType.titleField ?? "name"));
    const targetF = stepType.fields.find((f) => f.type === "ref" && f.refType && f.key !== parentF.key);
    const opToStrat = opType.fields.find((f) => f.type === "ref" && f.refType);
    // attacker = op → strategic scenario → risk source (following the first ref of each).
    const attackerOf = (op: EntityRecord): string => {
      const strat = opToStrat ? get(op.values[opToStrat.key]) : undefined;
      const stratRef = strat ? getType(tax, strat.type)?.fields.find((f) => f.type === "ref" && f.refType) : undefined;
      const actor = strat && stratRef ? get(strat.values[stratRef.key]) : undefined;
      const at = actor ? getType(tax, actor.type) : undefined;
      return actor && at ? recordTitle(at, actor) : "Threat actor";
    };
    const targetName = (s: EntityRecord) => {
      const tr = targetF ? get(s.values[targetF.key]) : undefined;
      const tt = tr ? getType(tax, tr.type) : undefined;
      return tr && tt ? recordTitle(tt, tr) : "Targeted system";
    };
    // Inline SVG (offline, no mermaid/CDN): the kill chain as a SWIMLANE sequence
    // diagram - an attacker lane plus one lane per targeted system, an arrow per
    // step (attacker -> target) coloured green (mitigated) or red (gap).
    const killChainSvg = (op: EntityRecord, steps: EntityRecord[], covering: (id: string) => EntityRecord[]): string => {
      const targets: string[] = [];
      for (const s of steps) { const n = truncTxt(targetName(s), 22); if (!targets.includes(n)) targets.push(n); }
      const lanes = [truncTxt(attackerOf(op), 22), ...targets];
      const PAD = 16, laneW = 150, laneGap = Math.max(176, laneW + 22), hbH = 28, headH = 40, rowH = 54;
      const laneX = (i: number) => PAD + laneW / 2 + i * laneGap;
      const W = PAD * 2 + laneW + (lanes.length - 1) * laneGap;
      const H = PAD + headH + steps.length * rowH + PAD;
      const p: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-sans-serif,system-ui,Segoe UI,Roboto,sans-serif">`];
      p.push(`<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14" fill="${HEX.card}" stroke="${HEX.edge}"/>`);
      lanes.forEach((nm, i) => {                             // lifelines + participant headers
        const cx = laneX(i), tint = i === 0 ? HEX.red : "#3b6ea5";
        p.push(`<line x1="${cx}" y1="${PAD + hbH}" x2="${cx}" y2="${H - PAD}" stroke="#cfd6e0" stroke-dasharray="3 3"/>`);
        p.push(`<rect x="${cx - laneW / 2}" y="${PAD}" width="${laneW}" height="${hbH}" rx="7" fill="${tint}" fill-opacity="0.12" stroke="${tint}" stroke-opacity="0.5"/>`);
        p.push(`<text x="${cx}" y="${PAD + 18}" text-anchor="middle" font-size="11" font-weight="600" fill="${HEX.ink}">${esc(nm)}${i === 0 ? "" : ""}</text>`);
      });
      steps.forEach((s, i) => {
        const cov = covering(s.id), ok = cov.length > 0, c = ok ? HEX.green : HEX.red;
        const ti = 1 + targets.indexOf(truncTxt(targetName(s), 22));
        const y = PAD + headH + i * rowH + rowH / 2;
        const x0 = laneX(0), x1 = laneX(ti), span = x1 - x0;
        const maxc = Math.max(12, Math.floor(span / 6.0));
        const tactic = tacticF ? String(s.values[tacticF.key] ?? "") : "";
        const tech = techF ? String(s.values[techF.key] ?? "") : "";
        const label = (tactic ? tactic + " · " : "") + recordTitle(stepType, s) + (tech ? ` [${tech}]` : "");
        p.push(`<line x1="${x0}" y1="${y}" x2="${x1 - 7}" y2="${y}" stroke="${c}" stroke-width="1.8"/><path d="M${x1 - 7} ${y - 4} L${x1} ${y} L${x1 - 7} ${y + 4}" fill="${c}"/>`);
        p.push(`<circle cx="${x0}" cy="${y}" r="9" fill="${c}" fill-opacity="0.2" stroke="${c}"/><text x="${x0}" y="${y + 3.5}" text-anchor="middle" font-size="10" font-weight="700" fill="${c}">${i + 1}</text>`);
        p.push(`<text x="${x0 + 13}" y="${y - 6}" font-size="10.5" font-weight="600" fill="${HEX.ink}">${esc(truncTxt(label, maxc))}</text>`);
        p.push(`<text x="${x0 + 13}" y="${y + 13}" font-size="9.5" fill="${c}">${ok ? "shielded by " + esc(truncTxt(cov.map((m) => recordTitle(measureType, m)).join(", "), maxc - 6)) : "no mitigation (gap)"}</text>`);
      });
      p.push("</svg>");
      return p.join("");
    };
    const ops = study.entities.filter((e) => e.type === opType.key && !isSetBack(tax, e)
      && study.entities.some((s) => s.type === stepType.key && s.values[parentF.key] === e.id));
    if (ops.length) {
      // Written into its own list and emitted with the operational scenarios below, not
      // here: a reader who has just read a kill chain wants to know what defends it, and
      // sending them to a later section to find out breaks the argument in half.
      const L = chainDefence;
      L.push("## Chain defence\n");
      L.push("_A step is **defended** only where something stops or catches the attacker there. "
        + "Corrective, deterrent and avoidance measures on a step are real work and move the risk "
        + "figures - they reduce the loss, or the number of attempts - but they do not stop him "
        + "reaching it, so they do not make the step look handled._\n");
      for (const op of ops) {
        const steps = study.entities.filter((e) => e.type === stepType.key && e.values[parentF.key] === op.id && !isSetBack(tax, e))
          .sort((a, b) => Number(a.values[orderF.key] || 0) - Number(b.values[orderF.key] || 0));
        const covering = (sid: string) => measures.filter((m) => Array.isArray(m.values[coversF.key]) && (m.values[coversF.key] as string[]).includes(sid));
        // Defended, not merely covered: the same rule the app's chain view applies.
        const defends = (m: EntityRecord) => { const c = effectClassOf(m); return c === "Preventive" || c === "Detective"; };
        const defended = steps.filter((s) => covering(s.id).some(defends)).length;
        L.push(`### ${recordTitle(opType, op)} - ${defended}/${steps.length} steps defended`);
        L.push(`<div align="center">${killChainSvg(op, steps, covering)}</div>`);
        for (const s of steps) {
          const cov = covering(s.id);
          // Each measure with the class it acts through, so "covered" cannot be mistaken
          // for "stopped here".
          const shown = cov.map((m) => `${recordTitle(measureType, m)} _(${effectClassOf(m).toLowerCase()})_`).join(", ");
          const verdict = !cov.length ? "**GAP - no measure**"
            : cov.some(defends) ? shown
            : `${shown} - **nothing prevents or detects here**`;
          L.push(`- ${recordTitle(stepType, s)} -> ${verdict}`);
        }
        L.push("");
      }
    }
  }

  // The chain-defence block goes where the marker was left, next to the scenarios it is
  // about; with no marker (a taxonomy that models no chain) it simply never appears.
  const markAt = L.indexOf(CHAIN_MARK);
  if (markAt >= 0) L.splice(markAt, 1, ...(chainDefence.length ? ["---\n", ...chainDefence] : []));

  // Risk treatment - plan table + residual risk matrix.
  const treat = treatmentSection(tax, study);
  if (treat) L.push(...treat);

  // Compliance coverage - framework-coverage radar.
  const fwRadar = frameworkRadarSvg(tax, study);
  if (fwRadar) {
    L.push("---\n");
    L.push("## Compliance coverage\n");
    L.push(`<div align="center">${fwRadar}</div>`);
    L.push("");
  }

  // Quantitative risk - derived Monte-Carlo (annual loss, inherent vs residual).
  const quant = quantSection(tax, study);
  if (quant) L.push(...quant);

  L.push("---\n");
  L.push("_Generated with Aurelian Lite - structured cyber & information security analysis (offline)._  ");
  L.push("[github.com/aurelian-risk/aurelian-lite](https://github.com/aurelian-risk/aurelian-lite)");
  return L.join("\n").trim() + "\n";
}

// ── Print-ready HTML report ──────────────────────────────────────────────
// Many users have no Markdown viewer, so we also render the report to a fully
// self-contained, OFFLINE HTML document - every chart is an inline SVG, no external
// scripts or CDN - that opens in a new tab and prints cleanly.

/** Minimal Markdown→HTML for OUR generated report subset (headings, bold/italic,
 *  links, lists, ``` fences incl. mermaid, `<div>`/SVG passthrough, hr, breaks). */
function mdToHtml(md: string): string {
  const inline = (s: string) => esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/_([^_\n]+)_/g, "<em>$1</em>");
  // Inside an entity card, an attribute list item ("**Label:** value") is rendered
  // as a field chip: an uppercase caption plus an elevated value. A trailing (n/m)
  // or [n/m] level marker becomes a small severity bar (see reportMarkdown).
  const fieldLi = (content: string): string => {
    const fm = content.match(/^\*\*(.+?):\*\*\s*(.*)$/);
    if (!fm) return `<li>${inline(content)}</li>`;
    const label = fm[1]; let value = fm[2], bar = "";
    const lm = value.match(/^(.*?)\s*([([])(\d+)\/(\d+)[)\]]\s*$/);
    if (lm) {
      value = lm[1];
      const n = +lm[3], max = +lm[4], positive = lm[2] === "[";
      const bad = positive ? 1 - (max ? n / max : 0) : (max ? n / max : 0);   // 0 = good … 1 = bad
      const sev = bad >= 0.75 ? "sev-hi" : bad >= 0.5 ? "sev-md" : bad >= 0.28 ? "sev-lo" : "sev-ok";
      const segs = Array.from({ length: max }, (_, k) => `<i${k < n ? ' class="on"' : ""}></i>`).join("");
      bar = `<span class="lvl ${sev}">${segs}</span>`;
    }
    return `<li class="fld"><span class="ek">${inline(label)}</span><span class="ev">${inline(value)}${bar}</span></li>`;
  };
  const lines = md.split("\n");
  const out: string[] = [];
  const listStack: number[] = [];
  const closeLists = (to = -1) => { while (listStack.length && listStack[listStack.length - 1] > to) { out.push("</ul>"); listStack.pop(); } };
  let inEnt = false; // an entity "card" (opened by an h4, closed by the next heading/hr)
  const closeEnt = () => { if (inEnt) { out.push("</div>"); inEnt = false; } };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i], trimmed = line.trim();
    const fence = line.match(/^```(\w*)/);
    if (fence) {
      closeLists();
      const lang = fence[1], buf: string[] = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) buf.push(lines[i]);
      i++;
      out.push(lang === "mermaid" ? `<pre class="mermaid">${esc(buf.join("\n"))}</pre>` : `<pre><code>${esc(buf.join("\n"))}</code></pre>`);
      continue;
    }
    if (trimmed === "") { closeLists(); i++; continue; }
    if (trimmed === "---") { closeLists(); closeEnt(); out.push("<hr>"); i++; continue; }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      closeLists();
      const lvl = h[1].length;
      closeEnt();
      if (lvl === 4) { out.push('<div class="ent">'); inEnt = true; out.push(`<h4>${inline(h[2])}</h4>`); }
      else out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`);
      i++; continue;
    }
    if (trimmed.startsWith("<")) { closeLists(); out.push(trimmed); i++; continue; } // raw HTML / SVG
    // A pipe table. Without this the whole table falls through to the paragraph branch and
    // arrives as a wall of vertical bars - which is what the document-control and
    // change-record sections looked like, at the very top of every report.
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      closeLists();
      const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(lines[i]);
      i += 2;
      const body: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { body.push(cells(lines[i])); i++; }
      // A short cell with no space in it is an identifier, a date or a level - one thing,
      // not a phrase. Left to wrap it breaks at its own hyphens ("2026-" over "08-20"),
      // and because that break counts towards the column's minimum width, the column is
      // then sized for the fragment rather than for the value.
      const one = (c: string) => (/^\S{1,14}$/.test(c) ? ' class="nw"' : "");
      const th = head.map((c) => `<th${one(c)}>${inline(c)}</th>`).join("");
      const tr = body.map((r) => `<tr>${r.map((c) => `<td${one(c)}>${inline(c)}</td>`).join("")}</tr>`).join("");
      // A leading row of empty headers is a two-column key/value table written without a
      // header - render it without an empty strip on top.
      //
      // No class here beyond how long the table is. Every markdown table used to be given
      // the quantification table's class, which right-aligns everything but the first
      // column: correct for figures, and the reason a column of prose - the reason a record
      // was changed - was set flush right against the far edge of the page. The tables the
      // code writes itself keep that class; a table written as markdown is prose.
      const cls = body.length > DENSE_ROWS ? ' class="dense"' : "";
      out.push(`<table${cls}>${head.some((c) => c !== "") ? `<thead><tr>${th}</tr></thead>` : ""}<tbody>${tr}</tbody></table>`);
      continue;
    }
    const li = line.match(/^(\s*)-\s+(.*)$/);
    if (li) {
      const indent = li[1].length;
      if (!listStack.length || indent > listStack[listStack.length - 1]) { out.push("<ul>"); listStack.push(indent); }
      else closeLists(indent);
      out.push(inEnt ? fieldLi(li[2]) : `<li>${inline(li[2])}</li>`);
      i++; continue;
    }
    closeLists();
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^```/.test(lines[i]) && !/^#{1,4}\s/.test(lines[i]) && lines[i].trim() !== "---" && !/^\s*-\s+/.test(lines[i]) && !lines[i].trim().startsWith("<")) {
      para.push(inline(lines[i].replace(/\s+$/, "")) + (/\s{2,}$/.test(lines[i]) ? "<br>" : ""));
      i++;
    }
    out.push(`<p>${para.join(" ")}</p>`);
  }
  closeLists();
  closeEnt();
  return out.join("\n");
}

const REPORT_CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; background: #eef0f4; color: #1c2430;
  font-family: "Segoe UI Variable","Segoe UI",system-ui,-apple-system,Roboto,sans-serif; line-height: 1.55; }
.report { max-width: 900px; margin: 24px auto; background: #fff; padding: 40px 48px;
  box-shadow: 0 8px 30px -12px rgba(20,30,50,0.25); border-radius: 8px; }
/* A table written as markdown is prose in a grid: read left to right, with the header row
   carrying the weight. The columns are sized by their content rather than given an equal
   share - a column of dates is not as wide as a column of sentences - and never past the
   sheet, since an automatic layout distributes within the width it is given. */
.report table { border-collapse: collapse; width: 100%; max-width: 100%; margin: 12px 0 18px;
  font-size: 13px; table-layout: auto; }
/* break-word, not anywhere: the value "anywhere" is taken into a column's minimum width,
   so an automatic layout believes a date column can be one character wide and sets "2026-"
   over "08-20". This one breaks a word only where it genuinely does not fit. */
.report th, .report td { overflow-wrap: break-word; word-break: normal; }
.report th { text-align: left; padding: 7px 10px; border: 1px solid #c3ccd8; background: #f4f6f9;
  font-weight: 700; font-size: 12px; }
.report td { padding: 7px 10px; border: 1px solid #d8dee7; vertical-align: top; }
.report th.nw, .report td.nw { white-space: nowrap; }
.report tbody tr:nth-child(even) td { background: #fafbfd; }
/* A register of dozens of rows is not read the way a six-row summary is. Set dense it
   fits a page: the columns take the width their content needs instead of an equal share,
   so a reference stops occupying a seventh of the table and a title stops wrapping to
   four lines. The caps are what keep one long cell from taking the page. */
.report table.dense { font-size: 10.5px; table-layout: auto; margin: 8px 0 14px; }
.report table.dense th { padding: 3px 7px; font-size: 10px; letter-spacing: 0.02em;
  text-transform: uppercase; color: #55606f; }
.report table.dense td { padding: 2.5px 7px; line-height: 1.35; }
.report table.dense td:first-child { max-width: 26em; }
.report table.dense td:not(:first-child) { max-width: 14em; }
/* 900px is a measure for prose, and it leaves a six-column register wrapping every cell.
   So the SHEET grows to its widest table while the prose keeps its measure on it, rather
   than the table hanging over the edges of the page it is meant to be printed on. */
.report:has(table.dense) { max-width: 1400px; }
.report:has(table.dense) > *:not(table.dense) { max-width: 820px; }
.report h1 { font-size: 26px; margin: 0 0 6px; letter-spacing: -0.01em; }
.report h2 { font-size: 19px; margin: 30px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #eceef2; }
.report h3 { font-size: 15.5px; margin: 22px 0 10px; color: #364152; }
.report p { margin: 8px 0; }
/* Entity cards - the per-workshop detail, made scannable */
.report .ent { border: 1px solid #e6e9ef; border-left: 3px solid #b9c2cf; border-radius: 9px;
  background: linear-gradient(180deg,#fff, #fafbfd); padding: 13px 16px; margin: 10px 0;
  box-shadow: 0 1px 3px rgba(20,30,50,0.05); break-inside: avoid; }
.report .ent h4 { margin: 0; font-size: 14.5px; font-weight: 650; color: #1c2430; letter-spacing: -0.005em; }
.report .ent > p { margin: 5px 0 0; color: #55606f; font-size: 12.5px; }
.report .ent > em { display: inline-block; margin-top: 5px; font-size: 11px; color: #8a93a0; }
/* attribute grid: each item is an elevated "field chip" (caption + value) */
.report .ent ul { list-style: none; margin: 11px 0 0; padding: 0;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 7px; }
.report .ent li { margin: 0; }
.report .ent li.fld { display: flex; flex-direction: column; gap: 2px;
  background: #fff; border: 1px solid #e7eaf0; border-radius: 7px; padding: 6px 10px;
  box-shadow: 0 1px 2px rgba(20,30,50,0.045); }
.report .ent li.fld .ek { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.05em;
  color: #97a0ac; font-weight: 650; }
.report .ent li.fld .ev { font-size: 13px; color: #2a3441; font-weight: 550;
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
/* mini level bar (n of m segments), coloured by severity */
.report .lvl { display: inline-flex; gap: 2px; }
.report .lvl i { width: 7px; height: 8px; border-radius: 2px; background: #e5e8ee; }
.report .lvl.sev-hi i.on { background: #d1495b; }
.report .lvl.sev-md i.on { background: #dd7a33; }
.report .lvl.sev-lo i.on { background: #e0a13a; }
.report .lvl.sev-ok i.on { background: #2fa36f; }
/* kill-chain steps nested under an operational scenario */
.report .kc-wrap { margin-top: 11px; border-top: 1px solid #eceef2; padding-top: 10px; }
.report .kc-h { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.05em; color: #97a0ac;
  font-weight: 650; margin-bottom: 7px; }
.report ol.kc { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
.report ol.kc li { display: flex; align-items: center; gap: 10px; background: #fff;
  border: 1px solid #e7eaf0; border-radius: 7px; padding: 6px 10px; box-shadow: 0 1px 2px rgba(20,30,50,0.04); }
.report .kc-n { flex: none; width: 21px; height: 21px; border-radius: 6px; background: #eef1f6;
  color: #55606f; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
.report .kc-body { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.report .kc-name { font-size: 12.5px; font-weight: 600; color: #2a3441; }
.report .kc-tac { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.04em; color: #99a1ad; font-weight: 600; }
.report .kc-tech { flex: none; font-family: ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace; font-size: 11px;
  background: #edf5f6; color: #1f7a8c; border: 1px solid #cfe4e7; border-radius: 5px; padding: 2px 7px; }
.report code { font-family: ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace; font-size: 0.88em;
  background: #edf5f6; color: #1f7a8c; border: 1px solid #d5e5e7; border-radius: 4px; padding: 1px 5px; }
.report a { color: #1f7a8c; }
.report ul { margin: 8px 0; padding-left: 22px; }
.report li { margin: 3px 0; }
.report hr { border: none; border-top: 1px solid #e3e6ec; margin: 26px 0; }
.report svg { max-width: 100%; height: auto; }
.report div[align="center"] { margin: 14px 0; }
.report pre { background: #f6f7f9; border: 1px solid #e3e6ec; border-radius: 8px; padding: 12px 14px; overflow-x: auto; font-size: 12.5px; }
.report pre.mermaid { background: transparent; border: none; text-align: center; padding: 0; }
.report strong { font-weight: 650; }
/* A table of figures: tighter than a table of sentences, and inheriting everything else
   from the general rules above rather than restating it - the restatement is what used to
   pin every cell to the left and defeat the alignment below. */
.report table.qt-tbl { margin: 10px 0 6px; font-size: 12.5px; }
.report table.qt-tbl th, .report table.qt-tbl td { padding: 6px 11px; }
.report table.qt-tbl thead th { color: #55606f; font-weight: 600; font-size: 11.5px; }
/* Figures are read down a column, so they line up on the right and share a digit width.
   Which columns those are is said by the table that has them: the rule used to be "every
   column but the first", which set a column of owners and one of dates flush right against
   the edge of the page because they happened to sit beside a number. */
.report .num { text-align: right; font-variant-numeric: tabular-nums; }
.report table.qt-tbl tbody tr:first-child td { font-size: 13.5px; }
@media print {
  table.qt-tbl { break-inside: avoid; }
  body { background: #fff; }
  .report { box-shadow: none; margin: 0; max-width: none; padding: 0 8mm; border-radius: 0; }
  /* A register runs over pages, and a column without its header is a column of
     unlabelled values. thead repeats it on every one. */
  thead { display: table-header-group; }
  tr, .ent { break-inside: avoid; }
  p { orphans: 2; widows: 2; }
  /* On paper the sheet is the width there is, so the widened sheet goes back and the
     table has to fit: an automatic layout grows past 100%, a fixed one cannot. */
  .report:has(table.dense), .report:has(table.dense) > * { max-width: none; }
  .report table.dense { width: 100%; table-layout: fixed; font-size: 9px; }
  .report table.dense td, .report table.dense th { max-width: none; }
  h1, h2, h3 { break-after: avoid; }
  svg, pre.mermaid, li, div[align="center"] { break-inside: avoid; }
  a { color: inherit; text-decoration: none; }
}`;

/** Full self-contained, print-ready HTML report (opens in a new tab). */
export function reportHtml(tax: Taxonomy, study: Study): string {
  const body = mdToHtml(reportMarkdown(tax, study));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(study.name)} - ${esc(PRODUCT.documentTitle ?? "Risk Analysis Report")}</title>
<style>${REPORT_CSS}${PRODUCT.reportCss ?? ""}</style></head>
<body><main class="report">${body}</main></body></html>`;
}

/** Open an HTML document in a new tab (blob URL); falls back to download. */
export function openReportHtml(html: string, filename = "report.html"): void {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const w = window.open(url, "_blank");
  if (!w) { const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Download arbitrary text as a file (used for the Markdown report). */
export function downloadText(filename: string, text: string, mime = "text/markdown"): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/** Copy text to clipboard, with a file:// / non-secure-context fallback. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Quantification dump for a language model
//
// A plain-text export of everything behind the monetary figures, meant to be
// pasted into a chat as grounded context. It is deliberately SELF-DESCRIBING:
// numbers alone invite a model to invent the method that produced them, so the
// rules, the parameters and the stated limits travel with the results. Every
// derived term is broken out rather than only its product, so the model can see
// which input carries an answer instead of guessing.
// ─────────────────────────────────────────────────────────────────────────

const n2 = (x: number) => (Math.abs(x) >= 100 ? Math.round(x).toString() : Number(x.toPrecision(3)).toString());
const pc = (x: number) => `${(x * 100).toFixed(1)}%`;
const rng = (r: { min: number; mode: number; max: number }) => `${n2(r.min)} / ${n2(r.mode)} / ${n2(r.max)}`;

/** Everything behind the quantification of one study, as grounded context. */
export function quantLlmMarkdown(tax: Taxonomy, study: Study): string {
  const cal = study.calibration ?? DEFAULT_CALIBRATION;
  const opType = tax.entityTypes.find((t) => t.fields.some((f) => f.key === "difficulty"));
  const stepType = tax.entityTypes.find((t) => t.fields.some((f) => f.type === "ref" && f.refType) && t.fields.some((f) => f.type === "number"));
  const parentF = stepType?.fields.find((f) => f.type === "ref" && f.refType);
  const L: string[] = [];
  const P = (...x: string[]) => L.push(...x);

  P(`# Quantitative risk analysis — ${study.name}`, "");
  P(`Organisation: ${study.organization || "not stated"}${study.sector ? ` · sector: ${study.sector}` : " · sector: not set"}`);
  P(`Scope: ${study.scope || "not stated"}`, "");
  P("This is a complete export of the quantitative model behind one risk study: the rules,",
    "the parameters they use, the inputs read from the qualitative analysis, and the results.",
    "It is self-contained — do not assume a standard method, use the definitions in §1.", "");

  // ── 1. how the model works ──────────────────────────────────────────────
  P("## 1. The model", "",
    "```",
    "annual loss   = loss event frequency × loss magnitude",
    "  loss event frequency = attempts per year × vulnerability",
    "  vulnerability        = P(attacker capability > the bar), measured over the simulation",
    "  loss magnitude       = direct loss + follow-on likelihood × follow-on loss",
    "```", "");
  P("Every factor is a three-point range (min / most likely / max) sampled as a PERT",
    "distribution over many simulated years, not a point estimate. Results below are means",
    "unless labelled otherwise, and the run is seeded, so the figures are reproducible.", "");
  P("**Attempts per year** is ONE derived quantity. Contact frequency and probability of",
    "action are not modelled separately: the split is only identifiable for exposure-driven",
    "attacks, and elsewhere one of the two factors is structurally 1. It is derived as",
    "base rate × tempo × throughput × target pull × reachability, then reduced by any",
    "deterrent or avoidance measures.", "");
  P("**The bar** is what an attempt must beat, derived from the kill chain rather than",
    "rated: entry cost + tooling maturity + breadth (distinct tactics) + dwell requirement.",
    "It is charged once per attempt and is included in every defended step's resistance.",
    "The measures are the OTHER side of the comparison and add to it per step.", "");
  P("**Chain traversal.** Per attempt the attacker draws ONE capability and keeps it for",
    "the whole walk. Steps are visited in topological order honouring each step's join",
    "(`all` = every predecessor required, `any` = one route suffices). A step only costs",
    "the attacker something if a measure defends it. A loss event requires reaching a",
    "terminal step — initial compromise alone is not a loss event.", "");
  P("**Measures act through the mechanism they work by**, each on a different factor:",
    "preventive raises the bar at its step; detective gives a chance of breaking off the",
    "intrusion there, scaled by response capability; corrective cuts the loss and the",
    "follow-on loss; deterrent and avoidance cut the number of attempts. A measure with no",
    "class stated is treated as preventive.", "");
  P("**Decomposition invariance.** Describing the same attack in more steps never changes",
    "the result: undefended steps are transparent, and the bar uses a maximum over tooling",
    "and a count of DISTINCT tactics.", "");

  // ── 2. parameters ───────────────────────────────────────────────────────
  P("## 2. Parameters in force", "",
    `These are settings, not measurements. Each is graded: **measured** = published figure`,
    `with the derivation documented, **derived** = published figure plus a stated`,
    `assumption, **judgement** = no published figure answers the question.`,
    study.calibration ? "\n**This study uses an edited parameterisation** (changed from the shipped defaults)." : "\nThis study uses the shipped defaults unchanged.", "");
  const f = cal.frequency, d = cal.demand;
  const g = (k: string) => CALIBRATION_DOC[k]?.grade ?? "judgement";
  P(`### Base rate, attacks/yr per organisation — *${g("frequency.baseRate")}*`);
  P(Object.entries(f.baseRate).map(([k, v]) => `${k} ${v}`).join(" · ") + ` · anything else ${f.baseRateDefault}`);
  P("", `### Sector exceptions — *${g("frequency.sector")}*`);
  P(f.sector.map((r) => `${r.actor}×${r.sector} ×${r.factor}`).join(" · ") || "none");
  P("", `### Frequency multipliers — *tempo/throughput/pull: ${g("frequency.tempo")}, reachability: ${g("frequency.reachability")}*`);
  P(`tempo (by activity): ${f.tempo.join(" · ")}`);
  P(`throughput (by resources): ${f.throughput.join(" · ")}`);
  P(`target pull: declared objective ×${f.targetPull.declared} · has objectives, none match ×${f.targetPull.noMatch} · none modelled, by relevance ${f.targetPull.byRelevance.join(" · ")}`);
  P(`reachability (by entry technique): ${Object.entries(f.reachability).map(([k, v]) => `${k} ×${v}`).join(" · ")} · other ×${f.reachabilityDefault}`);
  P(`cap: ${f.cap}/yr · likelihood cross-check boundaries: ${f.likelihoodBands.join(" · ")} loss events/yr`);
  P("", `### The bar — *entry: ${g("demand.entry")}, tooling & weights: ${g("demand.tooling")}*`);
  P(`entry cost: ${Object.entries(d.entry).map(([k, v]) => `${k} ${v}`).join(" · ")} · other ${d.entryDefault} · granted access −${d.grantedAccess}`);
  P(`weights: tooling ${d.wTooling} · breadth ${d.wDepth} (full at ${d.depthSaturates} distinct tactics) · dwell ${d.wDwell} (${d.dwellTactics.join(", ")})`);
  P(`spread ±${d.spread} · floor ${d.floor} · fallback where no chain is modelled, by difficulty: ${d.difficultyFallback.join(" · ")}`);
  P(`tooling maturity by technique (0 commodity, 0.5 practitioner, 1 bespoke): ${Object.entries(d.tooling).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  P(`  fallback by tactic: ${Object.entries(d.toolingByTactic).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  P("", `### Attacker capability, share of the attacker population out-performed — *${g("adversary.capability")}*`);
  P(cal.adversary.capability.map((b, i) => `level ${i + 1}: ${rng(b)}`).join(" · "));
  P("", `### What a measure is worth — *${g("effect")}*`);
  const e = cal.effect;
  P(`preventive raises the bar by ${e.prevention} · detective converts to interruption at ${e.detection} · response floor ${e.responseFloor}`);
  P(`deterrent cuts attempts by ${e.deterrence} · avoidance by ${e.avoidance} · recovery reaches ${e.recoverableShare} of the loss · containment ${e.containment} · late detection ${e.lateDetection}`);
  P(`a single measure never blocks more than ${e.controlCeiling} · counted by status: ${Object.entries(e.statusWeight).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  P("", `### Loss magnitude by feared-event severity — *${g("magnitude")}*`);
  P(`direct loss: ${cal.magnitude.loss.map((b) => rng(b)).join("  |  ")}`);
  P(`follow-on likelihood: ${cal.magnitude.cascadeLikelihood.map((b) => rng(b)).join("  |  ")}`);
  P(`follow-on loss: ${cal.magnitude.cascadeLoss.map((b) => rng(b)).join("  |  ")}`);
  P("");

  // ── 3. per scenario ─────────────────────────────────────────────────────
  const ops = opType && stepType && parentF
    ? study.entities.filter((x) => x.type === opType.key
      && study.entities.some((s) => s.type === stepType.key && s.values[parentF.key] === x.id))
    : [];
  P("## 3. Scenarios", "");
  if (!ops.length) P("_No operational scenario models a kill chain, so nothing is quantified._", "");

  for (const op of ops) {
    const ov = study.quant?.[op.id]?.overrides as Partial<QuantInputs> | undefined;
    const dW = deriveInputs(study, tax, op, true, cal), dWo = deriveInputs(study, tax, op, false, cal);
    const inW: QuantInputs = { ...dW.inputs, ...ov }, inWo: QuantInputs = { ...dWo.inputs, ...ov };
    const rW = simulate(inW, 40000, dW.chain), rWo = simulate(inWo, 40000, dWo.chain);
    const rs = dW.refs.riskSource, fe = dW.refs.fearedEvent, strat = dW.refs.strategic;
    const lab = (rec: EntityRecord | undefined, key: string) => {
      if (!rec) return "—";
      const fd = getType(tax, rec.type)?.fields.find((x) => x.key === key);
      const v = rec.values[key];
      return fd && typeof v === "number" ? `${scaleLabel(fd, v)} (${v}/${scaleMax(fd)})` : String(v ?? "—");
    };

    P(`### ${recordTitle(opType!, op)}`, "");
    P(`- Risk: ${strat ? recordTitle(getType(tax, strat.type)!, strat) : "—"}`);
    P(`- Actor: ${rs ? recordTitle(getType(tax, rs.type)!, rs) : "—"} — category ${String(rs?.values.category ?? "not set")}, capability ${lab(rs, "capability")}, resources ${lab(rs, "resources")}, activity ${lab(rs, "activity")}, relevance ${lab(rs, "relevance")}`);
    P(`- Feared event: ${fe ? recordTitle(getType(tax, fe.type)!, fe) : "—"} — severity ${lab(fe, "severity")}`);
    P(`- Analyst ratings on this scenario: likelihood ${lab(op, "likelihood")}, difficulty ${lab(op, "difficulty")} (difficulty is NOT read where a chain is modelled; likelihood is never read — it is only cross-checked)`, "");

    const fr = dW.frequency;
    P(`**Attempts per year: ${n2(fr.total)}**`,
      `base ${n2(fr.base)} × tempo ${n2(fr.tempo)} × throughput ${n2(fr.throughput)} × target pull ${n2(fr.pull)} × reachability ${n2(fr.reachability)}${fr.capped ? " — CAPPED, the multipliers together exceeded the plausible ceiling" : ""}`, "");

    if (dW.demand) {
      const dm = dW.demand;
      P(`**The bar: ${pc(dm.total)}** — an attempt must out-perform this share of the attacker population before any measure of this organisation is counted`,
        `entry ${pc(dm.entry)} + tooling ${pc(dm.adds.tooling)} (max maturity ${dm.tooling}) + breadth ${pc(dm.adds.depth)} (${dm.tactics} distinct tactics) + dwell ${pc(dm.adds.dwell)}`);
      if (dm.unknown.entry || dm.unknown.tooling)
        P(`_Incomplete input: ${dm.unknown.entry ? "the entry step names no recognised technique" : ""}${dm.unknown.entry && dm.unknown.tooling ? "; " : ""}${dm.unknown.tooling ? `${dm.unknown.tooling} step(s) contribute no tooling because neither technique nor tactic is set` : ""}._`);
      P("");
    } else {
      P(`**The bar: ${pc(meanOf(inW.controlStrength))}** — derived from the difficulty rating, because this scenario models no chain.`, "");
    }

    P("**Chain**", "");
    P("| # | step | tactic | technique | join | blocks | detected | measures |");
    P("|---|---|---|---|---|---|---|---|");
    (dW.chain ?? []).forEach((cs, i) => {
      const sc = dW.coverage.steps.find((x) => x.step.id === cs.id);
      const st = sc?.step;
      const ms = (sc?.measures ?? []).map((m) => `${recordTitle(getType(tax, m.type)!, m)} [${effectClassOf(m)}, ${String(m.values.status ?? "?")}, level ${String(m.values.implementation_level ?? "?")}]`).join("; ");
      P(`| ${i + 1}${cs.terminal ? " (objective)" : ""} | ${st ? recordTitle(getType(tax, st.type)!, st) : cs.id} | ${String(st?.values.tactic ?? "—")} | ${String(st?.values.technique ?? "—")} | ${cs.preds.length > 1 ? cs.join : "—"} | ${cs.gate ? pc(cs.gate.mode) : "—"} | ${cs.interrupt > 0 ? pc(cs.interrupt) : "—"} | ${ms || "none"} |`);
    });
    P("");

    P("**Factors fed to the simulation** (min / most likely / max)", "");
    P("| factor | residual | inherent | where it comes from |");
    P("|---|---|---|---|");
    for (const k of Object.keys(inW) as (keyof QuantInputs)[]) {
      const prov = dW.prov[k];
      P(`| ${k}${ov && k in ov ? " *(overridden by the analyst)*" : ""} | ${rng(inW[k])} | ${rng(inWo[k])} | ${prov.source}${prov.label ? ` · ${prov.label}` : ""} |`);
    }
    P("");

    P("**Results**", "");
    P("| | inherent (no measures) | residual (with measures) |");
    P("|---|---|---|");
    P(`| attempts/yr | ${n2(rWo.tef)} | ${n2(rW.tef)} |`);
    P(`| vulnerability | ${pc(rWo.vuln)} | ${pc(rW.vuln)} |`);
    P(`| loss events/yr | ${n2(rWo.lef)} | ${n2(rW.lef)} |`);
    P(`| return period | ${rWo.lef > 0 ? `1 in ${Math.round(1 / rWo.lef)} yr` : "—"} | ${rW.lef > 0 ? `1 in ${Math.round(1 / rW.lef)} yr` : "—"} |`);
    P(`| mean annual loss | ${fmtMoney(rWo.ale.mean)} | ${fmtMoney(rW.ale.mean)} |`);
    P(`| P50 / P90 / P99 | ${fmtMoney(rWo.ale.p50)} / ${fmtMoney(rWo.ale.p90)} / ${fmtMoney(rWo.ale.p99)} | ${fmtMoney(rW.ale.p50)} / ${fmtMoney(rW.ale.p90)} / ${fmtMoney(rW.ale.p99)} |`);
    P(`| years with no loss | ${pc(rWo.zeroShare)} | ${pc(rW.zeroShare)} |`);
    P("");

    P("**Where attempts stop** (residual, shares of all attempts)", "");
    P(`- not capable enough for the attack itself, before any measure: ${pc(rW.blockedAtBaseline)}`);
    for (const b of rW.breaks.filter((x) => x.p > 0.0005).sort((x, y) => y.p - x.p)) {
      const sc = dW.coverage.steps.find((x) => x.step.id === b.id);
      P(`- stopped at ${sc ? recordTitle(getType(tax, sc.step.type)!, sc.step) : b.id}: ${pc(b.p)}`);
    }
    P(`- reach the objective (become loss events): ${pc(rW.vuln)}`);
    if (rW.detected > 0.0005) P(`- of those stopped, ${pc(rW.detected)} of all attempts were caught by detection and response rather than blocked`);
    P("");

    const lk = likelihoodCheck(rW.lef, typeof op.values.likelihood === "number" ? op.values.likelihood : null, cal.frequency,
      scaleMax(opType!.fields.find((x) => x.key === "likelihood")!));
    if (lk.ratedLevel != null) {
      P(`**Cross-check.** The analyst rated likelihood at level ${lk.ratedLevel}; the model, which does not read that rating, arrives at level ${lk.modelLevel}.`
        + (lk.diverges ? " **These disagree by more than one level** — either the rating or the model is missing something." : " They agree within one level."), "");
    }
  }

  // ── 4. limits ───────────────────────────────────────────────────────────
  P("## 4. What this does not claim", "",
    "- Most parameters are reasoned rather than measured; each carries its grade in §2.",
    "  The base rate is the weakest load-bearing number — published surveys of it differ by",
    "  roughly a factor of six depending on the population surveyed.",
    "- Published incidence measures NOTICED events, so every rate here is biased downward by",
    "  an unknown amount. The bias runs the same way for all actor classes, so orderings are",
    "  sturdier than levels.",
    "- Correlated control failure is not modelled: two measures sharing an administrator,",
    "  platform or bypass fail together, but their resistance is treated as independent.",
    "  Correlation is modelled only on the attacker's side, via the single capability draw.",
    "- Loss is one figure, not decomposed into productivity, response, replacement, fines and",
    "  reputation. The cap on recovery stands in for that distinction.",
    "- Magnitude is scenario-level; routes ending at different assets would strictly be",
    "  different scenarios.",
    "- Implementation level × status is a proxy for whether a control really operates, not an",
    "  assurance measurement.",
    "- The output is a structured argument about relative magnitude, useful for comparing",
    "  scenarios and showing what a measure buys. It is not a prediction.", "");
  return L.join("\n");
}
