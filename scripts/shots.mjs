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
const frame = async (buf, name) => {
  const b64 = buf.toString("base64");
  await framer.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0}
    body{padding:44px 52px;background:
      radial-gradient(1100px 480px at 15% -10%, #e7eef6 0%, transparent 60%),
      radial-gradient(1000px 600px at 105% 115%, #eef0f8 0%, transparent 55%),
      #f4f6fa;display:inline-block}
    .win{width:${W}px;border-radius:14px;overflow:hidden;
      box-shadow:0 30px 70px -24px rgba(30,45,70,.35),0 0 0 1px rgba(30,45,70,.08);background:#fff}
    .bar{height:38px;display:flex;align-items:center;gap:8px;padding:0 14px;
      background:#eef1f5;border-bottom:1px solid rgba(30,45,70,.08)}
    .dot{width:12px;height:12px;border-radius:50%}
    .r{background:#ff5f57}.y{background:#febc2e}.g{background:#28c840}
    .addr{flex:1;text-align:center;font:500 12.5px/1 ui-sans-serif,system-ui,Segoe UI,Roboto;
      color:#5a6b80;letter-spacing:.2px}
    img{display:block;width:${W}px;height:auto}
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
} catch (e) {
  console.log("screenshot run failed:", e?.message ?? e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
