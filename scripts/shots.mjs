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
const shotClip = async (topSel, botSel, name) => {
  const top = await app.locator(topSel).first().boundingBox();
  const bot = await app.locator(botSel).first().boundingBox();
  const x = Math.max(0, Math.round(top.x) - 4);
  const y = Math.max(0, Math.round(top.y) - 14);
  const width = Math.min(W - x, Math.round(Math.max(top.width, bot.width)) + 8);
  const height = Math.round(bot.y + bot.height) - y + 16;
  await frame(await app.screenshot({ clip: { x, y, width, height } }), name, width);
};

try {
  await app.goto(appFile);
  await app.waitForSelector("#root .app", { timeout: 10000 });
  await app.getByText("Load sample study").click();
  await app.waitForSelector(".ws-tabs", { timeout: 10000 });
  // Light theme (the app default) — no toggle.

  await tab("Foundation", 600);
  await shot("hero");           // clean entity tables = hero

  await tab("Strategic Scenarios");
  await shot("risk-matrix");

  await tab("Flow", 900);
  // No node selected → full swimlane overview, no occluding detail panel, so the
  // most cards/elements are visible.
  await shot("flow");

  // Coverage overview — the status ring plus the per-tactic coverage tiles,
  // cropped before the defense-in-depth bars.
  await tab("Treatment", 700);
  await app.setViewportSize({ width: 1360, height: 1000 });
  await app.evaluate(() => window.scrollTo(0, 0));
  await app.waitForTimeout(300);
  await shotClip(".panel:has(.mc-ring) .panel-head", ".panel:has(.mc-ring) .mc-body", "coverage");
  await app.setViewportSize({ width: W, height: H });

  // Monte-Carlo risk quantification — frame just the loss-distribution card so the
  // curve (with vs without controls) and the annual-loss headline read clearly.
  await tab("Risk Quantification", 800);
  await shotClip(".qt-top", ".qt-dist", "quant");
} catch (e) {
  console.log("screenshot run failed:", e?.message ?? e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
