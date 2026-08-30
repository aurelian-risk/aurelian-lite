// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Can the text be read - in both themes, measured on what is actually drawn?
//
// The state colours are authored for a dark ground. Used as TEXT on a light one they turn
// into pale washes, and there are over a hundred call sites: fixing that one call site at a
// time is how half of them get missed. So this walks every visible text run in the built
// app, in both themes, and compares the colour the browser resolved against the ground it
// was drawn on.
//
// TWO WAYS TO GET THIS WRONG, both of which produced confident numbers before this file
// settled. First, getComputedStyle hands a colour back in the space it was WRITTEN in -
// `oklch(0.8 0.13 78)` parsed as rgb reads as r=0.8, g=0.13, b=78, and every ratio comes out
// near 1.00:1, which looks like a finding. The browser has to do the conversion: paint the
// colour on a canvas and read the pixel back. Second - and this one reported 156 of 165 runs
// as failing, including white on a teal button at 1:1 - the ground is NOT the chain of
// background-color values. This app's ground is a gradient, its buttons are gradients, and
// a gradient has no background-color at all, so that chain falls through to white and every
// pale-on-dark run is scored against paper. The only ground that cannot lie is the one on
// screen: the page is photographed with its text made invisible, and each run is scored
// against the pixel underneath it.
//
// Run: npm run test:contrast
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { requireFreshBuild } from "./built.mjs";

// Refuses to run against a stale artefact - see built.mjs.
const APP = "file://" + requireFreshBuild(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
let pass = 0, fail = 0;
const ok = (n, c, d = "") => { c ? pass++ : fail++; console.log(`${c ? "✓" : "✗"} ${n}${d ? `  (${d})` : ""}`); };

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1 });
await page.goto(APP);
await page.waitForSelector("#root .app", { timeout: 20000 });
await page.getByText("Load sample study").click();
await page.waitForSelector(".ws-tabs", { timeout: 15000 });
await page.waitForTimeout(500);

// Every visible text run in the current view, with the box to sample its ground from.
const RUNS = () => [...document.querySelectorAll("body *")].flatMap((el) => {
  const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").trim();
  if (!text) return [];
  const st = getComputedStyle(el);
  if (st.visibility === "hidden" || st.display === "none" || +st.opacity === 0) return [];
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return [];
  const size = parseFloat(st.fontSize), weight = +st.fontWeight || 400;
  return [{
    text: text.slice(0, 40), color: st.color, size,
    // WCAG's large-text allowance: 24px, or 18.66px when bold.
    need: size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5,
    cls: (el.className?.toString?.() || el.tagName.toLowerCase()).slice(0, 34),
    // The CENTRE, unclamped. Clamping a half-off-screen run to the edge samples whatever
    // is at the edge - a neighbour's ground, scored against this run's colour - and the
    // scorer drops the point instead if it falls outside the photograph.
    x: Math.round(r.left + r.width / 2),
    y: Math.round(r.top + r.height / 2),
  }];
});

// Score the runs against a photograph of the page taken with its text made invisible.
const SCORE = ([runs, shot]) => new Promise((done, fail) => {
  const img = new Image();
  img.onload = () => {
    const cv = document.createElement("canvas");
    cv.width = img.width; cv.height = img.height;
    const g = cv.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const conv = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    const rgb = (css) => {
      conv.clearRect(0, 0, 1, 1); conv.fillStyle = "#000"; conv.fillStyle = css;
      conv.fillRect(0, 0, 1, 1);
      const d = conv.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3] / 255];
    };
    const lum = ([r, gg, b]) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(b);
    };
    const over = (fg, bg) => fg.slice(0, 3).map((c, i) => c * fg[3] + bg[i] * (1 - fg[3]));
    done(runs.flatMap((r) => {
      // Outside the photograph there is nothing to read: getImageData hands back
      // transparent black, which scores about 1.19:1 and looks like the worst finding on
      // the page at an element that is perfectly fine. Not measurable is not a failure.
      if (r.x < 0 || r.y < 0 || r.x >= img.width || r.y >= img.height) return [];
      const p = g.getImageData(r.x, r.y, 1, 1).data;
      if (p[3] === 0) return [];
      const ground = [p[0], p[1], p[2]];
      const fg = over(rgb(r.color), ground);
      const [hi, lo] = [lum(fg), lum(ground)].sort((a, b) => b - a);
      return [{ ...r, ratio: +((hi + 0.05) / (lo + 0.05)).toFixed(2) }];
    }));
  };
  img.onerror = () => fail(new Error('the photograph did not decode'));
  img.src = shot;
});

