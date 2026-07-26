// Self-contained headless verification of the PORTABLE build (no extension).
// Loads dist/index.html over file://, loads the sample study, walks every
// workshop tab + the graph, and asserts the data view renders. Screenshots
// go to /tmp/ebios-e2e/. Exits non-zero on any console error or failed check.
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const file = "file://" + resolve(here, "../dist/index.html");
const shots = "/tmp/ebios-e2e";
mkdirSync(shots, { recursive: true });

const errors = [];
const checks = [];
const ok = (name, cond) => { checks.push({ name, cond }); console.log(`${cond ? "✓" : "✗"} ${name}`); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
// The model-file auto-detect fetch is expected to fail on Chromium file:// (it
// blocks local fetches) — tryLoadLocalPack catches it and falls back. Benign.
const benign = (t) => /aurelian-model\.bin/.test(t) || /scheme "file" is not supported/.test(t);
page.on("console", (m) => { if (m.type() === "error" && !benign(m.text())) errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

try {
  await page.goto(file);
  await page.waitForSelector("#root .app", { timeout: 10000 });
  // Fresh profile → empty dashboard, no active study → Documents is study-scoped.
  ok("documents nav disabled without a study", await page.locator(".sidebar .nav-item:disabled", { hasText: "Documents" }).count() > 0);
  await page.getByText("Load sample study").click();
  await page.waitForSelector(".ws-tabs", { timeout: 10000 });

  const title = await page.locator(".topbar .title").first().textContent();
  ok("sample study opened", !!title && title.includes("Riverside"));

  const tabExpect = [
    ["Foundation", "Patient records"],
    ["Risk Sources", "Ransomware group"],
    ["Strategic Scenarios", "Ransomware via maintenance access"],
    ["Operational Scenarios", "Phishing the maintenance provider"],
    ["Treatment", "MFA on remote maintenance access"],
    ["Risk Quantification", "clinical ransomware outage"],
  ];
  for (const [tab, needle] of tabExpect) {
    await page.locator(".ws-tab", { hasText: tab }).click();
    await page.waitForTimeout(250);
    const body = await page.locator(".content").innerText();
    ok(`${tab} → shows "${needle}"`, body.includes(needle));
    await page.screenshot({ path: `${shots}/${tab.replace(/\W+/g, "_")}.png` });
  }

  // Row click expands inline detail; clicking a linked item opens the popup
  await page.locator(".ws-tab", { hasText: "Foundation" }).click();
  await page.waitForTimeout(200);
  await page.locator(".tbl tbody tr.row-clickable").first().click();
  await page.waitForTimeout(200);
  ok("row expands inline detail", await page.locator(".detail").count() > 0);
  await page.screenshot({ path: `${shots}/RowDetail.png` });
  const link = page.locator(".detail .chip.link").first();
  if (await link.count()) await link.click();
  await page.waitForTimeout(250);
  ok("linked item opens popup", await page.locator(".modal-lg").count() > 0);
  ok("popup has editable fields", await page.locator(".modal-lg .form-grid input").count() > 0);
  await page.screenshot({ path: `${shots}/EntityModal.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);

  // Risk matrix only in WS3; kill-chain builder in WS4
  await page.locator(".ws-tab", { hasText: "Risk Sources" }).click();
  await page.waitForTimeout(200);
  ok("no risk matrix in WS2", (await page.locator(".risk-matrix").count()) === 0);
  await page.locator(".ws-tab", { hasText: "Strategic Scenarios" }).click();
  await page.waitForTimeout(200);
  ok("risk matrix in WS3", (await page.locator(".risk-matrix").count()) > 0);
  await page.locator(".ws-tab", { hasText: "Operational Scenarios" }).click();
  await page.waitForTimeout(200);
  ok("kill-chain steps table has draggable rows", (await page.locator(".tbl tbody tr.row-drag").count()) > 0);
  // expand the op-scenario row to reveal its embedded kill-chain lane
  await page.locator(".tbl tbody tr.row-clickable").first().click();
  await page.waitForTimeout(250);
  ok("kill-chain tiles inside op-scenario row", (await page.locator(".kc-tile").count()) > 5);
  ok("kill-chain steps placed on tiles", (await page.locator(".kc-tile .kc-step").count()) > 0);
  await page.screenshot({ path: `${shots}/KillChain.png` });

  // Graph
  await page.locator(".ws-tab", { hasText: "Graph" }).click();
  await page.waitForTimeout(900);
  const nodes = await page.locator(".graph-wrap svg circle").count();
  ok(`graph rendered ${nodes} nodes`, nodes > 15);
  // relationship edge labels
  ok('edge labels rendered', await page.locator('.graph-wrap svg text', { hasText: 'supports' }).count() > 0);
  await page.screenshot({ path: `${shots}/Graph.png` });
  // click-to-info widget
  await page.locator('.graph-wrap svg g circle').first().click();
  await page.waitForTimeout(300);
  ok('node click docks info panel under the graph', await page.locator('.detail-dock .info-panel .ip-title').count() > 0);
  await page.screenshot({ path: `${shots}/GraphInfo.png` });

  // Copy-for-LLM button present on a workshop
  await page.locator(".ws-tab", { hasText: "Foundation" }).click();
  await page.waitForTimeout(150);
  ok("copy-for-LLM button present", await page.locator(".group-toolbar button", { hasText: "Copy for LLM" }).count() > 0);

  // Flow (event-flow swimlane)
  await page.locator(".ws-tab", { hasText: "Flow" }).click();
  await page.waitForTimeout(300);
  ok("flow lanes present", await page.locator(".flow-lane").count() > 5);
  ok("flow nodes present", await page.locator(".flow-node").count() > 5);
  await page.screenshot({ path: `${shots}/Flow.png` });
  await page.locator(".flow-node").filter({ hasText: "Ransomware encryption" }).first().click({ force: true });
  await page.waitForTimeout(600);
  ok("flow highlights path (dims others)", await page.locator(".flow-node.ef-dimmed, .flow-node.ef-orphan").count() > 0);
  ok("flow lane headers fly with their columns", await page.locator(".lane-header.ef-lane-flown").count() > 0);
  ok("flow docks info panel under the flow", await page.locator(".detail-dock .info-panel .ip-title").count() > 0);
  ok("ribbon paths drawn", await page.locator(".ribbons path").evaluateAll((ps) => ps.some((p) => (p.getAttribute("d") || "").length > 5)));
  await page.screenshot({ path: `${shots}/FlowPath.png` });
  // multi-select: add another node on the same chain → narrows scope
  await page.locator(".flow-node").filter({ hasText: "Ransomware group" }).first().click({ force: true });
  await page.waitForTimeout(400);
  ok("multi-select keeps ≥2 selected", await page.locator(".flow-node.selected").count() >= 2);
  await page.screenshot({ path: `${shots}/FlowNarrow.png` });
  // robustness: a non-scenario node still shows connections + free multi-select
  await page.getByText(/^Clear \(/).click({ force: true });
  await page.waitForTimeout(200);
  await page.locator(".flow-node").filter({ hasText: "Patient records" }).first().click({ force: true });
  await page.waitForTimeout(300);
  ok("non-scenario node shows ribbons", await page.locator(".ribbons path").evaluateAll((ps) => ps.some((p) => (p.getAttribute("d") || "").length > 5)));
  await page.locator(".flow-node").filter({ hasText: "Nursing staff" }).first().click({ force: true });
  await page.waitForTimeout(200);
  ok("free multi-select works", await page.locator(".flow-node.selected").count() >= 2);
  await page.screenshot({ path: `${shots}/FlowOrphan.png` });

  // Import dialog: additive/destructive + paste source
  await page.locator(".topbar button", { hasText: "Export / Import" }).click();
  await page.waitForTimeout(150);
  await page.locator(".menu-item", { hasText: "Import data" }).click();
  await page.waitForTimeout(200);
  ok("import dialog offers additive + destructive", (await page.locator(".import-mode").count()) === 2);
  ok("import dialog has paste textarea", (await page.locator(".modal-lg textarea").count()) > 0);
  await page.screenshot({ path: `${shots}/Import.png` });
  await page.locator(".overlay").click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.waitForTimeout(150);

  // Taxonomy view
  await page.locator(".sidebar .nav-item", { hasText: "Taxonomy" }).click();
  await page.waitForTimeout(250);
  const taxBody = await page.locator(".content").innerText();
  ok("taxonomy lists entity types", taxBody.includes("Business Asset") && taxBody.includes("Kill-chain Step"));
  await page.screenshot({ path: `${shots}/Taxonomy.png` });

  // Documents section
  await page.locator(".sidebar .nav-item", { hasText: "Documents" }).click();
  await page.waitForTimeout(200);
  const docBody = await page.locator(".content").innerText();
  ok("documents section renders", docBody.includes("Documents") && docBody.toLowerCase().includes("reference"));
  await page.screenshot({ path: `${shots}/Documents.png` });

  // Extraction dialog (UI only — the model download needs network)
  await page.locator(".page-head button", { hasText: "Extract" }).click();
  await page.waitForTimeout(200);
  ok("extraction dialog opens", (await page.locator(".overlay .modal-lg").count()) > 0);
  ok("extraction defers model loading to the Model section", (await page.locator(".modal-lg", { hasText: "managed in the" }).count()) > 0);
  ok("extract disabled until a model is loaded", await page.locator(".modal-lg button", { hasText: "Extract" }).isDisabled());
  await page.screenshot({ path: `${shots}/Extraction.png` });
  await page.keyboard.press("Escape").catch(() => {});
  await page.locator(".overlay").click({ position: { x: 5, y: 5 } }).catch(() => {});

  // Model configuration section
  await page.locator(".sidebar .nav-item", { hasText: "Model" }).click();
  await page.waitForTimeout(200);
  const modelBody = await page.locator(".content").innerText();
  ok("model section renders", modelBody.includes("Model") && modelBody.includes("all-MiniLM"));
  ok("model section lists embedding options", (await page.locator(".model-row").count()) >= 2);
  ok("model section is embedding-only (no language model)", !modelBody.includes("Language model") && !modelBody.includes("SmolLM2") && !modelBody.includes("Qwen2.5"));
  await page.screenshot({ path: `${shots}/Model.png` });
} catch (e) {
  errors.push("exception: " + (e?.message ?? String(e)));
} finally {
  await browser.close();
}

const failed = checks.filter((c) => !c.cond).length;
if (errors.length) { console.log("\nConsole/page errors:"); errors.forEach((e) => console.log("  ! " + e)); }
console.log(`\n${checks.length - failed}/${checks.length} checks passed · ${errors.length} errors · shots in ${shots}`);
process.exit(failed || errors.length ? 1 : 0);
