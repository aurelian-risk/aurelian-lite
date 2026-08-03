// Builds an LLM-friendly, taxonomy-valid text dump of one workshop (group):
// the schema (entity types + fields) followed by the data (entities with
// relationships resolved to names). Paste into an LLM chat as grounded context.
import type { EntityRecord, EntityTypeDef, FieldDef, FieldValue, Study, Taxonomy } from "./types";
import { getType, recordTitle, scaleLabel, scaleMax } from "./taxonomy";
import { deriveInputs, meanOf } from "./quantModel";
import { residualPos } from "./treatment";
import { simulate, type QuantInputs, type QuantResult } from "./montecarlo";

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

  L.push(`# EBIOS RM-inspired - ${group?.label ?? groupKey}`);
  if (group?.description) L.push(`_${group.description}_`);
  L.push("");
  L.push(`**Study:** ${study.name}${study.organization ? ` (${study.organization})` : ""}`);
  if (study.scope) L.push(`**Scope:** ${study.scope}`);
  L.push("");

  L.push("## Schema (valid taxonomy for this workshop)");
  for (const t of types) {
    L.push(`### ${t.label} \`${t.key}\``);
    for (const f of t.fields) L.push(`- ${f.label}: ${fieldSpec(f, tax)}`);
    L.push("");
  }

  L.push("## Data");
  for (const t of types) {
    const items = study.entities.filter((e) => e.type === t.key);
    L.push(`### ${t.labelPlural} (${items.length})`);
    if (items.length === 0) L.push("_none_");
    items.forEach((e: EntityRecord, i) => {
      L.push(`${i + 1}. **${recordTitle(t, e)}**`);
      for (const f of t.fields) {
        if (f.key === (t.titleField ?? "name")) continue;
        const val = valueMd(f, e.values[f.key] ?? null, tax, study);
        if (val !== "—") L.push(`   - ${f.label}: ${val}`);
      }
    });
    L.push("");
  }

  return L.join("\n").trim() + "\n";
}

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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
  const items = study.entities.filter((e) => e.type === type.key);
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
  p.push(`<text x="${L0 + (xMax * cw) / 2}" y="${innerH - 8}" text-anchor="middle" font-size="11.5" font-weight="600" fill="#3a4552">${esc(xF.label)} →</text>`);
  const yc = T + (yMax * ch) / 2;
  p.push(`<text x="4" y="${yc}" text-anchor="middle" font-size="11.5" font-weight="600" fill="#3a4552" transform="rotate(-90 4 ${yc})">${esc(yF.label)} →</text>`);
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
    p.push(`<text x="${PAD}" y="${cy + 4}" font-size="11.5" fill="${HEX.muted}">${esc(mm(f.label, 24))}</text>`);
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
    const right = `${scaleLabel(critF, t.v)}${supp ? ` · ${t.sup.length} ${t.sup.length === 1 ? supp.label.toLowerCase() : supp.labelPlural.toLowerCase()}` : ""}`;
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
  const actors = study.entities.filter((e) => e.type === t.key);
  if (!actors.length) return null;
  const series: RSeries[] = actors.map((a, i) => ({
    label: recordTitle(t, a), color: SERIES_HEX[i % SERIES_HEX.length],
    sub: catF ? String(a.values[catF.key] ?? "") : undefined,
    values: scales.map((f) => (Number(a.values[f.key] ?? 1) - 1) / Math.max(1, scaleMax(f) - 1)),
  }));
  return radarSvg(scales.map((f) => f.label), series);
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
  const origins = study.entities.filter((e) => e.type === "risk_origin");
  const strat = study.entities.filter((e) => e.type === "strategic_scenario" && origins.some((o) => o.id === e.values.risk_origin));
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

  const PAD = 14, colW = 272, gap = 42, rowH = 62, boxH = 46;
  const x0 = PAD, x1 = PAD + colW + gap, x2 = PAD + 2 * (colW + gap), W = x2 + colW + PAD;
  const H = PAD * 2 + sNodes.length * rowH + 16;          // extra room for the column captions
  const yMid = (i: number) => PAD + i * rowH + rowH / 2;
  const sY = new Map(sNodes.map((s, i) => [s.id, yMid(i)]));
  const avgY = (ids: string[]) => ids.reduce((a, id) => a + (sY.get(id) ?? 0), 0) / (ids.length || 1);
  const oY = new Map(origins.map((o) => [o.id, avgY(sNodes.filter((s) => s.originId === o.id).map((s) => s.id))]));
  const fY = new Map([...feared.keys()].map((fid) => [fid, avgY(sNodes.filter((s) => s.fearedId === fid).map((s) => s.id))]));

  const p: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-sans-serif,system-ui,Segoe UI,Roboto,sans-serif">`];
  p.push(`<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14" fill="${HEX.card}" stroke="${HEX.edge}"/>`);
  const edge = (xa: number, ya: number, xb: number, yb: number) => `<path d="M${xa} ${ya} C${xa + gap * 0.6} ${ya}, ${xb - gap * 0.6} ${yb}, ${xb} ${yb}" fill="none" stroke="#b7c0cd" stroke-width="1.4"/>`;
  for (const s of sNodes) {                              // edges first (under boxes)
    if (oY.has(s.originId)) p.push(edge(x0 + colW, oY.get(s.originId)!, x1, sY.get(s.id)!));
    if (s.fearedId && fY.has(s.fearedId)) p.push(edge(x1 + colW, sY.get(s.id)!, x2, fY.get(s.fearedId)!));
  }
  const box = (x: number, ycenter: number, n: { title: string; sub: string }, tint: string) => {
    const y = ycenter - boxH / 2;
    return `<rect x="${x}" y="${y}" width="${colW}" height="${boxH}" rx="9" fill="${tint}" fill-opacity="0.14" stroke="${tint}" stroke-opacity="0.55"/>`
      + `<text x="${x + 12}" y="${y + 19}" font-size="11.5" font-weight="600" fill="${HEX.ink}">${esc(truncTxt(n.title, 44))}</text>`
      + (n.sub ? `<text x="${x + 12}" y="${y + 34}" font-size="10" fill="${HEX.muted}">${esc(truncTxt(n.sub, 44))}</text>` : "");
  };
  for (const o of origins) if (oY.has(o.id)) p.push(box(x0, oY.get(o.id)!, { title: recordTitle(originType, o), sub: catF ? String(o.values[catF.key] ?? "") : "" }, HEX.red));
  for (const s of sNodes) p.push(box(x1, sY.get(s.id)!, s, HEX.amber));
  for (const [fid, n] of feared) if (fY.has(fid)) p.push(box(x2, fY.get(fid)!, n, HEX.orange));
  // column captions
  const cap = (x: number, t: string) => `<text x="${x + colW / 2}" y="${H - 2}" text-anchor="middle" font-size="10" font-weight="600" fill="${HEX.muted}">${t}</text>`;
  p.push(cap(x0, "Risk source") + cap(x1, "Strategic scenario") + cap(x2, "Feared event"));
  p.push("</svg>");
  return p.join("");
}