// SVG glyphs are painted with `fill`, which `color: transparent` does not touch - left in,
// they stay visible in the photograph and every one of them scores 1:1 against itself.
// Only text and tspan are cleared; the shapes behind them are the ground and must stay.
const HIDE = "* { color: transparent !important; text-shadow: none !important; caret-color: transparent !important; }"
  + " text, tspan { fill: transparent !important; }";
const measure = async () => {
  const runs = await page.evaluate(RUNS);
  const tag = await page.addStyleTag({ content: HIDE });
  await page.waitForTimeout(120);
  const shot = "data:image/png;base64," + (await page.screenshot()).toString("base64");
  await tag.evaluate((n) => n.remove());
  await page.waitForTimeout(80);
  return page.evaluate(SCORE, [runs, shot]);
};

// A handful of views, so the walk sees more than the landing screen.
const VIEWS = ["Assets & Scope", "Risk Sources", "Strategic Scenarios", "Operational Scenarios",
               "Treatment", "Risk Quantification", "Compliance", "Flow"];
const visit = async () => {
  const seen = [...await measure()];
  for (const v of VIEWS) {
    const tab = page.locator(".ws-tab", { hasText: v }).first();
    if (!(await tab.count())) { console.log(`   (no tab: ${v})`); continue; }
    await tab.click().catch(() => {});
    await page.waitForTimeout(450);
    try { seen.push(...await measure()); }
    catch (e) { console.log(`   (${v}: ${String(e).split("\n")[0]}, url=${page.url().slice(0, 60)})`); }
  }
  return seen;
};

const report = [];
for (const theme of ["dark", "light"]) {
  await page.evaluate((t) => document.documentElement.classList.toggle("light", t === "light"), theme);
  await page.waitForTimeout(350);
  const runs = await visit();
  const bad = runs.filter((r) => r.ratio < r.need);
  // Same colour, same class, same verdict - report it once.
  const groups = new Map();
  for (const b of bad) {
    const k = `${b.color}|${b.cls}`;
    if (!groups.has(k)) groups.set(k, { ...b, n: 0 });
    groups.get(k).n++;
  }
  console.log(`\n── ${theme}: ${runs.length} text runs measured, ${bad.length} below their threshold`);
  for (const g of [...groups.values()].sort((a, b) => a.ratio - b.ratio).slice(0, 16))
    console.log(`   ${String(g.ratio).padStart(5)}:1 need ${g.need}  x${String(g.n).padEnd(3)} ${g.color}  ${g.cls}  "${g.text}"`);
  // The named tokens, called out by name: a palette is moved one token at a time, and a
  // list of call sites does not say which token to move. Resolved through a probe element
  // rather than read as text - `--primary` is written as `var(--teal-bright)`, and comparing
  // authored strings to resolved colours matches nothing at all.
  const tokens = await page.evaluate(() => {
    const names = ["--fg", "--fg-muted", "--fg-subtle", "--color-state-error", "--color-state-warning",
                   "--color-state-success", "--color-state-info", "--color-workshop-1", "--color-workshop-2",
                   "--color-workshop-3", "--color-workshop-4", "--color-workshop-5", "--primary"];
    const probe = document.createElement("span");
    probe.style.display = "none";
    document.body.appendChild(probe);
    const out = {};
    for (const n of names) {
      probe.style.color = `var(${n})`;
      out[getComputedStyle(probe).color.replace(/\s+/g, "")] = n;
    }
    probe.remove();
    return out;
  });
  const worst = new Map();
  for (const r of runs) {
    const n = tokens[r.color.replace(/\s+/g, "")]; if (!n) continue;
    if (!worst.has(n) || worst.get(n).ratio > r.ratio) worst.set(n, { ...r, name: n });
  }
  console.log("   -- by token (worst run each)");
  for (const [n, r] of [...worst.entries()].sort((a, b) => a[1].ratio - b[1].ratio))
    console.log(`   ${String(r.ratio).padStart(5)}:1 need ${r.need}  ${n.padEnd(22)} ${r.cls}  "${r.text}"`);
  report.push({ theme, total: runs.length, bad: bad.length });
  ok(`${theme}: every text run meets its contrast threshold`, bad.length === 0);
}

console.log(`\n${pass}/${pass + fail} contrast assertions passed · ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
