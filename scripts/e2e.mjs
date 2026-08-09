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
    ["Assets & Scope", "Patient records"],
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

  // Quantification: the chain traversal has to be visible, not just computed. The view
  // must show where attempts are stopped, and the factor popup must explain the model
  // that is actually running (baseline + per-step hurdles), not the old averaged one.
  await page.locator(".ws-tab", { hasText: "Risk Quantification" }).click();
  await page.waitForSelector(".qt-break-bar", { timeout: 15000 });
  ok("quantification shows where attempts are stopped", (await page.locator(".qt-break-bar .qt-break-seg").count()) >= 2);
  const qb = await page.locator(".qt-break").innerText();
  ok("the breakdown says what the percentages are shares OF", /out of every 100 attacks/i.test(qb));
  ok("the share that gets through is called out", /reach the objective/i.test(await page.locator(".qb-row.through").innerText()));
  ok("each stopping point is a row that says what happened", (await page.locator(".qb-rows .qb-row").count()) >= 2
    && /stopped at/i.test(qb));
  await page.locator(".qt-break").scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${shots}/QuantChain.png` });
  await page.locator(".qt-break-trace").click();
  await page.waitForSelector(".ft-card", { timeout: 5000 });
  const ft = await page.locator(".ft-card").innerText();
  ok("the factor popup shows what the attack itself demands, term by term",
    /what the attack demands/i.test(ft) && /getting in/i.test(ft) && /tooling/i.test(ft));
  ok("...and says how many distinct tactics the chain spans", /spans \d+ distinct tactic/i.test(ft));
  ok("...and no longer presents it as a rated difficulty", !/difficulty = /i.test(ft));
  ok("the factor popup states that undefended steps are free", /never makes it look safer/i.test(ft));
  ok("the factor popup walks the chain step by step", (await page.locator(".ft-card .ft-step").count()) >= 3);
  ok("resisting steps show their hurdle", (await page.locator(".ft-card .ft-step-c .ok").count()) >= 1);
  ok("watched steps show the chance of being caught", (await page.locator(".ft-card .ft-step-c .watch").count()) >= 1);
  ok("measures on the chain show their effect class", (await page.locator(".ft-card .ft-cls").count()) >= 1);
  ok("the chain distinguishes resisting from detecting measures",
    /PREVENTIVE/i.test(ft) && /DETECTIVE/i.test(ft));
  ok("the popup no longer describes the retired averaged model", !/avg implementation|steps mitigated/i.test(ft));
  // A rare event is not a zero event: rates below 1/yr used to render as "0.0/yr", which
  // made the whole chain read as "0 x €8.7M = €274k".
  const path = await page.locator(".ft-card .ft-calc-path").innerText();
  ok("small frequencies keep their significant digits", !/\b0\.0\/yr/.test(path) && /0\.\d+\/yr/.test(path));
  ok("the loss frequency is also given as a return period", /one loss event every \d+ years/i.test(path));
  await page.screenshot({ path: `${shots}/QuantFactorTrace.png` });
  await page.locator('.ft-card button[aria-label="Close"]').click();
  await page.waitForTimeout(150);

  // Row click expands inline detail; clicking a linked item opens the popup
  await page.locator(".ws-tab", { hasText: "Assets & Scope" }).click();
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

  // Graph — focus / ego-network (a centred node + its direct neighbours)
  await page.locator(".ws-tab", { hasText: "Graph" }).click();
  await page.waitForTimeout(700);
  ok('focus graph index lists all entities grouped', (await page.locator('.graph-index .gi-group').count()) > 1 && (await page.locator('.graph-index .gi-e').count()) > 5);
  ok('focus graph names the current focus', (await page.locator('.graph-index .gi-e.active').count()) === 1 && (await page.locator('.graph-legend b').count()) > 0);
  ok('focus graph shows centre + neighbour labels', (await page.locator('.graph-wrap svg text').count()) > 5);
  ok('focus graph draws directional edges', (await page.locator('.graph-wrap svg line[marker-end], .graph-wrap svg line[marker-start]').count()) > 3);
  await page.screenshot({ path: `${shots}/Graph.png` });
  // no node clicked yet → no detail box on the default view
  ok('no detail box until a node is clicked', (await page.locator('.detail-dock').count()) === 0);
  // search filters the index; focusing FROM the index must NOT open the detail box
  await page.locator('.graph-search').fill('Patient records');
  await page.waitForTimeout(200);
  ok('focus graph search filters the index', (await page.locator('.graph-index .gi-list .gi-e').count()) > 0);
  await page.locator('.graph-index .gi-list .gi-e').first().click();
  await page.waitForTimeout(250);
  ok('focusing from the index shows no detail box', (await page.locator('.detail-dock').count()) === 0);
  // clicking a NODE inspects it: the box appears, with a ring, WITHOUT moving the focus
  const legendBefore = (await page.locator('.graph-legend').first().innerText()).trim();
  await page.locator('.graph-wrap svg g[transform^="translate"]').first().locator('circle,rect,path').first().click();
  await page.waitForTimeout(200);
  ok('clicking a node opens the box (inspect) without re-centring',
    (await page.locator('.detail-dock .info-panel .ip-title').count()) > 0
    && (await page.locator('.graph-wrap svg circle[stroke-dasharray]').count()) > 0
    && ((await page.locator('.graph-legend').first().innerText()).trim() === legendBefore));
  await page.screenshot({ path: `${shots}/GraphInfo.png` });
  // the detail box close button hides it again
  await page.locator('.detail-dock .info-panel button[aria-label="Close"]').click();
  await page.waitForTimeout(150);
  ok('detail box close button hides the dock', (await page.locator('.detail-dock').count()) === 0);
  // Shift-click builds a multi-focus selection (index clicks still open no box); "Clear extra" collapses back
  await page.locator('.graph-search').fill('');
  await page.waitForTimeout(150);
  await page.locator('.graph-index .gi-e').nth(1).click({ modifiers: ['Shift'] });
  await page.waitForTimeout(200);
  ok('shift-click builds a multi-focus selection', (await page.locator('.graph-index .gi-e.active').count()) >= 2 && (await page.locator('.graph-legend', { hasText: 'focuses' }).count()) > 0 && (await page.locator('.detail-dock').count()) === 0);
  await page.locator('.graph-index .gi-e').nth(3).click({ modifiers: ['Shift'] });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${shots}/GraphMulti.png` });
  await page.locator('.graph-legend button', { hasText: 'Clear extra' }).click();
  await page.waitForTimeout(150);
  ok('clear extra returns to a single focus', (await page.locator('.graph-index .gi-e.active').count()) === 1);

  // Attack paths: integrated cross-chain projection, a collapsible sub-section of WS4
  await page.locator(".ws-tab", { hasText: "Operational Scenarios" }).click();
  await page.waitForSelector(".ap-toolbar", { timeout: 5000 });
  ok("attack paths is a WS4 sub-section", (await page.locator(".panel:has(.ap-head) .panel-head h3", { hasText: "Attack paths" }).count()) > 0);
  ok("attack paths expanded by default with scenarios hidden", (await page.locator(".ap-body .empty").count()) > 0 && (await page.locator(".ap-chip.off").count()) >= 2 && (await page.locator(".ap-graph").count()) === 0);
  for (const c of await page.locator(".ap-chip").all()) await c.click(); // toggle every scenario on
  await page.waitForSelector(".ap-graph", { timeout: 5000 });
  await page.locator(".ap-graph").scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  ok("attack paths has a choke-point explanation box", (await page.locator(".ap-note").count()) > 0);
  const apSteps = await page.locator(".ap-node.step").count();
  ok(`attack paths render ${apSteps} step nodes`, apSteps >= 6);
  ok("attack paths reach asset nodes", (await page.locator(".ap-node.asset, .ap-node.biz").count()) >= 2);
  ok("assets sit in a dedicated target zone", (await page.locator(".ap-zone-label").count()) > 0);
  ok("attack paths highlight ≥1 choke point", (await page.locator(".ap-node.choke").count()) >= 1);
  ok("leaf business-asset targets are NOT choke points", (await page.locator(".ap-node.biz.choke").count()) === 0);
  ok("attack paths draw edges", (await page.locator(".ap-edges path").count()) > 10);
  ok("attack paths list per-chain toggle chips", (await page.locator(".ap-chip").count()) >= 2);
  await page.screenshot({ path: `${shots}/AttackPaths.png` });
  // toggling a scenario off removes its nodes
  const apBefore = await page.locator(".ap-node").count();
  await page.locator(".ap-chip").last().click();
  await page.waitForTimeout(250);
  ok("toggling a scenario off removes its nodes", (await page.locator(".ap-node").count()) < apBefore);
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
  // Effect classification: the linter surfaces measures whose effect class is unset
  // (they would be quantified as preventive by default). The sample leaves none, so
  // the rule has to show up among the PASSING checks, not the failing ones.
  ok("effect-class check passes on the sample", (await page.locator(".lint-pass", { hasText: "Security measures with no effect class" }).count()) > 0);
  ok("effect-class check is not failing", (await page.locator(".lint-card .lint-title", { hasText: "Security measures with no effect class" }).count()) === 0);
  // Model-aware rules: a chain can be fully "covered" and still stop nobody. The sample's
  // insider chain is watched but never barred, which the quantification confirms.
  const dOnly = page.locator(".lint-card:has(.lint-title:text-is('Kill chains defended by detection alone'))");
  ok("detection-only chains are flagged as a high finding", (await dOnly.count()) === 1
    && /high/i.test(await dOnly.locator(".lint-sev").innerText()));
  ok("...and it names the insider chain", /Insider exfiltration/i.test(await dOnly.innerText()));
  ok("monitored chains with nothing to respond with are flagged",
    (await page.locator(".lint-card .lint-title", { hasText: "Monitored chains with no way to respond" }).count()) === 1);
  ok("the checks cover the effect model, not just missing links",
    (await page.locator(".lint-card, .lint-pass").count()) >= 16);
  await page.screenshot({ path: `${shots}/Checks.png` });

  // Copy-for-LLM button present on a workshop
  await page.locator(".ws-tab", { hasText: "Assets & Scope" }).click();
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
  await page.keyboard.press("Escape"); // Escape clears the selection
  await page.waitForTimeout(200);
  ok("Escape clears the flow selection", (await page.locator(".flow-node.selected").count()) === 0);
  await page.locator(".flow-node").filter({ hasText: "Ransomware group" }).first().click({ force: true });
  await page.waitForTimeout(300);
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
  ok("a sound incoming file is vouched for before it is confirmed",
    /change log is complete and matches its data/i.test(await page.locator(".modal-lg").innerText()));
  // A file whose chain does not hold up must say so BEFORE it is confirmed - confirming
  // re-establishes the chain, so a blind confirmation would launder a tampered file.
  await page.locator(".modal-lg-foot .btn.ghost", { hasText: "Back" }).click().catch(() => {});
  await page.waitForTimeout(200);
  await page.locator(".modal-lg textarea").first().fill(JSON.stringify({
    kind: "ebios-data", version: 2, studies: [{
      id: "peer-study", name: "Peer review copy", organization: "", scope: "",
      createdAt: "2026-02-01T10:00:00.000Z", updatedAt: "2026-02-01T10:00:00.000Z",
      entities: [{ id: "x1", type: "business_asset", values: { name: "Payroll", criticality: 3 },
        createdAt: "2026-02-01T10:00:00.000Z", updatedAt: "2026-02-01T10:00:00.000Z" }],
      log: [{ seq: 1, ts: "2026-02-01T10:00:00.000Z", editor: "Analyst X", kind: "create", entity: "x1",
        entityType: "business_asset", title: "Payroll", state: "deadbeef", prevHash: "", hash: "not-a-real-hash" }],
    }],
  }));
  await page.locator(".modal-lg button", { hasText: "Preview pasted" }).click();
  await page.waitForTimeout(400);
  const audit = await page.locator(".modal-lg .guide.warn").first().innerText();
  ok("a tampered incoming file is flagged before confirmation", /does not hold up/i.test(audit));
  ok("...naming where the chain fails", /broken at entry 1/i.test(audit));
  ok("...and stating what the chosen mode does with the chain", /folded into this study's chain/i.test(audit));
  // The verdict must be there in BOTH modes, and say what each one does.
  await page.locator(".import-modes-inline .seg-btn", { hasText: "Destructive" }).click();
  await page.waitForTimeout(200);
  const destr = await page.locator(".modal-lg .guide.warn").first().innerText();
  ok("the chain verdict is shown for a destructive import too", /does not hold up/i.test(destr));
  ok("...saying the study's own chain is kept and continues", /own chain is kept and continues/i.test(destr));
  ok("...and that missing records become deletions", /recorded as deletions/i.test(destr));
  await page.locator(".import-modes-inline .seg-btn", { hasText: "Additive" }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${shots}/ImportAudit.png` });
  await page.locator(".modal-lg-foot .btn.ghost", { hasText: "Back" }).click().catch(() => {});
  await page.waitForTimeout(200);
  await page.locator(".modal-lg button", { hasText: "Preview a demo revision" }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${shots}/Import.png` });
  await page.locator(".modal-lg-foot .btn.ghost", { hasText: "Back" }).click().catch(() => {});
  await page.waitForTimeout(100);
  await page.locator(".overlay").click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.waitForTimeout(150);

  // Treatment analytics must speak the model's language: an outcome ring (resisted /
  // caught / through) instead of an averaged "coverage" figure, and a chain counted as
  // defended only where something actually resists or watches.
  await page.locator(".ws-tab", { hasText: "Treatment" }).click();
  await page.waitForSelector(".mc-ring", { timeout: 15000 });
  const mc = await page.locator(".panel:has(.mc-ring)").innerText();
  ok("treatment shows what becomes of an attempt", /blocked/i.test(mc) && /detected in time/i.test(mc) && /reaches the objective/i.test(mc));
  ok("the ring counts attempts, not coverage", /attempts stopped/i.test(mc) && !/residual gap/i.test(mc));
  ok("the ring says how many steps block and how many detect", /steps block an attacker/i.test(mc) && /detect him/i.test(mc));
  ok("kill-chain mitigation counts defended steps, not merely covered ones",
    (await page.locator(".tbl .badge", { hasText: /\d+\/\d+ defended/ }).count()) > 0);
  ok("the tactic heatmap carries a colour key", (await page.locator(".hm-key .hm-key-bar i").count()) >= 4);
  ok("the heatmap scrolls instead of clipping its columns", (await page.locator(".hm-scroll").count()) > 0);
  await page.locator(".mc-ring").scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${shots}/ChainDefence.png` });
  // Every percentage has to be able to explain itself.
  await page.locator("button.hm-cell").first().click();
  await page.waitForSelector(".ft-card", { timeout: 5000 });
  const tp = await page.locator(".ft-card").innerText();
  ok("a heatmap tile shows the working as a calculation", (await page.locator(".ft-card .tx-formula").count()) === 1
    && /average of \d+ step/i.test(tp));
  ok("the explanation lists the steps that go into the average", (await page.locator(".ft-card .tx-row").count()) >= 2);
  ok("the explanation says which classes are not counted", /corrective, deterrent and avoidance measures are not counted/i.test(tp));
  // Saying only what those classes DON'T do left the analyst none the wiser, and "they act
  // elsewhere" named no place. The text has to say WHICH factor each of them acts on.
  ok("the explanation names the factor each excluded class acts on",
    /act on .{0,12}the loss/i.test(tp) && /damage control/i.test(tp) && /the number of attacks/i.test(tp));
  ok("the explanation says they still count towards the risk", /both move the risk figures/i.test(tp));
  ok("the explanation separates being defended from being safe", /how consistently the tactic's steps are defended/i.test(tp));
  await page.screenshot({ path: `${shots}/TacticExplain.png` });
  await page.locator('.ft-card button[aria-label="Close"]').click();
  await page.waitForTimeout(150);

  // Catalog picker (security measures) + semi-deterministic framework import (Documents)
  await page.waitForTimeout(250);
  // Measures act through different channels; the sample exercises the two that sit at
  // the ends of the chain (deterrence on the attempt, avoidance on the exposure).
  ok("sample carries a deterrent measure", (await page.locator(".tbl .name", { hasText: "Audited access with published monitoring notice" }).count()) > 0);
  ok("sample carries an avoidance measure", (await page.locator(".tbl .name", { hasText: "Decommission the legacy maintenance gateway" }).count()) > 0);
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
  // The log has to account for the WHOLE study, not just the records someone happened to
  // annotate - otherwise the untracked ones read as having been added from outside.
  const tlItems = await page.locator(".tl-item").count();
  ok("every record in the study is accounted for in the log", tlItems >= 55);
  ok("the study log verifies as a whole", /integrity verified/i.test(await page.locator(".tl-stats").innerText()));
  ok("no drift warning on an untouched sample", (await page.locator(".tl-warn").count()) === 0);
  await page.screenshot({ path: `${shots}/Timeline.png` });
  await page.locator(".tl-item").first().click();
  await page.waitForSelector(".modal-lg .hist-item");
  ok("timeline item opens change-history popup", (await page.locator(".modal-lg .hist-item").count()) > 0);
  await page.locator('.modal-lg .btn.ghost[aria-label="Close"]').click();
  await page.waitForTimeout(120);

  // A deletion has to survive the record it removed: the entry outlives it, keeps its
  // title, and shows up in the timeline. Delete a leaf type nothing else depends on.
  await page.locator(".sidebar .nav-item", { hasText: "Studies" }).click();
  await page.waitForTimeout(150);
  // "Studies" lands on the dashboard - re-open the study to get the workshop tabs back.
  if (!(await page.locator(".ws-tabs").count())) {
    await page.getByText("Riverside General Hospital").first().click();
    await page.waitForSelector(".ws-tabs", { timeout: 10000 });
  }
  await page.locator(".ws-tab", { hasText: "Compliance" }).click();
  await page.waitForTimeout(250);
  const reqRow = page.locator(".tbl tbody tr.row-clickable").first();
  const reqName = (await reqRow.locator(".name").innerText()).trim();
  await reqRow.click();
  await page.waitForTimeout(200);
  page.once("dialog", (d) => d.accept());
  await page.locator(".detail-actions button", { hasText: "Delete" }).first().click();
  await page.waitForTimeout(300);
  ok("the deleted record is gone from its table",
    (await page.locator(".tbl .name", { hasText: reqName }).count()) === 0);
  await page.locator(".sidebar .nav-item", { hasText: "Timeline" }).click();
  await page.waitForTimeout(300);
  ok("the deletion is recorded in the timeline", (await page.locator(".tl-kind.del").count()) >= 1);
  ok("...naming the record that no longer exists",
    (await page.locator(".tl-item.tl-gone").first().innerText()).includes(reqName));
  ok("the log still verifies after a deletion", /integrity verified/i.test(await page.locator(".tl-stats").innerText())
    && (await page.locator(".tl-warn").count()) === 0);
  await page.screenshot({ path: `${shots}/TimelineDelete.png` });
  await page.locator(".sidebar .nav-item", { hasText: "Studies" }).click();
  await page.waitForTimeout(150);

  // Taxonomy view
  await page.locator(".sidebar .nav-item", { hasText: "Taxonomy" }).click();
  await page.waitForTimeout(250);
  const taxBody = await page.locator(".content").innerText();
  ok("taxonomy lists entity types", taxBody.includes("Business Asset") && taxBody.includes("Kill-chain Step"));
  await page.screenshot({ path: `${shots}/Taxonomy.png` });

  // Calibration - now a section of the quantification workshop rather than its own
  // page, because it is an input to this study like any other. Has to be inspectable,
  // editable, resettable and persistent.
  await page.locator(".sidebar .nav-item", { hasText: "Studies" }).click();
  await page.waitForTimeout(300);
  if (!(await page.locator(".ws-tabs").count())) {
    await page.locator(".study-card, .card").first().click();
    await page.waitForTimeout(400);
  }
  await page.locator(".ws-tab", { hasText: "Quantification" }).click();
  await page.waitForTimeout(400);
  ok("calibration sits in the quantification workshop", (await page.locator(".cal").count()) === 1);
  ok("...as the app's standard panel, not a shape of its own",
    (await page.locator(".cal.panel.ws-accent .panel-head h3").innerText()) === "Calibration");
  // It belongs above the figures it produces, not below them.
  const calY = (await page.locator(".cal").boundingBox()).y;
  const qtY = (await page.locator(".qt-top").boundingBox()).y;
  ok("...at the top of the workshop, above the results", calY < qtY);

  // The whole quantification as text for a language model: rules, parameters, chain,
  // results and limits, so a model is not left to invent the method behind the numbers.
  await page.locator(".qt-llm").click();
  await page.waitForTimeout(400);
  ok("the quantification can be copied for an LLM", /copied/i.test(await page.locator(".qt-llm").innerText()));
  const llm = await page.evaluate(() => navigator.clipboard?.readText?.().catch(() => "") ?? "");
  if (llm) {
    ok("...and the dump describes the model, not just the numbers",
      /## 1\. The model/.test(llm) && /Decomposition invariance/i.test(llm));
    ok("...names the parameters in force", /## 2\. Parameters in force/.test(llm) && /judgement|measured|derived/i.test(llm));
    ok("...breaks the derived terms out", /Attempts per year: /.test(llm) && /The bar: /.test(llm));
    ok("...and states what it does not claim", /## 4\. What this does not claim/.test(llm));
  }

  ok("...and is shut by default so it does not swamp the figures", !(await page.locator(".cal-body").count()));
  await page.locator(".cal .panel-head .btn").click();
  await page.waitForTimeout(250);
  const calBody = await page.locator(".cal").innerText();
  ok("calibration lists both sides of the model",
    /how often a scenario is attempted/i.test(calBody) && /what an attempt is up against/i.test(calBody));
  ok("every table asks a question in plain words", (await page.locator(".cal-q").count()) >= 8);
  ok("...and can explain where its numbers came from", (await page.locator(".cal-why").count()) >= 8);
  ok("it starts out at the defaults", !(await page.locator(".cal .badge").count()));
  await page.locator(".cal-why").first().click();
  await page.waitForTimeout(100);
  const whyBox = await page.locator(".cal-why-box").first().innerText();
  ok("the explanation says what changes and how the default was arrived at",
    /what it changes/i.test(whyBox) && /how the default was arrived at/i.test(whyBox));
  const grades = await page.locator(".cal-grade").allInnerTexts();
  ok("every table declares how much it rests on", grades.length >= 10
    && grades.every((g) => /measured|derived|judgement/i.test(g)));
  ok("...and they are not all the same claim", new Set(grades.map((g) => g.toLowerCase())).size >= 2);
  ok("a measured or derived table names its source", /source/i.test(
    await page.locator(".cal-table").first().locator(".cal-why-box").innerText()));
  await page.screenshot({ path: `${shots}/Calibration.png` });

  // Values are dials with the default marked, not bare number boxes - but an exact
  // figure still has to be typeable, which is what this drives.
  const dial = page.locator(".cal-table").first().locator(".dial-v").first();
  const before = await dial.innerText();
  ok("every value sits on a track with its default marked",
    (await page.locator(".cal-table").first().locator(".dial-track").count()) >= 5
    && (await page.locator(".cal-table").first().locator(".dial-dflt").count()) >= 5);
  await dial.click();
  await page.locator(".dial-v.editing").fill("0.9");
  await page.locator(".dial-v.editing").press("Enter");
  await page.waitForTimeout(250);
  ok("an edited value is kept", /0\.9/.test(await page.locator(".cal-table").first().locator(".dial-v").first().innerText()));
  ok("...and the panel head marks the study as changed",
    /changed/i.test(await page.locator(".cal .panel-head .badge").innerText()));
  ok("...and the table itself is marked", (await page.locator(".cal-edited").count()) >= 1);
  await page.waitForTimeout(700);          // let the debounced write reach storage
  await page.reload();
  await page.waitForTimeout(900);
  if (!(await page.locator(".ws-tabs").count())) {
    await page.locator(".study-card, .card").first().click();
    await page.waitForTimeout(400);
  }
  await page.locator(".ws-tab", { hasText: "Quantification" }).click();
  await page.waitForTimeout(400);
  await page.locator(".cal .panel-head .btn").click();
  await page.waitForTimeout(250);
  ok("an edited calibration survives a reload, stored with the study",
    /0\.9/.test(await page.locator(".cal-table").first().locator(".dial-v").first().innerText()));
  ok("...and the changed value is marked against its default",
    (await page.locator(".cal-table").first().locator(".dial-v.moved").count()) >= 1);
  await page.locator(".cal-reset").first().click();
  await page.waitForTimeout(250);
  ok("resetting one table restores its default",
    (await page.locator(".cal-table").first().locator(".dial-v").first().innerText()) === before);

  // Values that are really a choice between named cases are choices, not numbers, and
  // the techniques are ranked by what they demand rather than by identifier.
  const tool = page.locator(".cal-table", { hasText: "Tooling maturity, per technique" });
  await tool.scrollIntoViewIfNeeded();
  ok("tooling maturity is a named choice, not a number box", (await tool.locator(".cal-seg").count()) > 40);
  const caps = await tool.locator(".cal-sub").allInnerTexts();
  ok("...and the techniques are ranked by what they demand",
    /bespoke/i.test(caps.join(" ")) && /practitioner/i.test(caps.join(" "))
    && caps.findIndex((c) => /bespoke/i.test(c)) < caps.findIndex((c) => /commodity/i.test(c)));

  // Sector lives in the scope workshop, with what it actually does to the numbers.
  await page.locator(".ws-tab", { hasText: "Assets" }).click();
  await page.waitForTimeout(350);
  ok("the sector picker sits in workshop 1", (await page.locator(".panel-head select").count()) === 1);
  ok("...as the app's standard panel", (await page.locator(".panel.ws-accent .panel-head h3").first().innerText()) === "Sector");
  const sectTxt = await page.locator(".sect-body").innerText();
  ok("...and explains what is specific about the chosen sector", /clinical systems|availability/i.test(sectTxt));
  ok("...and names the rate exceptions it actually triggers",
    /applied to the attack rate/i.test(sectTxt) && /Cybercriminals/.test(sectTxt));

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