/** A human-readable, taxonomy-driven Markdown report of the whole study:
 *  overview, per-workshop entities (data, relationships resolved to names) and a
 *  deterministic kill-chain mitigation-coverage section. */
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
function lossCurveSvg(rW: QuantResult, rWo: QuantResult): string {
  const W = 640, H = 250, PL = 54, PR = 118, PT = 16, PB = 42, PAD = 12;
  const top = Math.max(rW.curve[rW.curve.length - 1].loss, rWo.curve[rWo.curve.length - 1].loss, 1);
  const X = (loss: number) => PL + (loss / top) * (W - PL - PR);
  const Y = (p: number) => PT + (1 - p) * (H - PT - PB);
  const path = (r: QuantResult) => r.curve.map((d, i) => `${i ? "L" : "M"}${X(d.loss).toFixed(1)} ${Y(d.exceedance).toFixed(1)}`).join(" ");
  const cy = PT + (H - PT - PB) / 2;
  const p: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W + PAD * 2}" height="${H + PAD * 2}" viewBox="0 0 ${W + PAD * 2} ${H + PAD * 2}" font-family="ui-sans-serif,system-ui,Segoe UI,Roboto,sans-serif">`];
  p.push(`<rect x="0.5" y="0.5" width="${W + PAD * 2 - 1}" height="${H + PAD * 2 - 1}" rx="14" fill="${HEX.card}" stroke="${HEX.edge}"/>`);
  p.push(`<g transform="translate(${PAD} ${PAD})">`);
  for (const q of [0, 0.25, 0.5, 0.75, 1]) {
    p.push(`<line x1="${PL}" y1="${Y(q)}" x2="${W - PR}" y2="${Y(q)}" stroke="${HEX.track}"/>`);
    p.push(`<text x="${PL - 8}" y="${Y(q) + 3.5}" text-anchor="end" font-size="10.5" fill="${HEX.muted}">${q * 100}%</text>`);
  }
  for (const f of [0, 0.5, 1]) p.push(`<text x="${X(f * top)}" y="${H - 22}" text-anchor="middle" font-size="10.5" fill="${HEX.muted}">${esc(fmtMoney(f * top))}</text>`);
  p.push(`<text x="${PL + (W - PL - PR) / 2}" y="${H - 6}" text-anchor="middle" font-size="11" font-weight="600" fill="${HEX.muted}">Annual loss →</text>`);
  p.push(`<text x="12" y="${cy}" text-anchor="middle" font-size="11" font-weight="600" fill="${HEX.muted}" transform="rotate(-90 12 ${cy})">P(loss ≥ x)</text>`);
  p.push(`<path d="${path(rWo)}" fill="none" stroke="${HEX.orange}" stroke-width="2" stroke-dasharray="5 3"/>`);
  p.push(`<path d="${path(rW)}" fill="none" stroke="${HEX.green}" stroke-width="2.4"/>`);
  const lx = W - PR + 12;
  p.push(`<line x1="${lx}" y1="${PT + 10}" x2="${lx + 20}" y2="${PT + 10}" stroke="${HEX.green}" stroke-width="2.4"/><text x="${lx + 26}" y="${PT + 13.5}" font-size="10.5" fill="${HEX.ink}">with controls</text>`);
  p.push(`<line x1="${lx}" y1="${PT + 28}" x2="${lx + 20}" y2="${PT + 28}" stroke="${HEX.orange}" stroke-width="2" stroke-dasharray="5 3"/><text x="${lx + 26}" y="${PT + 31.5}" font-size="10.5" fill="${HEX.ink}">without</text>`);
  p.push("</g></svg>");
  return p.join("");
}

