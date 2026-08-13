// Capture real screenshots of the built app (dist/index.html) and present each
// inside a clean browser-window frame on a soft backdrop. Output → docs/.
// Run after `npm run build`:  node scripts/shots.mjs
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const appFile = "file://" + resolve(here, "../dist/index.html");
const outDir = resolve(here, "../docs");
mkdirSync(outDir, { recursive: true });

const W = 1440, H = 900;
const browser = await chromium.launch();
const app = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
const benign = (t) => /aurelian-model\.bin/.test(t) || /scheme "file" is not supported/.test(t);
app.on("console", (m) => { if (m.type() === "error" && !benign(m.text())) console.log("  ! console:", m.text()); });

// A separate page used only to wrap a raw screenshot in a light browser-window chrome.
const framer = await browser.newPage({ viewport: { width: W + 120, height: H + 150 }, deviceScaleFactor: 2 });
const frame = async (buf, name, w = W) => {
  const b64 = buf.toString("base64");
  await framer.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0}
    body{padding:44px 52px;background:
      radial-gradient(1100px 480px at 15% -10%, #e7eef6 0%, transparent 60%),
      radial-gradient(1000px 600px at 105% 115%, #eef0f8 0%, transparent 55%),
      #f4f6fa;display:inline-block}
    .win{width:${w}px;border-radius:14px;overflow:hidden;
      box-shadow:0 30px 70px -24px rgba(30,45,70,.35),0 0 0 1px rgba(30,45,70,.08);background:#fff}
    .bar{height:38px;display:flex;align-items:center;gap:8px;padding:0 14px;
      background:#eef1f5;border-bottom:1px solid rgba(30,45,70,.08)}
    .dot{width:12px;height:12px;border-radius:50%}
    .r{background:#ff5f57}.y{background:#febc2e}.g{background:#28c840}
    .addr{flex:1;text-align:center;font:500 12.5px/1 ui-sans-serif,system-ui,Segoe UI,Roboto;
      color:#5a6b80;letter-spacing:.2px}
    img{display:block;width:${w}px;height:auto}
  </style></head><body>
    <div class="win"><div class="bar"><span class="dot r"></span><span class="dot y"></span>
    <span class="dot g"></span><div class="addr">Aurelian Lite - Structured Cyber Risk Analysis</div></div>
    <img src="data:image/png;base64,${b64}"></div>
  </body></html>`);
  await framer.waitForTimeout(150);
  await framer.locator("body").screenshot({ path: `${outDir}/${name}.png` });
  console.log("  ✓", name + ".png");
};

const tab = async (label, wait = 500) => { await app.locator(".ws-tab", { hasText: label }).click(); await app.waitForTimeout(wait); };
const shot = async (name) => frame(await app.screenshot(), name);
// Frame a single element at its own width (for a self-contained card/panel).
const shotEl = async (sel, name) => {
  const el = app.locator(sel).first();
  await el.scrollIntoViewIfNeeded();
  await app.waitForTimeout(200);
  const box = await el.boundingBox();
  await frame(await el.screenshot(), name, Math.round(box.width));
};

// Frame the region spanning two elements (top → bottom of `botSel`), so a tall
// card can be cropped to just the interesting band before it is window-framed.
const shotClip = async (topSel, botSel, name, padBottom = 16) => {
  const top = await app.locator(topSel).first().boundingBox();
  const bot = await app.locator(botSel).first().boundingBox();
  const x = Math.max(0, Math.round(top.x) - 4);
  const y = Math.max(0, Math.round(top.y) - 14);
  const width = Math.min(W - x, Math.round(Math.max(top.width, bot.width)) + 8);
  const height = Math.round(bot.y + bot.height) - y + padBottom;
  await frame(await app.screenshot({ clip: { x, y, width, height } }), name, width);
};

try {
  await app.goto(appFile);
  await app.waitForSelector("#root .app", { timeout: 10000 });
  await app.getByText("Load sample study").click();
  await app.waitForSelector(".ws-tabs", { timeout: 10000 });
  // Light theme (the app default) — no toggle.

  await tab("Assets & Scope", 600);
  await shot("hero");           // clean entity tables = hero

  await tab("Strategic Scenarios");
  await shot("risk-matrix");

  // Flow: 12 lanes are ~2400px wide, so at a normal viewport less than half is on
  // screen. Widen until the whole board fits, then frame the board itself rather than
  // the window - the point of the picture is the complete set of swimlanes.
  await tab("Flow", 900);
  // Without a selection the board is a set of columns with nothing joining them. Focus
  // the operational scenario that runs through the whole study, so the ribbons connecting
  // its assets, actor, chain steps and measures are drawn - that network is the point.
  // The board is wider than any sensible screenshot. Fitting all twelve lanes in would
  // shrink the cards past reading, so the picture stays at normal width and simply cuts
  // off on the right - the network is legible, which is what it is for.
  await app.setViewportSize({ width: 1980, height: 980 });
  await app.waitForTimeout(500);
  await app.locator(".flow-node", { hasText: "Ransomware encryption" }).first().click();
  await app.waitForTimeout(1000);
  // Left-aligned: the board starts at the business assets and runs off the right edge.
  // Scrolling into the middle cuts BOTH sides, which reads as an arbitrary detail
  // rather than as the beginning of a chain.
  // The board only - selecting opens a detail panel that would take half the picture.
  await shotEl(".flow-scroll", "flow");
  await app.setViewportSize({ width: W, height: H });
  await app.setViewportSize({ width: W, height: H });
  await app.waitForTimeout(300);

  // Coverage overview — the status ring plus the per-tactic coverage tiles,
  // cropped before the defense-in-depth bars.
  // Coverage: the outcome ring and the per-tactic tiles, with one scenario's
  // defence-in-depth bars opened underneath - the bars are what show WHERE on a chain
  // the cover sits, and a ring alone does not.
  await tab("Treatment", 700);
  await app.setViewportSize({ width: 1360, height: 1500 });
  await app.evaluate(() => window.scrollTo(0, 0));
  await app.waitForTimeout(400);
  await app.locator(".dd-scn-h").first().click();
  await app.waitForTimeout(500);
  await shotClip(".panel:has(.mc-ring) .panel-head", ".dd-steps", "coverage", 14);
  await app.setViewportSize({ width: W, height: H });

  // Monte-Carlo risk quantification — the annual-loss headline, the distribution with
  // vs without controls, and where the attempts on the chain are stopped. A clip is
  // taken within the viewport, so it has to be tall enough for the whole card.
  // Attack paths: every kill chain of the study projected onto the assets it converges
  // on. Chains start hidden, so they are switched on to make the choke points appear.
  await tab("Operational Scenarios", 800);
  const chips = app.locator(".ap-chip");
  for (let i = 0; i < await chips.count(); i++) { await chips.nth(i).click(); await app.waitForTimeout(250); }
  await app.waitForTimeout(500);
  // The graph scrolls: the asset column the chains converge on - and with it the choke
  // point the badge promises - sits off screen at a normal width. Widen until it fits.
  const apNeed = await app.evaluate(() => {
    const sc = document.querySelector(".ap-scroll");
    return Math.ceil(sc.scrollWidth + (window.innerWidth - sc.clientWidth) + 24);
  });
  await app.setViewportSize({ width: Math.max(W, apNeed), height: 1100 });
  await app.waitForTimeout(700);
  await shotEl(".panel:has(.ap-head)", "attack-paths");
  await app.setViewportSize({ width: W, height: H });
  await app.waitForTimeout(300);

  await tab("Risk Quantification", 800);
  await app.setViewportSize({ width: W, height: 1400 });
  await app.evaluate(() => window.scrollTo(0, 0));
  await app.waitForTimeout(400);
  // Show the inherent side: without controls the loss distribution is a full, rounded
  // curve, where the residual one is flattened against the axis because most years
  // carry no loss at all. The picture is about the shape of a loss distribution.
  await app.locator(".seg-btn", { hasText: "Inherent" }).first().click();
  await app.waitForTimeout(1200);
  await shotClip(".qt-top", ".qt-dist", "quant", 2);   // tight: the factor tree starts right below
  await app.setViewportSize({ width: W, height: H });
} catch (e) {
  console.log("screenshot run failed:", e?.message ?? e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
