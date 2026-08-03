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
  // Fresh profile → empty dashboard. Documents is reachable even without a study
  // (importing a corpus bootstraps one); the nav must be enabled.
  ok("documents nav enabled without a study", await page.locator(".sidebar .nav-item:not(:disabled)", { hasText: "Documents" }).count() > 0);
  await page.locator(".sidebar .nav-item", { hasText: "Documents" }).click();
  await page.waitForTimeout(150);
  ok("documents import CTA without a study", (await page.locator(".empty", { hasText: "Import a document corpus" }).count()) > 0);
  await page.locator(".sidebar .nav-item", { hasText: "Studies" }).click();
  await page.waitForTimeout(150);
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
    ["Treatment", "Treat: Ransomware via maintenance access"],
    ["Risk Quantification", "Ransomware encryption of clinical systems"],
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
  await page.locator(".tbl tbody tr.row-clickable").first().locator(".name").click();
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

  // Change history (hash-chained audit trail): editing records who/what + verifies
  await page.locator(".detail .btn", { hasText: "Edit" }).first().click();
  await page.waitForSelector(".modal-lg");
  await page.locator('.modal-lg input[placeholder="your name"]').fill("e2e");
  await page.locator('.modal-lg input[placeholder="why this change"]').fill("audit check");
  const _hta = page.locator(".modal-lg textarea").first();
  await _hta.fill((await _hta.inputValue()) + " .");
  await page.locator(".modal-lg .btn.primary", { hasText: "Save" }).click();
  await page.waitForTimeout(200);
  ok("change history button shown after edit", (await page.locator(".hist-btn").count()) > 0);
  ok("change-history integrity verified", (await page.locator(".hist-btn .hist-chain.ok").count()) > 0);
  await page.locator(".hist-btn").click();
  await page.waitForSelector(".modal-lg .hist-item");
  ok("change history popup lists entries", (await page.locator(".modal-lg .hist-item").count()) > 0);
  await page.locator('.modal-lg .btn.ghost[aria-label="Close"]').click();
  await page.waitForTimeout(150);

  // Risk matrix only in WS3; kill-chain builder in WS4
  await page.locator(".ws-tab", { hasText: "Risk Sources" }).click();
  await page.waitForTimeout(200);
  ok("no risk matrix in WS2", (await page.locator(".risk-matrix").count()) === 0);
  await page.locator(".ws-tab", { hasText: "Strategic Scenarios" }).click();
  await page.waitForTimeout(200);
  ok("risk matrix in WS3", (await page.locator(".risk-matrix").count()) > 0);
  // inherent↔residual toggle (fed by WS5 risk treatments)
  ok("risk matrix has residual toggle", await page.locator(".panel:has(.risk-matrix) .seg-btn", { hasText: "Residual" }).count() > 0);
  await page.locator(".panel:has(.risk-matrix) .seg-btn", { hasText: "Residual" }).click();
  await page.waitForTimeout(150);
  ok("residual mode marks treated risks", (await page.locator(".rm-treated").count()) >= 2);
  await page.locator(".panel:has(.risk-matrix) .seg-btn", { hasText: "Inherent" }).click();
  await page.locator(".ws-tab", { hasText: "Operational Scenarios" }).click();
  await page.waitForTimeout(200);
  ok("kill-chain steps table has draggable rows", (await page.locator(".tbl tbody tr.row-drag").count()) > 0);
  // expand the op-scenario row to reveal its embedded kill-chain lane
  await page.locator(".tbl tbody tr.row-clickable").first().locator(".name").click();
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

  // Attack paths: integrated cross-chain projection, a collapsible sub-section of WS4
  await page.locator(".ws-tab", { hasText: "Operational Scenarios" }).click();
  await page.waitForSelector(".ap-head", { timeout: 5000 });
  ok("attack paths is a collapsible WS4 sub-section", (await page.locator(".panel:has(.ap-head) .panel-head h3", { hasText: "Attack paths" }).count()) > 0);
  ok("attack paths collapsed by default", (await page.locator(".ap-graph").count()) === 0);
  await page.locator(".ap-head").click();
  await page.waitForSelector(".ap-graph", { timeout: 5000 });
  await page.locator(".ap-graph").scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  ok("attack paths has a choke-point explanation box", (await page.locator(".ap-note").count()) > 0);
  const apSteps = await page.locator(".ap-node.step").count();
  ok(`attack paths render ${apSteps} step nodes`, apSteps >= 6);
  ok("attack paths reach asset nodes", (await page.locator(".ap-node.asset, .ap-node.biz").count()) >= 2);
  ok("attack paths highlight ≥1 choke point", (await page.locator(".ap-node.choke").count()) >= 1);
  ok("leaf business-asset targets are NOT choke points", (await page.locator(".ap-node.biz.choke").count()) === 0);
  ok("attack paths draw edges", (await page.locator(".ap-edges path").count()) > 10);
  ok("attack paths list per-chain toggle chips", (await page.locator(".ap-chip").count()) >= 2);
  await page.screenshot({ path: `${shots}/AttackPaths.png` });
  // toggling a chain off hides its exclusive nodes
  const apBefore = await page.locator(".ap-node").count();
  await page.locator(".ap-chip").last().click();
  await page.waitForTimeout(250);
  ok("hiding a chain removes nodes", (await page.locator(".ap-node").count()) < apBefore);
  await page.locator(".ap-chip").last().click();
  await page.waitForTimeout(200);
  // clicking a node opens the underlying step/asset
  await page.locator(".ap-node.step", { hasText: "Lateral movement" }).click();
  await page.waitForTimeout(250);
  ok("attack-path node click opens entity popup", (await page.locator(".modal-lg").count()) > 0);
  // B+ predecessors: constrained + grouped candidate list on the kill-chain step editor
  const predGroups = await page.evaluate(() => {
    for (const s of document.querySelectorAll(".modal-lg .multi select")) {
      const gs = [...s.querySelectorAll("optgroup")].map((g) => g.label);
      if (gs.some((l) => /This scenario|Cascade from/.test(l))) {
        const opts = [...s.querySelectorAll("option")].map((o) => o.textContent || "");
        return { intra: gs.includes("This scenario"), cross: gs.some((l) => l.startsWith("Cascade from")),
          offersLaterSameScenario: opts.some((t) => /Exfiltrate patient records|Encrypt the HIS/.test(t)) };
      }
    }
    return null;
  });
  ok("predecessors dropdown groups intra + cross-scenario candidates", !!predGroups && predGroups.intra && predGroups.cross);
  ok("predecessors dropdown hides later same-scenario steps (forward-only)", !!predGroups && predGroups.offersLaterSameScenario === false);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);

  // Quality-checks (completeness linter) view
  await page.locator(".ws-tab", { hasText: "Checks" }).click();
  await page.waitForTimeout(200);
  ok("checks view lists gaps", (await page.locator(".lint-card").count()) > 0);
  ok("uncovered kill-chain step flagged", (await page.locator(".lint-card .lint-title", { hasText: "Kill-chain steps with no security measure" }).count()) > 0);
  await page.screenshot({ path: `${shots}/Checks.png` });

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
  ok("import dialog has paste textarea", (await page.locator(".modal-lg textarea").count()) > 0);
  // Import diff / merge: preview a demo revision → added / changed / removed diff
  await page.locator(".modal-lg button", { hasText: "Preview a demo revision" }).click();
  await page.waitForTimeout(200);
  ok("import diff summary shows counts", (await page.locator(".idiff-summary .idiff-c").count()) >= 3);
  ok("import diff lists entity changes", (await page.locator(".idiff-ent").count()) > 0);
  ok("import diff offers additive + destructive apply", (await page.locator(".modal-lg-foot .import-modes-inline .seg-btn").count()) === 2);
  await page.screenshot({ path: `${shots}/Import.png` });
  await page.locator(".modal-lg-foot .btn.ghost", { hasText: "Back" }).click().catch(() => {});
  await page.waitForTimeout(100);
  await page.locator(".overlay").click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.waitForTimeout(150);

  // Catalog picker (security measures) + semi-deterministic framework import (Documents)
  await page.locator(".ws-tab", { hasText: "Treatment" }).click();
  await page.waitForTimeout(250);
  ok("security-measure catalog picker present", (await page.getByRole("button", { name: /Security Measure/ }).count()) > 0);
  await page.getByRole("button", { name: /Security Measure/ }).first().click();
  await page.waitForTimeout(200);
  ok("measure picker lists the bundled library", (await page.locator(".modal-lg .panel-head h3", { hasText: "Common measures" }).count()) > 0);
  await page.locator('.modal-lg .btn.ghost[aria-label="Close"]').click();
  await page.waitForTimeout(150);
  await page.locator(".sidebar .nav-item", { hasText: "Documents" }).click();
  await page.waitForTimeout(200);
  ok("documents offers framework import", (await page.getByRole("button", { name: /Import framework/ }).count()) > 0);
  await page.getByRole("button", { name: /Import framework/ }).click();
  await page.waitForSelector(".modal-lg");
  await page.locator(".modal-lg .seg-btn", { hasText: /Measure/ }).click().catch(() => {});
  ok("import target toggle switches colour (.seg-btn.on)", (await page.locator(".modal-lg .seg-btn.on", { hasText: /Measure/ }).count()) > 0);
  await page.locator(".modal-lg textarea").fill("Control ID,Requirement,Domain,Guidance\nX-1,Just-in-time admin,Access,Grant admin temporarily\nX-2,Immutable backups,Resilience,Keep an offline copy");
  await page.locator(".modal-lg button", { hasText: "Parse" }).click();
  await page.waitForTimeout(300);
  ok("table import maps columns via header aliases", (await page.locator(".modal-lg .panel-head h3", { hasText: "Map columns" }).count()) > 0);
  ok("import lists parsed rows as a selectable catalog", (await page.locator(".modal-lg .ex-cand").count()) === 2 && (await page.locator(".modal-lg .ex-cand input[type=checkbox]").count()) === 2);
  await page.screenshot({ path: `${shots}/CatalogImport.png` });
  await page.locator(".modal-lg .ex-cand input[type=checkbox]").first().uncheck();
  await page.waitForTimeout(150);
  ok("unchecking an item excludes it (Add 1 selected)", (await page.locator(".modal-lg-foot .btn.primary", { hasText: "Add 1 selected" }).count()) > 0);
  await page.locator(".modal-lg .ex-cand input[type=checkbox]").first().check();
  await page.waitForTimeout(100);
  await page.locator(".modal-lg-foot .btn.primary").click();
  await page.waitForTimeout(300);
  ok("only selected rows are added to the study", (await page.locator(".modal-lg .guide.warn", { hasText: "Added 2 measures" }).count()) > 0);
  ok("added rows re-render as 'in study' in the preview", (await page.locator(".modal-lg .ex-cand .badge", { hasText: "in study" }).count()) >= 1);
  await page.locator('.modal-lg .btn.ghost[aria-label="Close"]').click().catch(() => {});
  await page.waitForTimeout(150);

  // Timeline (global change history) — left-nav view; the sample seeds history
  await page.locator(".sidebar .nav-item", { hasText: "Timeline" }).click();
  await page.waitForTimeout(250);
  ok("timeline grouped by day with entries", (await page.locator(".tl-day-h").count()) > 0 && (await page.locator(".tl-item").count()) >= 5);
  ok("timeline shows change stats", (await page.locator(".tl-stats strong").count()) >= 3);
  await page.screenshot({ path: `${shots}/Timeline.png` });
  await page.locator(".tl-item").first().click();
  await page.waitForSelector(".modal-lg .hist-item");
  ok("timeline item opens change-history popup", (await page.locator(".modal-lg .hist-item").count()) > 0);
  await page.locator('.modal-lg .btn.ghost[aria-label="Close"]').click();
  await page.waitForTimeout(120);
  await page.locator(".sidebar .nav-item", { hasText: "Studies" }).click();
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