/** Derived Monte-Carlo quantification per operational scenario (with vs without
 *  controls), honouring any persisted per-factor overrides so the report matches
 *  the app. Deterministic (seeded), so re-running gives identical numbers. */
function quantSection(tax: Taxonomy, study: Study): string[] | null {
  const opType = tax.entityTypes.find((t) => t.fields.some((f) => f.key === "difficulty"));
  const stepType = tax.entityTypes.find((t) => t.fields.some((f) => f.type === "ref" && f.refType) && t.fields.some((f) => f.type === "number"));
  const parentF = stepType?.fields.find((f) => f.type === "ref" && f.refType);
  if (!opType || !stepType || !parentF) return null;
  const ops = study.entities.filter((e) => e.type === opType.key
    && study.entities.some((s) => s.type === stepType.key && s.values[parentF.key] === e.id));
  if (!ops.length) return null;

  const L: string[] = ["---\n", "## Quantitative risk\n",
    "_Monte-Carlo simulation (loss event frequency × loss magnitude), derived from the qualitative model. Annual loss shown with vs. without the current controls._\n"];
  const row = (k: string, a: string, b: string) => `<tr><td>${esc(k)}</td><td>${a}</td><td>${b}</td></tr>`;
  for (const op of ops) {
    const ov = study.quant?.[op.id]?.overrides as Partial<QuantInputs> | undefined;
    const dW = deriveInputs(study, tax, op, true), dWo = deriveInputs(study, tax, op, false);
    const inW: QuantInputs = { ...dW.inputs, ...ov }, inWo: QuantInputs = { ...dWo.inputs, ...ov };
    const rW = simulate(inW, 40000), rWo = simulate(inWo, 40000);
    const lm = meanOf(inW.directImpact) + meanOf(inW.cascadingLikelihood) * meanOf(inW.cascadingImpact);
    const benefit = rWo.ale.mean - rW.ale.mean;
    const benefitPct = rWo.ale.mean > 0 ? Math.round((benefit / rWo.ale.mean) * 100) : 0;
    L.push(`### ${recordTitle(opType, op)}`);
    L.push(`<table class="qt-tbl"><thead><tr><th>Metric</th><th>Inherent<br>(no controls)</th><th>Residual<br>(with controls)</th></tr></thead><tbody>`
      + row("Expected annual loss (ALE)", fmtMoney(rWo.ale.mean), `<strong>${esc(fmtMoney(rW.ale.mean))}</strong>`)
      + row("P90 / P99 (bad years)", `${esc(fmtMoney(rWo.ale.p90))} / ${esc(fmtMoney(rWo.ale.p99))}`, `${esc(fmtMoney(rW.ale.p90))} / ${esc(fmtMoney(rW.ale.p99))}`)
      + row("Loss event frequency", esc(fmtRate(rWo.lef)), esc(fmtRate(rW.lef)))
      + row("Vulnerability P(adversary > control)", fmtPct(rWo.vuln), fmtPct(rW.vuln))
      + row("Loss magnitude / event", esc(fmtMoney(lm)), esc(fmtMoney(lm)))
      + `</tbody></table>`);
    L.push(`Controls cut the mean annual loss by **${fmtMoney(benefit)}** (-${benefitPct}%). Kill-chain coverage: **${dW.coverage.mitigated}/${dW.coverage.total}** steps mitigated${dW.coverage.total ? ` (avg implementation ${Math.round(dW.coverage.impl * 100)}%)` : ""}.`);
    L.push("");
    L.push(`<div align="center">${lossCurveSvg(rW, rWo)}</div>`);
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
  const treatments = study.entities.filter((e) => e.type === treatType.key);
  if (!treatments.length) return null;
  const byId = new Map(study.entities.map((e) => [e.id, e]));
  const scales = riskType.fields.filter((f) => f.type === "scale");
  const xF = scales[0], yF = scales[1];
  if (!xF || !yF) return null;
  const decF = treatType.fields.find((f) => f.key === "decision"), ownF = treatType.fields.find((f) => f.key === "owner");
  const ddF = treatType.fields.find((f) => f.key === "deadline"), stF = treatType.fields.find((f) => f.key === "status");
  const cell = (v: FieldValue | undefined) => esc(v == null || v === "" ? "—" : String(v));

  const L: string[] = ["---\n", "## Risk treatment\n",
    "_Treatment decision per risk (strategic scenario). The residual risk is DERIVED from the decision and how well the risk's kill chain is already mitigated - Reduce lowers likelihood by that coverage, Share lowers gravity, Accept keeps the inherent level, Avoid removes it._\n"];
  let tbl = `<table class="qt-tbl"><thead><tr><th>Risk</th><th>Decision</th><th>Owner</th><th>Deadline</th><th>Status</th><th>Inherent → Residual (L·G)</th></tr></thead><tbody>`;
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
  L.push(`# ${study.name} - Risk Analysis Report`);
  const meta: string[] = [];
  if (study.organization) meta.push(`**Organization:** ${study.organization}`);
  if (study.scope) meta.push(`**Scope:** ${study.scope}`);
  meta.push(`**Generated:** ${new Date().toISOString().slice(0, 10)}`);
  L.push(meta.join("  \n"));
  L.push("");

  L.push("---\n");
  L.push("## Overview\n");
  for (const t of tax.entityTypes) {
    const n = study.entities.filter((e) => e.type === t.key).length;
    if (n) L.push(`- **${t.labelPlural}:** ${n}`);
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
    const actors = study.entities.filter((e) => e.type === attackerType.key);
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
    const steps = study.entities.filter((s) => s.type === kcStepType.key && s.values[kcParentF.key] === op.id)
      .sort((a, b) => Number(a.values[kcOrderF.key] || 0) - Number(b.values[kcOrderF.key] || 0));
    if (!steps.length) return "";
    const rows = steps.map((s, i) => {
      const tac = kcTacticF ? String(s.values[kcTacticF.key] ?? "") : "";
      const tech = kcTechF ? String(s.values[kcTechF.key] ?? "") : "";
      return `<li><span class="kc-n">${i + 1}</span><span class="kc-body"><span class="kc-name">${esc(recordTitle(kcStepType, s))}</span>${tac ? `<span class="kc-tac">${esc(tac)}</span>` : ""}</span>${tech ? `<span class="kc-tech">${esc(tech)}</span>` : ""}</li>`;
    }).join("");
    return `<div class="kc-wrap"><div class="kc-h">Kill chain · ${steps.length} step${steps.length === 1 ? "" : "s"}</div><ol class="kc">${rows}</ol></div>`;
  };

  for (const g of tax.groups) {
    const types = tax.entityTypes.filter((t) => t.group === g.key);
    if (!types.some((t) => study.entities.some((e) => e.type === t.key))) continue;
    L.push("---\n");
    L.push(`## ${g.label}`);
    if (g.description) L.push(`_${g.description}._\n`);
    for (const t of types) {
      if (kcStepType && t.key === kcStepType.key) continue;   // nested under its op scenario instead
      const items = study.entities.filter((e) => e.type === t.key);
      if (!items.length) continue;
      const titleKey = t.titleField ?? "name";
      const descF = t.fields.find((f) => f.type === "textarea");
      L.push(`### ${t.labelPlural} (${items.length})\n`);
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
            attrs.push(`**${f.label}:** ${val} ${br}`);
          } else attrs.push(`**${f.label}:** ${val}`);
        }
        if (attrs.length) L.push(attrs.map((a) => `- ${a}`).join("\n"));
        if (kcStepType && t.key === kcOpKey) { const kc = kcStepsHtml(e); if (kc) L.push(kc); }
        L.push("");
      }
    }
  }

  // Deterministic coverage: kill-chain steps vs. the measures that cover them.
  const stepType = tax.entityTypes.find((t) => t.fields.some((f) => f.type === "ref" && f.refType) && t.fields.some((f) => f.type === "number"));
  const parentF = stepType?.fields.find((f) => f.type === "ref" && f.refType);
  const orderF = stepType?.fields.find((f) => f.type === "number");
  const measureType = tax.entityTypes.find((t) => t.key !== stepType?.key && t.fields.some((f) => f.type === "multiref" && f.refType === stepType?.key));
  const coversF = measureType?.fields.find((f) => f.type === "multiref" && f.refType === stepType?.key);
  const opType = parentF?.refType ? getType(tax, parentF.refType) : undefined;
  if (stepType && parentF && orderF && measureType && coversF && opType) {
    const measures = study.entities.filter((e) => e.type === measureType.key);
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
    const ops = study.entities.filter((e) => e.type === opType.key
      && study.entities.some((s) => s.type === stepType.key && s.values[parentF.key] === e.id));
    if (ops.length) {
      L.push("---\n");
      L.push("## Kill-chain mitigation coverage\n");
      for (const op of ops) {
        const steps = study.entities.filter((e) => e.type === stepType.key && e.values[parentF.key] === op.id)
          .sort((a, b) => Number(a.values[orderF.key] || 0) - Number(b.values[orderF.key] || 0));
        const covering = (sid: string) => measures.filter((m) => Array.isArray(m.values[coversF.key]) && (m.values[coversF.key] as string[]).includes(sid));
        const covered = steps.filter((s) => covering(s.id).length).length;
        L.push(`### ${recordTitle(opType, op)} - ${covered}/${steps.length} steps mitigated`);
        L.push(`<div align="center">${killChainSvg(op, steps, covering)}</div>`);
        for (const s of steps) {
          const cov = covering(s.id);
          L.push(`- ${recordTitle(stepType, s)} -> ${cov.length ? cov.map((m) => recordTitle(measureType, m)).join(", ") : "**GAP - no measure**"}`);
        }
        L.push("");
      }
    }
  }

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
.report table.qt-tbl { border-collapse: collapse; width: 100%; margin: 10px 0 6px; font-size: 12.5px; }
.report table.qt-tbl th, .report table.qt-tbl td { border: 1px solid #e3e6ec; padding: 6px 11px; text-align: left; }
.report table.qt-tbl thead th { background: #f6f7f9; color: #55606f; font-weight: 600; font-size: 11.5px; }
.report table.qt-tbl td:not(:first-child), .report table.qt-tbl th:not(:first-child) { text-align: right; font-variant-numeric: tabular-nums; }
.report table.qt-tbl tbody tr:first-child td { font-size: 13.5px; }
@media print {
  table.qt-tbl { break-inside: avoid; }
  body { background: #fff; }
  .report { box-shadow: none; margin: 0; max-width: none; padding: 0 8mm; border-radius: 0; }
  h1, h2, h3 { break-after: avoid; }
  svg, pre.mermaid, li, div[align="center"] { break-inside: avoid; }
  a { color: inherit; text-decoration: none; }
}`;

/** Full self-contained, print-ready HTML report (opens in a new tab). */
export function reportHtml(tax: Taxonomy, study: Study): string {
  const body = mdToHtml(reportMarkdown(tax, study));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(study.name)} - Risk Analysis Report</title>
<style>${REPORT_CSS}</style></head>
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
