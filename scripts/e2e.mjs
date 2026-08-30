// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Self-contained headless verification of the PORTABLE build (no extension).
// Loads dist/index.html over file://, loads the sample study, walks every
// workshop tab + the graph, and asserts the data view renders. Screenshots
// go to /tmp/ebios-e2e/. Exits non-zero on any console error or failed check.
import { chromium } from "playwright";
import { buildXlsx } from "./xlsx-fixture.mjs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync, readFileSync } from "node:fs";
import { requireFreshBuild } from "./built.mjs";

const here = dirname(fileURLToPath(import.meta.url));
// Refuses to run against a stale artefact - see built.mjs.
const distPath = requireFreshBuild(resolve(here, ".."));
const file = "file://" + distPath;
// Built with the generative branch or without it? The artefact says so, so one test file
// serves both and neither has to be kept in a second version by hand.
const llmBuild = readFileSync(distPath, "utf8").includes("Smart engine · Language model");
const shots = "/tmp/ebios-e2e";
mkdirSync(shots, { recursive: true });

const errors = [];
const checks = [];
const ok = (name, cond) => { checks.push({ name, cond }); console.log(`${cond ? "✓" : "✗"} ${name}`); };


/** The three questions worth asking about any table in this product, answered by counting.
 *  Used in the workshops and again where a table lives outside them - a check that visits
 *  only the tabs it was written for is how a defect survives in the view next door. */
const tableShape = () => page.evaluate(() => [...document.querySelectorAll("table.tbl")].map((t) => {
  const ths = [...t.querySelectorAll("thead tr > th")];
  const rows = [...t.querySelectorAll("tbody tr")]
    .filter((r) => !r.classList.contains("detail-row") && !r.classList.contains("group-row"));
  const w = ths.map((x) => x.getBoundingClientRect().width);
  return { head: ths.map((x) => x.textContent.trim() || "—").join("|").slice(0, 50),
    cols: ths.length, cells: rows.length ? rows[0].children.length : ths.length,
    leftover: Math.round(t.getBoundingClientRect().width - w.reduce((a, c) => a + c, 0)),
    // An empty header is fine where the column holds the row's actions; it is not fine
    // when the column holds nothing at all.
    headless: ths.map((x, i) => ({ i, empty: !x.textContent.trim(),
      filled: rows.some((r) => r.children[i] && r.children[i].textContent.trim().length + r.children[i].children.length > 0) }))
      .filter((x) => x.empty && !x.filled).length };
}));

/** A single-page PDF with an uncompressed text layer, built here so the check needs no
 *  network and no file in the repository. It exists to prove one thing: that a chosen
 *  PDF is extracted rather than read as bytes. The real catalogues are measured
 *  separately, by scripts/corpus-test.mjs. */
function makePdf(lines) {
  const body = `BT /F1 10 Tf 12 TL 1 0 0 1 40 750 Tm\n`
    + lines.map((l) => `(${l.replace(/([()\\])/g, "\\$1")}) Tj T*\n`).join("") + "ET";
  const objs = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
    `<</Length ${body.length}>>\nstream\n${body}\nendstream`,
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
  ];
  let out = "%PDF-1.4\n";
  const off = [];
  objs.forEach((o, i) => { off.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
    + off.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("")
    + `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

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
  // Every row of the break-down opens where its number came from: the records behind
  // it, their state, how they combined, and what that made the bar.
  ok("break-down rows are clickable", (await page.locator(".qb-rows .qb-row").count()) >= 3);
  await page.locator(".qb-rows .qb-row").nth(1).click();
  await page.waitForSelector(".ft-card", { timeout: 5000 });
  const bx = await page.locator(".ft-card").innerText();
  ok("...naming the measures behind the number, with their state",
    /measures you recorded on this step/i.test(bx) && /Preventive/.test(bx) && /Implemented/.test(bx));
  // Every figure in the popup has to carry the arithmetic that produced it - otherwise
  // it is just a new set of numbers with no more provenance than the one clicked.
  ok("...and every figure carries the arithmetic behind it",
    /rolled out .* \(×/.test(bx) && /most one measure can protect/i.test(bx)
    && /1 − \(1 − /.test(bx) && /the most a fully protected step adds/i.test(bx));
  ok("...ending at the skill an attacker needs there",
    /has to be better than this share of all attackers/i.test(bx));
  await page.locator(".ft-head .btn").click();
  await page.waitForTimeout(200);
  await page.locator(".qb-rows .qb-row").first().click();
  await page.waitForSelector(".ft-card", { timeout: 5000 });
  const bx0 = await page.locator(".ft-card").innerText();
  ok("...and the baseline row breaks the demand into its four terms",
    /getting in/i.test(bx0) && /distinct tactics/i.test(bx0) && /staying in/i.test(bx0));
  await page.locator(".ft-head .btn").click();
  await page.waitForTimeout(200);

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
  // A branch per effect class: which one moved THIS factor, and by how much. The tree
  // showed the factors and the arithmetic, but not which piece of work bought which -
  // and "the bill fell" is three different achievements depending on the class.
  ok("the factor says what the measures did to it", /what your measures did to it/i.test(ft));
  {
    const rows = page.locator(".ft-card .ft-chan-row");
    const n = await rows.count();
    ok("...with a branch per effect class that acts on it", n >= 1, String(n));
    const first = await rows.first().innerText();
    ok("...naming the class and what it does in the model's words",
      /(PREVENTIVE|DETECTIVE|CORRECTIVE|DETERRENT|AVOIDANCE)/i.test(first) && /step|attacker|caught/i.test(first));
    // A gate is not a multiplier: the bar is raised by steps an attacker must pass, not
    // by a percentage off a range, and showing it as one would misstate the mechanism.
    ok("...measuring a gate in steps rather than as a percentage",
      /\d+ steps?$/.test(first.trim()) || !/^−\d+%$/.test(first.trim().split("\n").pop() ?? ""));
  }
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
  // What points at a record is grouped by who points and through which relation, so a
  // record a hundred others name reads as a sentence with a count, not a wall of chips.
  ok("what points at the record is grouped by kind and relation",
    (await page.locator(".detail .d-rel-group").count()) >= 1
    && (await page.locator(".detail .d-rel-head .badge").count()) >= 1);
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

  // Crowd it, then check the two things a crowded graph has to offer: nodes that do not
  // sit on each other, and a push that stays put. The relief pass runs after every reveal
  // (see domain/graph.ts); the push is remembered outside the study, like a fold.
  {
    const nodeSel = ".graph-wrap svg g[transform^='translate']:has(> circle)";
    const at = async (n) => {
      const t = await page.locator(nodeSel).nth(n).getAttribute("transform");
      const m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(t ?? "");
      return m ? { x: +m[1], y: +m[2] } : null;
    };
    for (const label of ["HIS database server", "Clinical network"]) {
      const el = page.locator(".gi-e", { hasText: label }).first();
      if (await el.count()) await el.click({ modifiers: label === "HIS database server" ? [] : ["Shift"] });
      await page.waitForTimeout(400);
    }
    const pts = [];
    const n = await page.locator(nodeSel).count();
    for (let i = 0; i < n; i++) pts.push(await at(i));
    let closest = Infinity;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      closest = Math.min(closest, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
    }
    ok("a crowded graph keeps its nodes apart", n > 8 && closest > 50, `${n} nodes, closest ${Math.round(closest)}px`);

    // A relation is labelled once per fan, not once per rope. Nine edges that all say
    // "protects" say the same thing nine times, and they pile up INSIDE the ring, where
    // pushing the nodes apart changes nothing.
    const lab = await page.evaluate(() => {
      const svg = document.querySelector(".graph-wrap svg");
      const texts = [...svg.querySelectorAll("text")].filter((t) => !t.closest("g[transform^='translate']"));
      return { edges: svg.querySelectorAll("line").length, labels: texts.length };
    });
    ok("an edge label is not repeated once per rope",
      lab.edges >= 20 && lab.labels * 2 <= lab.edges, `${lab.labels} labels on ${lab.edges} edges`);

    const node = page.locator(nodeSel).nth(3);
    const before = await at(3);
    const box = await node.locator("circle").first().boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 - 50, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(700);
    const after = await at(3);
    // The distance is not asserted to the pixel: the pane can scroll under the pointer,
    // which shifts client coordinates without changing what the reader did. What matters
    // is that the node went where it was pushed, and by a serious amount.
    ok("a node can be pushed out of the way",
      after.x - before.x > 40 && before.y - after.y > 25);
    await page.waitForTimeout(700);
    const settled = await at(3);
    ok("...and stays where it was put", settled.x === after.x && settled.y === after.y);
    ok("...remembered outside the study",
      await page.evaluate(() => (localStorage.getItem("aurelian_view_nudge") ?? "").includes("@graph")));
    const reset = page.locator(".graph-legend button", { hasText: "Reset positions" });
    ok("...with a way back offered once something was moved", (await reset.count()) === 1);
    await reset.click();
    await page.waitForTimeout(900);
    const home = await at(3);
    ok("reset puts it back where the layout wants it",
      Math.abs(home.x - before.x) < 2 && Math.abs(home.y - before.y) < 2, JSON.stringify(home));
    await page.locator(".gi-e", { hasText: "Patient records" }).first().click();
    await page.waitForTimeout(400);
  }

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
  // NOTHING IS BEHIND THE HEADINGS BEFORE ANYONE TOUCHES ANYTHING. The mask over the header
  // row is opaque to 44px and fades to 60; the lane body used to start at 34, so the first
  // card of every lane sat inside the opaque part at rest - twelve of them in this study.
  // The measurement asserts the view IS at rest first, because a scrolled or selected page
  // would answer the question silently and pass.
  {
    const at = await page.evaluate(() => {
      const sc = document.querySelector(".flow-scroll"), sr = sc.getBoundingClientRect();
      const heads = [...document.querySelectorAll(".lane-header[data-lane]")];
      const hb = heads.length ? Math.max(...heads.map((h) => h.getBoundingClientRect().bottom - sr.top)) : 0;
      const tops = [...document.querySelectorAll("[data-nk]")].map((c) => c.getBoundingClientRect().top - sr.top);
      return { rest: sc.scrollTop === 0 && sc.scrollLeft === 0 && !document.querySelector(".flow-node.selected"),
               hb: Math.round(hb), first: Math.round(Math.min(...tops)),
               masked: tops.filter((t) => t < 60).length, n: tops.length };
    });
    ok("the flow view is at rest, so the next check means something", at.rest);
    console.log(`   headings end at ${at.hb}px, first card at ${at.first}px, ${at.masked} of ${at.n} inside the mask`);
    ok("...and no card starts inside the mask over the headings", at.masked === 0);
  }

  // Where the reader is scrolled to survives a selecting click - the FIRST one too. The
  // lanes narrow for a few frames while the tree is laid out, and a browser clamps the
  // scroll to what fits in that moment and leaves it there; restoring once lands inside
  // that window. The tree still overflows afterwards, so snapping to the left does not
  // reveal it whole - it only moves the reader off the node they just clicked.
  {
    const sc = page.locator(".flow-scroll");
    const over = await sc.evaluate((el) => el.scrollWidth - el.clientWidth);
    if (over > 200) {
      await sc.evaluate((el) => { el.scrollLeft = 200; });
      await page.waitForTimeout(200);
      // A node the reader can SEE from there. Clicking one that is off-screen is a
      // different case: the browser scrolls it into view, and rightly so.
      const visible = await page.evaluate(() => {
        const el = document.querySelector(".flow-scroll");
        const r = el.getBoundingClientRect();
        const n = [...document.querySelectorAll(".flow-node")]
          .filter((x) => { const b = x.getBoundingClientRect(); return b.left >= r.left && b.right <= r.right; }).pop();
        return n ? n.getAttribute("data-nk") : null;
      });
      ok("a node is visible from a scrolled position", !!visible);
      await page.locator(`[data-nk="${visible}"]`).click();
      await page.waitForTimeout(900);
      const overAfter = await sc.evaluate((el) => el.scrollWidth - el.clientWidth);
      // The assertion is only about something if the selection leaves the lanes wider
      // than the viewport. Where the tree collapses to one lane, 0 is the only position
      // there is and the browser clamps for a good reason - that is not this behaviour
      // failing, it is the case being empty, and it has to read differently.
      ok("...the selected tree still has more width than the viewport", overAfter >= 200);
      // THE CLICKED CARD LANDS IN THE MIDDLE, and the reader's own scroll is not what is
      // preserved. Carrying that offset across the re-render is what this view kept
      // breaking on - it had to be remembered (a wheel scroll was missed), restored against
      // a sheet that changes width, and agreed with by a tree placed with transforms, which
      // do not move the scrollable area. The view is scrolled to the card instead.
      const where = await page.evaluate((k) => {
        const sc = document.querySelector(".flow-scroll"), c = document.querySelector(`[data-nk="${k}"]`);
        if (!c) return null;
        const r = c.getBoundingClientRect(), sr = sc.getBoundingClientRect();
        const heads = [...document.querySelectorAll(".lane-header[data-lane]")];
        const hb = heads.length ? Math.max(...heads.map((h) => h.getBoundingClientRect().bottom)) - sr.top : 0;
        const maxX = sc.scrollWidth - sc.clientWidth;
        return { dx: Math.round((r.left + r.right) / 2 - (sr.left + sr.right) / 2),
                 dy: Math.round((r.top + r.bottom) / 2 - (sr.top + sr.bottom) / 2),
                 // At a clamp there is nothing left to scroll, so "centred" cannot be asked for.
                 // "As far as the scroll can reach" is not exact: the sheet's width settles
                 // over a few frames, so the browser's clamp lands near the limit rather
                 // than on it. Near enough to the end counts as having reached it.
                 klemmt: sc.scrollLeft <= 1 || sc.scrollLeft >= maxX - 100 || maxX < 100,
                 underHead: Math.round(hb - (r.top - sr.top)),
                 visible: r.top - sr.top >= 0 && r.bottom - sr.top <= sc.clientHeight };
      }, visible);
      console.log(`   clicked card: ${where.dx}px / ${where.dy}px off centre, ${where.underHead}px under the headings, visible=${where.visible}, at a clamp=${where.klemmt}`);
      ok("...the clicked card is clear of the lane headings", where.underHead <= 0);
      ok("...and fully in view", where.visible);
      ok("...and centred, as far as the scroll can reach", where.klemmt || Math.abs(where.dx) <= 80);
      ok("...vertically on the middle", Math.abs(where.dy) <= 60);
      await page.keyboard.press("Escape");        // leave highlight mode for what follows
      await page.waitForTimeout(400);
    }
    await page.locator(".flow-node").filter({ hasText: "Ransomware encryption" }).first().click({ force: true });
    await page.waitForTimeout(600);
  }
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
  // Zoom back to 1:1 and to the top left, so a step that follows starts where it expects to.
  const resetFlowView = async () => {
    const btn = page.locator(".flow-main button", { hasText: /^\d+%$/ });
    if (await btn.count()) { await btn.first().click(); await page.waitForTimeout(400); }
    await page.evaluate(() => {
      const sc = document.querySelector(".flow-scroll");
      if (sc) { sc.scrollLeft = 0; sc.scrollTop = 0; }
    });
    await page.waitForTimeout(150);
  };

  // The wheel zooms and the background pans - a dense flow is read by pulling back, not by
  // scrolling a 2400px sheet. CSS `zoom` was chosen over a transform because it is the one
  // that lets the scroller reach what was pushed out of view (measured: both axes follow).
  {
    const state = () => page.evaluate(() => {
      const sc = document.querySelector(".flow-scroll"), lanes = document.querySelector(".flow-lanes");
      return { zoom: +getComputedStyle(lanes).zoom, w: sc.scrollWidth, h: sc.scrollHeight,
               left: Math.round(sc.scrollLeft), top: Math.round(sc.scrollTop) };
    });
    const box = await page.locator(".flow-scroll").boundingBox();
    const a = await state();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(120); }
    const b2 = await state();
    ok("the wheel zooms the flow out", b2.zoom < a.zoom, `${a.zoom} → ${b2.zoom}`);
    ok("...and the sheet follows on both axes", b2.w < a.w && b2.h < a.h, `${a.w}x${a.h} → ${b2.w}x${b2.h}`);
    for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(120); }
    const c2 = await state();
    ok("...and back in", Math.abs(c2.zoom - a.zoom) < 0.01, `${c2.zoom}`);
    // A selection must aim ONCE. The tree is placed against the viewport the dock will
    // leave behind, not the one it is measured in, and the observer that corrects for the
    // dock's growth waits for it to settle: without either, every moving card was given
    // nine targets in 309ms and one of them travelled 186px after the flight had landed -
    // boxes snapping about while the reader watches. Counted here at the source, by
    // recording every transform this view writes.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    // A card in the UPPER THIRD of the view. Two rules meet here and only one of them is
    // under test: a card that would be hidden is deliberately pulled into sight, because
    // the dock takes the lower 40% of the viewport as it opens. Clicking a card down there
    // asserts against that rule instead of against the anchor - measured at 91 and 105px of
    // perfectly correct movement. A card near the top is still in view after the dock opens,
    // so what is left to see is whether the anchor holds.
    const candidates = await page.evaluate(() => {
      const sc = document.querySelector(".flow-scroll");
      const r = sc.getBoundingClientRect();
      return [...document.querySelectorAll("[data-nk]")].filter((c) => {
        const b = c.getBoundingClientRect();
        return b.top > r.top + 20 && b.bottom < r.top + r.height * 0.33
          && b.left > r.left && b.right < r.right;
      }).map((c) => c.dataset.nk);
    });
    // ...and one that actually has a network. The first visible card was a node with no
    // connections: one card flew, no ribbons, and the check measured an empty scene.
    let aimAt = null;
    for (const k of candidates.slice(0, 4)) {
      await page.locator(`[data-nk="${k}"]`).click({ force: true });
      await page.waitForTimeout(700);
      const flown = await page.locator("[data-nk].ef-floating").count();
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
      if (flown >= 5) { aimAt = k; break; }
    }
    await page.evaluate(() => {
      window.__aim = [];
      window.__aimObs = new MutationObserver((ms) => {
        for (const m of ms) {
          const el = m.target;
          if (el.dataset && el.dataset.nk) window.__aim.push({ k: el.dataset.nk, tr: el.style.transform || "" });
        }
      });
      window.__aimObs.observe(document.querySelector(".flow-lanes"),
        { attributes: true, attributeFilter: ["style"], subtree: true });
    });
    // Said out loud: without it, a run where nothing suitable was in view would skip every
    // assertion below and still report a clean suite.
    ok("the flow has a connected card near the top to click", !!aimAt);
    if (aimAt) {
      const topOf = () => page.evaluate((k) => {
        const c = document.querySelector(`[data-nk="${k}"]`), sc = document.querySelector(".flow-scroll");
        return c && sc ? c.getBoundingClientRect().top - sc.getBoundingClientRect().top : null;
      }, aimAt);
      const beforeTop = await topOf();
      // Watch the whole tree, frame by frame: it must fly ONCE. Placing it against an
      // offset the scroll had not reached yet sent every card out to one side and brought
      // them back a few frames later - a round trip, and the reader sees both halves.
      await page.evaluate(() => {
        window.__trip = [];
        const t = () => {
          // Against the LANES, not the scroller: the view is scrolled to the card on
          // purpose, and measuring across that scroll turns an intended move into a
          // phantom round trip.
          const lanes = document.querySelector(".flow-lanes");
          const xs = [...document.querySelectorAll("[data-nk].ef-floating")]
            .map((c) => c.getBoundingClientRect().left - lanes.getBoundingClientRect().left);
          if (xs.length) window.__trip.push(Math.min(...xs));
          window.__tripRaf = requestAnimationFrame(t);
        };
        t();
      });
      await page.locator(`[data-nk="${aimAt}"]`).click({ force: true });
      await page.waitForTimeout(2200);
      const trip = await page.evaluate(() => { cancelAnimationFrame(window.__tripRaf); return window.__trip; });
      if (trip.length) {
        const fin = trip[trip.length - 1];
        const overshoot = Math.max(0, ...trip.map((x) => x - fin));
        console.log(`   the tree settled at ${Math.round(fin)}px, furthest past that ${Math.round(overshoot)}px`);
        ok("the tree flies once, it does not go out and come back", overshoot <= 40);
      }
      const afterTop = await topOf();
      // The card MOVES now, and on purpose: the view is scrolled to it so that it lands in
      // the middle. Where it ends up is asserted above - centred, in view, clear of the
      // headings - so all that is left to say here is how far it travelled, for the record.
      console.log(`   the clicked card travelled ${Math.abs((afterTop ?? 0) - (beforeTop ?? 0)).toFixed(0)}px to its place`);
      const aim = await page.evaluate(() => {
        window.__aimObs.disconnect();
        const per = new Map();
        for (const a of window.__aim) {
          if (!a.tr) continue;
          if (!per.has(a.k)) per.set(a.k, []);
          const v = per.get(a.k);
          if (v[v.length - 1] !== a.tr) v.push(a.tr);
        }
        const y = (t) => Number((t.match(/translate\([^,]+,\s*(-?[\d.]+)px/) || [])[1] ?? 0);
        let worstCount = 0, worstMove = 0;
        for (const v of per.values()) {
          worstCount = Math.max(worstCount, v.length);
          if (v.length > 1) worstMove = Math.max(worstMove, Math.abs(y(v[v.length - 1]) - y(v[0])));
        }
        return { cards: per.size, worstCount, worstMove: Math.round(worstMove) };
      });
      console.log(`   ${aim.cards} cards placed, at most ${aim.worstCount} targets each, largest re-aim ${aim.worstMove}px`);
      ok("a selection aims the tree once, not once per frame of the opening dock", aim.worstCount <= 2);
      ok("...and what is left to correct is a few pixels, not a jump", aim.worstMove <= 20);
    }

    // The ribbons and the cards have to move as one PER FRAME, not just once the zoom has
    // settled. They are drawn from measured rectangles every frame while the cards are laid
    // out by the browser, so a zoom read from the wrong side of the repaint puts the two in
    // different scales for as long as the change takes to land: measured at 228px of drift
    // mid-zoom, back to nothing afterwards - lines that hang and then jump. Sampled here
    // frame by frame, as the distance from each ribbon END to the nearest card.
    //
    // Two nodes are picked first: an Escape above left highlight mode, and with no selection
    // there are no ribbons and nothing flown - the first run of this check passed on an
    // empty scene, which is why the scene itself is asserted below.
    await page.locator("[data-nk]").first().click({ force: true });
    await page.waitForTimeout(500);
    await page.locator("[data-nk]").nth(1).click({ force: true });
    await page.waitForTimeout(900);
    await page.evaluate(() => {
      window.__sync = { worst: 0, frames: 0, flown: 0, paths: 0 };
      const svg = document.querySelector(".ribbons");
      const tick = () => {
        const paths = [...document.querySelectorAll(".ribbons path")].filter((x) => x.getAttribute("d"));
        const cards = [...document.querySelectorAll("[data-nk]")].map((c) => c.getBoundingClientRect());
        const ctm = svg?.getScreenCTM();
        if (ctm && cards.length) {
          const pt = svg.createSVGPoint();
          for (const pa of paths) {
            const len = pa.getTotalLength(); if (!len) continue;
            for (const t of [0, 1]) {
              const q = pa.getPointAtLength(t * len);
              pt.x = q.x; pt.y = q.y;
              const s = pt.matrixTransform(ctm);
              let d = Infinity;
              for (const c of cards) d = Math.min(d, Math.hypot(
                Math.max(c.left - s.x, 0, s.x - c.right), Math.max(c.top - s.y, 0, s.y - c.bottom)));
              window.__sync.worst = Math.max(window.__sync.worst, d);
            }
          }
        }
        window.__sync.frames++;
        window.__sync.paths = Math.max(window.__sync.paths, paths.length);
        window.__sync.flown = Math.max(window.__sync.flown, document.querySelectorAll(".ef-floating").length);
        window.__syncRaf = requestAnimationFrame(tick);
      };
      tick();
    });
    for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(90); }
    await page.waitForTimeout(400);
    const sync = await page.evaluate(() => { cancelAnimationFrame(window.__syncRaf); return window.__sync; });
    console.log(`   ${sync.paths} ribbons, ${sync.flown} flown, worst ${Math.round(sync.worst)}px over ${sync.frames} frames`);
    ok("the scene under test has ribbons and flown cards", sync.paths > 0 && sync.flown > 0);
    ok("ribbons stay on their cards throughout a zoom, not only after it", sync.worst <= 6);
    // Correct positions are not enough if getting them costs the frame. This is its OWN
    // pass: the sampling above walks 51 ribbons and 46 rectangles every frame and would be
    // measuring itself - it reported 4 slow frames where a clean run had none.
    //
    // And from a known starting point: zooming on top of whatever the checks above left
    // behind measures a different sheet each run, and a budget compared against a moving
    // scene is not a measurement.
    await resetFlowView();
    await page.evaluate(() => {
      window.__fr = []; let last = performance.now();
      const t = () => { const n = performance.now(); window.__fr.push(n - last); last = n;
                        window.__frRaf = requestAnimationFrame(t); };
      window.__frRaf = requestAnimationFrame(t);
    });
    for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, i < 2 ? -120 : 120); await page.waitForTimeout(110); }
    await page.waitForTimeout(300);
    const fr = (await page.evaluate(() => { cancelAnimationFrame(window.__frRaf); return window.__fr; }))
      .slice(2).sort((a, b) => a - b);
    const slow = fr.filter((d) => d > 32).length;
    console.log(`   frame times while zooming: p50 ${fr[Math.floor(fr.length / 2)]?.toFixed(1)}ms, p95 ${fr[Math.floor(fr.length * 0.95)]?.toFixed(1)}ms, ${slow} over 32ms of ${fr.length}`);
    ok("...and the zoom keeps its frames, so the view does not judder", slow <= 3);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    // Dragging the ground pans. The start point has to BE ground: a press on a card is a
    // click on that card by design, which is what made the first version of this check fail.
    const ground = await page.evaluate(() => {
      const sc = document.querySelector(".flow-scroll");
      const r = sc.getBoundingClientRect();
      for (let y = r.bottom - 30; y > r.top + 40; y -= 20) {
        for (let x = r.right - 40; x > r.left + 40; x -= 40) {
          const el = document.elementFromPoint(x, y);
          if (el && sc.contains(el) && !el.closest("[data-nk], .lane-header, button")) return { x, y };
        }
      }
      return null;
    });
    ok("the flow has ground to drag on", !!ground, JSON.stringify(ground));
    if (ground) {
      // Read the position immediately before the drag. Taking it from further up compares
      // against a scroll the selection and the Escape in between have already moved.
      const p0 = await state();
      await page.mouse.move(ground.x, ground.y);
      await page.mouse.down();
      await page.mouse.move(ground.x - 160, ground.y - 60, { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(250);
      const d2 = await state();
      if (d2.left <= p0.left) console.log(`   left ${p0.left} → ${d2.left}`);
      ok("dragging the background pans the flow", d2.left > p0.left);
    }
    // Back to a plain view. What follows clicks nodes by name, and a node the zoom or the
    // pan has pushed out of sight is clicked at coordinates nobody can see: this suite once
    // stopped at check 111 with a thirty-second timeout waiting for a button that only
    // appears once something is selected.
    await resetFlowView();
  }

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
  // A measure on an attack step is in use by that fact: the switch is refused in the
  // direction that would contradict the chain, and says why.
  {
    const panel = page.locator(".panel", { has: page.locator(".cell-toggle") }).first();
    const all = await panel.locator(".cell-toggle").count();
    const locked = await panel.locator(".cell-toggle.locked").count();
    ok("measures carry an in-use switch", all > 0, String(all));
    ok("one on the chain cannot be taken out of use", locked > 0 && locked < all, `${locked} of ${all}`);
    // Naming what holds it, not counting it: "(1)" leaves the reader to go and find which.
    const why = (await panel.locator(".cell-toggle.locked").first().getAttribute("title")) ?? "";
    ok("...and the switch says why", /take it off there first/i.test(why), why);
    ok("...naming what holds it rather than counting", /in use: [a-z ]+ \S/i.test(why) && !/\(\d+\)/.test(why), why);
    ok("a measure off the chain stays switchable",
      (await panel.locator(".cell-toggle:not(.locked)").count()) > 0);
  }
  const mc = await page.locator(".panel:has(.mc-ring)").innerText();
  ok("treatment shows what becomes of an attempt", /blocked/i.test(mc) && /detected in time/i.test(mc) && /reaches the objective/i.test(mc));
  ok("the ring counts attempts, not coverage", /attempts stopped/i.test(mc) && !/residual gap/i.test(mc));
  ok("the ring says how many steps block and how many detect", /steps block an attacker/i.test(mc) && /detect him/i.test(mc));
  ok("kill-chain mitigation counts defended steps, not merely covered ones",
    (await page.locator(".tbl .badge", { hasText: /\d+\/\d+ defended/ }).count()) > 0);
  // A control is chosen where it is missing. The catalogue is an entry in the list itself:
  // that is where someone looks for a measure, so that is where "not there? get one" has
  // to be - and what is chosen arrives already covering that step.
  {
    const row = page.locator(".tbl .row-clickable").filter({ hasText: /\d+\/\d+ defended/ }).first();
    await row.click();
    await page.waitForTimeout(300);
    await page.locator(".kcc-lane").first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${shots}/ChainMitigation.png` });
    const sel = page.locator(".kcc-card .multi select").first();
    const opts = await sel.locator("option").allInnerTexts();
    ok("the measure list carries the catalogue as its last entry",
      opts.some((o) => /From a catalogue/i.test(o)));
    await sel.selectOption({ label: "From a catalogue…" });
    await page.waitForTimeout(350);
    const dlg = await page.locator(".modal-lg").innerText();
    ok("...opening the measure catalogue, with a custom one still possible",
      /Choose from a catalog/i.test(dlg) && /Create custom/i.test(dlg));
    await page.locator(".overlay").click({ position: { x: 5, y: 5 } }).catch(() => {});
    await page.waitForTimeout(200);
    ok("the picker closes again", (await page.locator(".modal-lg").count()) === 0);
    await row.click();
    await page.waitForTimeout(200);
  }
  // Putting a measure on a step is what states that it is in use, so the switch has to
  // follow: otherwise it sits on the chain fulfilling nothing, and cannot be corrected
  // from the table either, since the switch refuses only the other direction.
  {
    const tbl = page.locator(".panel", { has: page.locator(".cell-toggle") }).first();
    // Take one off the chain out of use first - every measure in the sample is in use,
    // and the point is what happens to a switched-off one when it is put on a step.
    const free = tbl.locator("tr:has(.cell-toggle:not(.locked))").first();
    const name = (await free.locator("td").first().innerText()).trim().split("\n")[0].trim();
    await free.locator(".cell-toggle").click();
    await page.waitForTimeout(150);
    ok("a measure can be taken out of use while off the chain",
      (await free.locator(".cell-toggle:not(.on)").count()) > 0, name);
    const before = await tbl.locator(".cell-toggle.locked").count();
    await page.locator(".row-clickable:not(.expanded)", { hasText: /\d+\/\d+ defended/ }).first().click();
    await page.waitForSelector(".kcc-mit select", { timeout: 5000 });
    // A step's picker leaves out what is already on it, so take the first step that
    // still offers this measure.
    let picker = null;
    for (const sel of await page.locator(".kcc-mit select").all()) {
      const labels = (await sel.locator("option").allInnerTexts()).map((l) => l.trim());
      if (labels.includes(name)) { picker = sel; break; }
    }
    ok("a step that has not got this measure offers it", !!picker, name);
    await picker.selectOption({ label: name });
    await page.waitForTimeout(200);
    const row = tbl.locator("tr", { hasText: name }).first();
    ok("a measure put on a step is switched into use by that fact",
      (await row.locator(".cell-toggle.on").count()) > 0, name);
    ok("...and is held there while it sits on the chain",
      (await tbl.locator(".cell-toggle.locked").count()) === before + 1);
  }
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
  // A PDF chosen through the file picker must go through text extraction. Reading the
  // file as text instead put the compressed streams into the preview and made every
  // document look like it had no text layer.
  {
    const pdf = makePdf([
      "ZZZ.1 Catalogue for the extraction check",
      "",
      ...Array.from({ length: 12 }, (_, k) => [
        `ZZZ.1.A${k + 1} Invented requirement number ${k + 1} (${k % 2 ? "S" : "B"})`,
        `Body text belonging to requirement ${k + 1}, long enough to count as substance.`,
        "",
      ]).flat(),
    ]);
    await page.locator('.modal-lg input[type=file]').setInputFiles({ name: "check.pdf", mimeType: "application/pdf", buffer: pdf });
    await page.waitForTimeout(1200);
    const preview = await page.locator(".modal-lg textarea").inputValue();
    ok("a chosen PDF is extracted, not read as bytes", /Invented requirement number 1/.test(preview));
    ok("the extracted document is read as a list", /Read as a list: 12 entries/.test(await page.locator(".modal-lg .guide.warn").innerText().catch(() => "")));
    ok("its levels are derived from the document", (await page.locator(".modal-lg .ex-cand").count()) === 12);
    // back to the table case the rest of this block asserts on
    await page.locator(".modal-lg textarea").fill("Control ID,Requirement,Domain,Guidance\nX-1,Just-in-time admin,Access,Grant admin temporarily\nX-2,Immutable backups,Resilience,Keep an offline copy");
    await page.locator(".modal-lg button", { hasText: "Parse" }).click();
    await page.waitForTimeout(300);
  }
  // A workbook has to arrive as the TABLE it is, and the sheet has to be the user's
  // choice: every published control catalogue in the set ships several sheets, and the
  // first one is as often a cover page as the controls.
  {
    const book = buildXlsx([
      { name: "Cover", rows: [["Secure Controls Framework"], ["Edition 2026.2"]] },
      { name: "Controls", rows: [
        ["Domain", "Control", "SCF #", "Control Description"],
        ...Array.from({ length: 10 }, (_, k) => [
          k < 5 ? "Governance" : "Asset Management",
          `Invented control ${k + 1}`,
          `INV-${String(k + 1).padStart(2, "0")}`,
          `Mechanisms exist to carry out invented duty number ${k + 1} across the enterprise.`,
        ]),
      ] },
      { name: "Evidence", rows: [
        ["#", "ERL #", "Area of Focus", "Documentation Artifact", "Artifact Description"],
        ...Array.from({ length: 6 }, (_, k) => [
          String(k + 1), `E-INV-${k + 1}`, k < 3 ? "Governance" : "Assets",
          `Artifact ${k + 1}`, `Documented evidence of invented artifact number ${k + 1}.`,
        ]),
      ] },
    ]);
    await page.locator('.modal-lg input[type=file]').setInputFiles(
      { name: "catalogue.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: book });
    await page.waitForTimeout(1200);
    ok("a workbook is read from the file picker", (await page.locator(".modal-lg .panel-head h3", { hasText: "Map columns" }).count()) > 0);
    const sheetBtns = page.locator(".modal-lg .panel-head h3", { hasText: "Sheet" });
    ok("its sheets are offered rather than guessed at", (await sheetBtns.count()) > 0);
    ok("the sheet with rows is opened, not the cover page", (await page.locator(".modal-lg .ex-cand").count()) === 10);
    const first = await page.locator(".modal-lg .ex-cand").first().innerText();
    ok("the reference comes from the code column, not the name", /INV-01/.test(first), first.slice(0, 60));
    ok("...and the entry is named by the control", /Invented control 1/.test(first), first.slice(0, 60));
    // switching sheet re-reads the workbook rather than re-parsing the old table
    await page.locator(".modal-lg .panel .btn.sm", { hasText: "Evidence" }).click();
    await page.waitForTimeout(500);
    ok("choosing another sheet imports that sheet", (await page.locator(".modal-lg .ex-cand").count()) === 6);
    const ev = await page.locator(".modal-lg .ex-cand").first().innerText();
    ok("the sheet's own row counter is not taken as the reference", /E-INV-1/.test(ev) && !/^1\b/.test(ev.trim()), ev.slice(0, 60));
    // back to the table case the rest of this block asserts on
    await page.locator(".modal-lg textarea").fill("Control ID,Requirement,Domain,Guidance\nX-1,Just-in-time admin,Access,Grant admin temporarily\nX-2,Immutable backups,Resilience,Keep an offline copy");
    await page.locator(".modal-lg button", { hasText: "Parse" }).click();
    await page.waitForTimeout(300);
  }
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

  // A record taken from a catalogue arrives NOT in use, and says so in writing. The cell
  // cannot show the difference - it renders the first option for an empty value as well as
  // for a recorded one - so the stored value is read off the record's own form. That
  // difference is the whole of it: an empty field counts as in play, which is right for a
  // record somebody typed and wrong for a library nobody has adopted.
  {
    // The import happens in Documents; the measures land in the treatment workshop.
    await page.locator(".sidebar .nav-item", { hasText: "Studies" }).click();
    await page.waitForTimeout(250);
    if (!(await page.locator(".ws-tabs").count())) {
      await page.getByText("Riverside General Hospital").first().click();
      await page.waitForSelector(".ws-tabs", { timeout: 10000 });
    }
    await page.locator(".ws-tab", { hasText: "Treatment" }).click();
    await page.waitForTimeout(300);
    const row = page.locator(".tbl tbody tr.row-clickable", { hasText: "Just-in-time admin" }).first();
    ok("the imported measure is in the table", (await row.count()) === 1);
    ok("...and its switch does not read as in use", (await row.locator(".cell-toggle.on").count()) === 0);
    await row.locator(".name").click();
    await page.waitForTimeout(200);
    await page.locator(".detail-actions button", { hasText: "Edit" }).first().click();
    await page.waitForSelector(".modal-lg .field", { timeout: 5000 });
    const inUse = page.locator(".modal-lg .field", { hasText: /^In use/ }).locator("select").first();
    ok("...because the state was written, not left empty",
      (await inUse.inputValue()) === "not in use", await inUse.inputValue());
    // Cancel, by name: the first ghost button in this footer is Delete.
    await page.locator(".modal-lg-foot .btn.ghost", { hasText: "Cancel" }).click();
    await page.waitForTimeout(200);
    ok("...and the record is still there after looking", (await row.count()) === 1);
    await row.locator(".name").click();          // collapse the detail again
    await page.waitForTimeout(150);
  }

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
  // Seals: the half the hash chain cannot do. The chain proves a log is consistent with
  // itself; anyone holding the file can recompute it, so it catches accident rather than
  // intent. A seal signs the head, so rewriting the past needs a private key.
  {
    const panel = page.locator(".panel.sp");
    ok("the timeline offers seals", (await panel.count()) === 1);
    ok("...refusing to seal before there is a key", await panel.locator(".panel-head .btn.primary").isDisabled());
    // The explanation is a dialog, not a wall on the page: the panel says the verdict, and
    // what a signature does and does not prove is one click away for whoever wants it.
    await panel.locator("button", { hasText: "What does a seal prove" }).click();
    await page.waitForSelector(".sp-modal", { timeout: 5000 });
    const proves = await page.locator(".sp-modal").innerText();
    ok("...and explains itself in a dialog rather than on the page",
      /does not prove when/i.test(proves) && /does not prove who/i.test(proves));
    await page.locator(".sp-modal button", { hasText: "Close" }).click();
    await page.waitForTimeout(250);

    await panel.locator("button", { hasText: "Keys" }).click();
    await page.waitForSelector(".sp-modal", { timeout: 5000 });
    await page.locator(".sp-modal button", { hasText: "Create a key" }).click();
    await page.waitForTimeout(700);
    const keysDlg = await page.locator(".sp-modal").innerText();
    ok("a signing key is made in the keys dialog", /Save public key/.test(keysDlg));
    ok("...and the public half can be saved as a file too", /Save public key/.test(keysDlg) && /Save private key/.test(keysDlg));
    // Close by the overlay only: the last ghost button in this dialog is the "forget this
    // key" bin, and clicking it emptied the ring the next assertion is about.
    await page.locator(".overlay").click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(300);

    await panel.locator(".panel-head .btn.primary").click();
    await page.waitForSelector(".sp-modal", { timeout: 5000 });
    await page.locator(".sp-modal input").first().fill("M. Westerberg");
    await page.locator(".sp-modal .btn.primary").click();
    await page.waitForTimeout(900);
    const sealed = await panel.locator(".sp-seal").first().innerText().catch(() => "");
    ok("the study can be sealed from a dialog", (await panel.locator(".sp-seal").count()) === 1, sealed);
    // The seal's own key was named when it was created, so it reads as verified rather
    // than merely valid.
    if ((await panel.locator(".sp-seal.sp-verified").count()) !== 1) console.log("   seal row:", sealed.replace(/\n/g, " | "));
    ok("...and reads as verified, because the key is one you named",
      (await panel.locator(".sp-seal.sp-verified").count()) === 1);
    ok("...saying what it covers, and that nothing followed it",
      /covers entries 1–\d+/.test(sealed) && /records unchanged since/.test(sealed), sealed);
    ok("...while the chain itself still verifies",
      /integrity verified/i.test(await page.locator(".tl-stats").innerText()));
  }
  await page.screenshot({ path: `${shots}/Timeline.png` });
  // A study-scope entry - a seal, an import - is not about one record and opens nothing.
  await page.locator(".tl-item:not(.tl-scope)").first().click();
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

  // Search, facets and grouping. The requirements table spans three frameworks, which is
  // what makes grouping worth having; the toolbar only appears once a table is long enough.
  {
    const tools = page.locator(".panel", { has: page.locator(".tbl-tools") }).first();
    ok("a long table offers a toolbar", (await tools.count()) > 0);
    // Scoped to the panel the toolbar belongs to: the tab may carry other tables.
    const rows = () => tools.locator(".tbl tbody tr.row-clickable").count();
    const all = await rows();
    ok("the sample requirements are enough to need one", all >= 8, String(all));

    await tools.locator(".tbl-search input").fill("backup");
    await page.waitForTimeout(200);
    ok("search narrows the table", (await rows()) < all && (await rows()) > 0, `${await rows()} of ${all}`);
    ok("...and says how many are left", /of \d+/.test(await tools.locator(".tbl-count").innerText()));
    await tools.locator(".tbl-search input").fill("");
    await page.waitForTimeout(200);
    ok("clearing the search restores every row", (await rows()) === all);

    // A facet is a menu, not a wall of chips: it says its name and how many values are
    // picked, and the values sit behind it with their counts.
    const menu = tools.locator(".facet-menu", { hasText: "Framework" }).first();
    await menu.locator(".facet-btn").click();
    await page.waitForTimeout(200);
    ok("a facet opens onto its values, each with a count",
      (await menu.locator(".facet-opt").count()) >= 2
      && /\d/.test(await menu.locator(".facet-opt .facet-n").first().innerText()));
    const first = menu.locator(".facet-opt").first();
    const chipCount = Number((await first.locator(".facet-n").innerText()).replace(/\D/g, ""));
    await first.click();
    await page.waitForTimeout(200);
    ok("picking a value filters to its own count", (await rows()) === chipCount, `${await rows()} vs ${chipCount}`);
    ok("the facet says one value is picked", (await menu.locator(".facet-btn.on .facet-n").innerText()).trim() === "1");

    // A second value on the same field widens rather than narrows: they are alternatives.
    await menu.locator(".facet-opt").nth(1).click();
    await page.waitForTimeout(200);
    ok("a second value on the same field widens the result", (await rows()) > chipCount);
    await page.mouse.click(4, 4);                     // outside: the menu closes
    await page.waitForTimeout(150);
    ok("the menu closes when the pointer goes elsewhere", (await menu.locator(".facet-pop").count()) === 0);

    await tools.locator(".tbl-clear").click();
    await page.waitForTimeout(200);
    ok("clearing the filters restores every row", (await rows()) === all);

    await tools.locator("select.tbl-group").selectOption({ label: "by framework" });
    await page.waitForTimeout(250);
    const groups = await tools.locator(".tbl .group-row").count();
    ok("grouping splits the table into headed sections", groups >= 3, String(groups));
    ok("...and every row is still there", (await rows()) === all);
    await tools.locator(".tbl .group-row").first().click();
    await page.waitForTimeout(200);
    ok("a group collapses", (await rows()) < all);
    await tools.locator(".tbl .group-row").first().click();
    await page.waitForTimeout(200);
    // A two-state field is a switch in the cell: one press, no form. The state it takes
    // decides what the table filters by first, so the two belong together.
    {
      const cells = tools.locator(".cell-toggle");
      const total = await cells.count();
      ok("a two-state field is a switch in the cell", total === all, `${total} of ${all}`);
      const onBefore = await tools.locator(".cell-toggle.on").count();
      await cells.first().click();
      await page.waitForTimeout(250);
      const onAfter = await tools.locator(".cell-toggle.on").count();
      ok("one press flips it", Math.abs(onAfter - onBefore) === 1, `${onBefore} → ${onAfter}`);
      await cells.first().click();
      await page.waitForTimeout(250);
      ok("...and back", (await tools.locator(".cell-toggle.on").count()) === onBefore);
      ok("the switched field is the first facet offered",
        (await tools.locator(".facet-btn").first().innerText()).trim().startsWith("In scope"),
        await tools.locator(".facet-btn").first().innerText());
    }

    // A fold is a layout, and a layout has to survive leaving the tab and coming back.
    // It must NOT survive into the study: it belongs to whoever is reading, and a study
    // that recorded it would carry it into the export, the import diff and the log.
    {
      await tools.locator(".tbl .group-row").first().click();
      await page.waitForTimeout(250);
      const foldedRows = await rows();
      const label = (await tools.locator(".tbl .group-row").first().innerText()).trim();
      ok("a group can be folded away", foldedRows < all);
      await page.locator(".ws-tab", { hasText: "Treatment" }).click();
      await page.waitForTimeout(300);
      await page.locator(".ws-tab", { hasText: "Compliance" }).click();
      await page.waitForTimeout(400);
      const back = page.locator(".panel", { has: page.locator(".tbl-tools") }).first();
      const backRows = await back.locator(".tbl tbody tr.row-clickable").count();
      const backGroups = await back.locator(".tbl .group-row").count();
      if (backRows !== foldedRows) console.log(`   rows back=${backRows} folded=${foldedRows} all=${all} groupRows=${backGroups} groupSel=${await back.locator("select.tbl-group").inputValue()}`);
      ok("...and is still folded on the way back", backRows === foldedRows);
      ok("...the same group, not just the same count",
        (await back.locator(".tbl .group-row").first().innerText()).trim() === label);
      const inStudy = await page.evaluate(() => JSON.stringify(window.localStorage.getItem("aurelian_view_folds") ?? "").length > 2);
      ok("...remembered outside the study", inStudy);
      await back.locator(".tbl .group-row").first().click();   // leave it as we found it
      await page.waitForTimeout(250);
    }

    await tools.locator("select.tbl-group").selectOption({ label: "no grouping" });
    await page.waitForTimeout(200);
    ok("ungrouping restores the plain table", (await tools.locator(".tbl .group-row").count()) === 0 && (await rows()) === all);
  }

  // How WIDE a table is, rather than how long. The window here is 1280px - the commonest
  // one - which leaves a panel 958px wide. A table is sized by what its columns hold; the
  // ones that still do not fit pin their title column and let the reader put columns away.
  {
    await page.locator(".ws-tab", { hasText: "Treatment" }).click();
    await page.waitForTimeout(350);
    const measures = page.locator(".panel", { has: page.locator(".tbl-tools") })
      .filter({ hasText: "Security Measures" }).first();
    const width = async (sel) => measures.locator(sel).first().evaluate((el) => Math.round(el.getBoundingClientRect().width));

    // Eight columns cannot be made to fit 958px, so that one still scrolls - but every
    // table of four value columns or fewer now fits, which is what this guards. Sizing
    // them by field type rather than by one flat width is what bought it; measured in
    // harness/table-width.mjs.
    const seen = [];
    for (const tab of ["Assets & Scope", "Risk Sources", "Strategic Scenarios",
                       "Operational Scenarios", "Treatment", "Compliance"]) {
      await page.locator(".ws-tab", { hasText: tab }).click();
      await page.waitForTimeout(300);
      seen.push(...await page.evaluate((t) => [...document.querySelectorAll(".panel-body")]
        .filter((b) => b.querySelector("table.tbl"))
        .map((b) => ({ tab: t, cols: b.querySelectorAll("thead th").length,
                       over: b.scrollWidth - b.clientWidth })), tab));
    }
    // Two things a table gets wrong quietly, both found by counting rather than looking:
    // a filler column left over from an earlier layout (head and rows then disagree, or a
    // column carries no header at all), and width the columns never take up because a stale
    // <col> still reserves it. Neither shows as a broken page.
    const shape = await tableShape();
    ok("no table carries a column with neither a header nor anything in it",
      shape.every((t) => t.headless === 0), JSON.stringify(shape.filter((t) => t.headless)));
    ok("...and every table's columns take up its full width",
      shape.every((t) => Math.abs(t.leftover) <= 1), JSON.stringify(shape.filter((t) => Math.abs(t.leftover) > 1)));
    ok("...with head and rows in step",
      shape.every((t) => t.cols === t.cells), JSON.stringify(shape.filter((t) => t.cols !== t.cells)));

    const tooWide = seen.filter((t) => t.cols <= 5 && t.over > 2);
    ok("a table of four value columns or fewer fits a 1280px window",
      tooWide.length === 0, JSON.stringify(tooWide));
    ok("...and the page itself never scrolls sideways",
      await page.evaluate(() => document.scrollingElement.scrollWidth <= document.scrollingElement.clientWidth));
    await page.locator(".ws-tab", { hasText: "Treatment" }).click();
    await page.waitForTimeout(350);

    const menu = measures.locator(".facet-menu", { hasText: "Columns" }).first();
    ok("a wide table offers the choice of which columns to show", (await menu.count()) === 1);
    const cols = () => measures.locator(".tbl thead th").count();
    const before = await cols();
    const wideBefore = await width(".tbl");
    await menu.locator(".facet-btn").click();
    await page.waitForTimeout(200);
    await menu.locator(".facet-opt", { hasText: "Protects assets" }).first().click();
    await page.waitForTimeout(250);
    ok("putting a column away removes it from the table", (await cols()) === before - 1);
    ok("...and the table gets narrower by that column", (await width(".tbl")) < wideBefore,
      `${wideBefore} → ${await width(".tbl")}`);
    ok("...and the button says how many are left",
      (await menu.locator(".facet-btn .facet-n").innerText()).trim() === `${before - 2}/${before - 1}`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    ok("the columns menu closes on Escape", (await menu.locator(".facet-pop").count()) === 0);

    // Same rule as the folds: an arrangement belongs to the reader, so it survives the
    // tab but never enters the study.
    await page.locator(".ws-tab", { hasText: "Compliance" }).click();
    await page.waitForTimeout(300);
    await page.locator(".ws-tab", { hasText: "Treatment" }).click();
    await page.waitForTimeout(400);
    const back = page.locator(".panel", { has: page.locator(".tbl-tools") })
      .filter({ hasText: "Security Measures" }).first();
    ok("the column that was put away is still away on the way back",
      (await back.locator(".tbl thead th").count()) === before - 1);
    ok("...remembered outside the study",
      await page.evaluate(() => (window.localStorage.getItem("aurelian_view_cols") ?? "").includes("protects")));

    // The title column stays put while the rest scrolls, and only paints itself once it
    // has something to hold back.
    const body = back.locator(".panel-body").first();
    ok("an unscrolled table is not pinned",
      !(await body.evaluate((el) => el.className.includes("pinned"))));
    await body.evaluate((el) => { el.scrollLeft = 380; el.dispatchEvent(new Event("scroll", { bubbles: true })); });
    await page.waitForTimeout(250);
    const pin = await body.evaluate((el) => ({
      pinned: el.className.includes("pinned"),
      offset: Math.round(el.querySelector("thead th").getBoundingClientRect().left - el.getBoundingClientRect().left),
    }));
    ok("a scrolled table keeps its title column at the edge", pin.pinned && pin.offset === 0, JSON.stringify(pin));
    await back.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await back.screenshot({ path: `${shots}/TableWide.png` });

    // Put it back the way it was found: the sections after this one count columns.
    await back.locator(".facet-menu", { hasText: "Columns" }).locator(".facet-btn").click();
    await page.waitForTimeout(200);
    await back.locator(".facet-opt", { hasText: "show all" }).click();
    await page.waitForTimeout(250);
    ok("show all brings every column back", (await back.locator(".tbl thead th").count()) === before);
    await page.keyboard.press("Escape");
    await body.evaluate((el) => { el.scrollLeft = 0; el.dispatchEvent(new Event("scroll", { bubbles: true })); });
    await page.locator(".ws-tab", { hasText: "Compliance" }).click();
    await page.waitForTimeout(300);
  }

  // Where the attempts are stopped: the panel has to show HOW the share was arrived at.
  // A single demand figure against three attacker figures cannot produce it - the demand
  // is drawn too, and leaving its spread out is what made the number unreconstructable.
  {
    await page.locator(".ws-tab", { hasText: "Risk Quantification" }).click();
    await page.waitForTimeout(1200);
    const row = page.locator(".qb-row").filter({ hasText: /not capable enough/i }).first();
    ok("the break-down offers the baseline row", (await row.count()) === 1);
    await row.click();
    await page.waitForTimeout(500);
    const card = page.locator(".ft-card").first();
    const txt = await card.innerText();
    ok("the demand is shown as a sum of its terms",
      /getting in/.test(txt) && /tooling/.test(txt) && /breadth/.test(txt) && /staying in/.test(txt));
    ok("...drawn as one bar, not only listed", (await card.locator("svg").count()) >= 2);
    // The three-point range, and the spread that turns one figure into it.
    const asks = await card.locator(".bx-line", { hasText: /^attack asks/ }).first().innerText();
    ok("the attack's demand is shown as a range", /\d+(\.\d+)?%\s*·\s*\d+(\.\d+)?%\s*·\s*\d+(\.\d+)?%/.test(asks), asks.replace(/\n/g, " "));
    ok("...saying what widened it", /±\s*\d+ points/.test(asks), asks.replace(/\n/g, " "));
    ok("the comparison the simulation makes is named", /one draw from each/i.test(txt));
    ok("...and its outcome is the share on the row", /attacker ≤ what the attack asks/i.test(txt));
    // A backdrop that takes a click and ignores the key is a dialog you cannot put down
    // without reaching for the mouse. Ten dialogs did that while the menus beside them
    // closed on Escape - now they share one backdrop, so this is checked once.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    ok("Escape closes a dialog, not only a click outside", (await page.locator(".ft-card").count()) === 0);
    await page.locator(".ws-tab", { hasText: "Compliance" }).click();
    await page.waitForTimeout(300);
  }

  // Taking something out of scope: what goes with it, what refuses, and what it does to
  // the figures. There is ONE way in and out of the perimeter now - the switch in the table.
  // A separate button was the same field under a second name with a second rule: it carried
  // dependants where the switch left them behind, so a strategic scenario could be outside
  // the perimeter while the operational scenario implementing it stayed inside.
  {
    await page.locator(".ws-tab", { hasText: "Strategic Scenarios" }).click();
    await page.waitForTimeout(500);
    ok("there is no second door into the perimeter",
      (await page.locator(".detail-actions button", { hasText: /Disable|Enable/ }).count()) === 0);
    const panel = page.locator(".panel").filter({ has: page.locator(".panel-head h3", { hasText: /^Strategic Scenarios/ }) });
    const row = panel.locator("tbody tr.row-clickable", { hasText: "Ransomware via maintenance access" }).first();
    await row.locator(".cell-toggle").click();
    await page.waitForTimeout(500);
    const dlg = page.locator(".modal-lg").last();
    const txt = await dlg.innerText();
    ok("the switch asks when something hangs on the record", (await page.locator(".scope-dlg").count()) === 1);
    ok("...and lists what goes with it", /Disabled with it/i.test(txt) && /Operational Scenario/.test(txt), txt.slice(0, 140));
    ok("...and what else is affected", /Also affected/i.test(txt) && /Security Measure/.test(txt));
    await dlg.locator(".modal-lg-foot .btn.danger").click();
    await page.waitForTimeout(700);
    // The cascade is the point: the dependants have to follow, or the study says two things.
    await page.locator(".ws-tab", { hasText: "Operational Scenarios" }).click();
    await page.waitForTimeout(600);
    const out = await page.locator(".cell-toggle:not(.on)").count();
    console.log(`   ${out} dependent record(s) followed the strategic scenario out`);
    ok("...and the dependants follow it out", out >= 6);

    // A record something in play still points at refuses, and names it.
    await page.locator(".ws-tab", { hasText: "Assets" }).click();
    await page.waitForTimeout(500);
    const sa = page.locator(".panel").filter({ has: page.locator(".panel-head h3", { hasText: /^Supporting Assets/ }) });
    await sa.locator("tbody tr.row-clickable", { hasText: "HIS database" }).first().locator(".cell-toggle").click();
    await page.waitForTimeout(500);
    const dlg2 = page.locator(".modal-lg").last();
    const t2 = await dlg2.innerText();
    ok("a record that is still pointed at refuses", /Currently in use by/i.test(t2));
    // ...and the refusal can be overruled, the way a delete can: what stands in the way
    // goes too, and whatever stands in ITS way after that. A study is the analyst's to
    // decide; the tool's job is to say what the decision costs before it is taken.
    const over = dlg2.locator(".modal-lg-foot button", { hasText: /Out of scope anyway/ });
    ok("...and the refusal can be overruled, with the price named", (await over.count()) === 1, t2.slice(0, 160));
    const said = Number((await over.innerText()).match(/\((\d+)\)/)?.[1] ?? 0);
    ok("...naming more records than stand in the way", said > 1);
    await over.click();
    await page.waitForTimeout(800);
    const left = await page.locator(".panel").filter({ has: page.locator(".panel-head h3", { hasText: /^Supporting Assets/ }) })
      .locator(".cell-toggle.on").count();
    console.log(`   overruled: ${said} records in all, ${left} supporting assets still in scope`);
    ok("...and the record itself is out", left < 7);

    // Back in is one click: it conflicts with nothing, so there is nothing to ask.
    await page.locator(".ws-tab", { hasText: "Strategic Scenarios" }).click();
    await page.waitForTimeout(500);
    const back = page.locator(".panel").filter({ has: page.locator(".panel-head h3", { hasText: /^Strategic Scenarios/ }) })
      .locator("tbody tr.row-clickable", { hasText: "Ransomware via maintenance access" }).first();
    await back.locator(".cell-toggle").click();
    await page.waitForTimeout(500);
    ok("coming back in asks nothing", (await page.locator(".scope-dlg").count()) === 0);
    ok("...and takes effect", (await back.locator(".cell-toggle.on").count()) === 1);
    await page.locator(".ws-tab", { hasText: "Compliance" }).click();
    await page.waitForTimeout(300);
  }

  // The completeness checks judge the study, not the catalogue: a requirement that is out
  // of scope is not a gap, and a seeded framework of several hundred entries would bury
  // the findings about the few that are in scope.
  {
    const panel = page.locator(".panel", { has: page.locator(".tbl-tools") }).first();
    const recorded = await panel.locator(".tbl tbody tr.row-clickable").count();
    const inScope = await panel.locator(".cell-toggle.on").count();
    await page.locator(".ws-tab", { hasText: "Checks" }).click();
    await page.waitForTimeout(250);
    const card = page.locator(".lint-card", { has: page.locator(".lint-title", { hasText: "Requirements not fulfilled by any measure" }) }).first();
    ok("the requirements check is reported", (await card.count()) === 1);
    const counted = Number((await card.locator(".lint-count").innerText()).split("/")[1]);
    ok("a check counts what is in scope, not the whole catalogue",
      counted === inScope && counted < recorded, `${counted} judged, ${inScope} in scope, ${recorded} recorded`);
    await page.locator(".ws-tab", { hasText: "Compliance" }).click();
    await page.waitForTimeout(250);
  }

  const reqRow = page.locator(".tbl tbody tr.row-clickable").first();
  const reqName = (await reqRow.locator(".name").innerText()).trim();
  await reqRow.click();
  await page.waitForTimeout(200);
  // Deleting now asks first, and the dialog says what goes with it - so the confirmation
  // is part of deleting, not an extra step this check may skip.
  await page.locator(".detail-actions button", { hasText: "Delete" }).first().click();
  await page.waitForTimeout(300);
  ok("deleting asks before it deletes", (await page.locator(".scope-dlg").count()) > 0);
  await page.locator(".scope-dlg .modal-lg-foot .danger").click();
  await page.waitForTimeout(400);
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
  ok("it starts out at the defaults", /defaults, unchanged/i.test(await page.locator(".cal-intro").innerText()));
  // Markers that appear on the first edit must already occupy their space, or every
  // table below them jumps down the page.
  ok("...with the change markers already in the layout, merely hidden",
    (await page.locator(".cal .badge.off").count()) === 1 && (await page.locator(".cal-edited.off").count()) > 0);
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
    (await page.locator(".cal .panel-head .badge.off").count()) === 0);
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

  // Defence in depth: one curve, switchable by implementation level, so the saturation
  // and the trade between many weak measures and one strong one are both visible.
  const depth = page.locator(".cal-table", { hasText: "Defence in depth" });
  await depth.scrollIntoViewIfNeeded();
  ok("the stacking relationship is drawn, not described", (await depth.locator(".depth-svg").count()) === 1);
  // The curve must be in a unit that means something - attempts, not an intermediate.
  ok("...in attempts getting through, not in an intermediate",
    /how many get through/i.test(await depth.locator(".depth-key").innerText()));
  ok("...and states the case it assumes",
    /better than half/i.test(await depth.locator(".depth-svg").evaluate((el) => el.textContent ?? "")));
  ok("weights read as multipliers, not as shares of attacks",
    /×0\.33/.test(await depth.innerText()) || /x0\.33/.test(await depth.innerText()));
  ok("...and the level switch uses the scale's own labels",
    /none/.test(await depth.locator(".depth-switch").innerText())
    && /substantial/.test(await depth.locator(".depth-switch").innerText()));
  const atFull = await depth.locator(".depth-note").innerText();
  await depth.locator(".depth-switch .cal-seg-b").nth(1).click();
  await page.waitForTimeout(200);
  ok("switching the level redraws the curve", (await depth.locator(".depth-note").innerText()) !== atFull);
  await depth.locator(".depth-switch .cal-seg-b").first().click();
  await page.waitForTimeout(200);
  ok("a measure implemented 'none' counts for nothing",
    /counts for nothing/i.test(await depth.locator(".depth-note").innerText()));
  await depth.locator(".depth-switch .cal-seg-b").last().click();
  await page.waitForTimeout(150);

  // Values that are really a choice between named cases are choices, not numbers, and
  // the techniques are ranked by what they demand rather than by identifier.
  const tool = page.locator(".cal-table", { hasText: "Tooling maturity, per technique" });
  await tool.scrollIntoViewIfNeeded();
  ok("tooling maturity is a named choice, not a number box", (await tool.locator(".cal-seg").count()) > 40);
  const caps = await tool.locator(".cal-sub").allInnerTexts();
  ok("...and the techniques are ranked by what they demand",
    /bespoke/i.test(caps.join(" ")) && /practitioner/i.test(caps.join(" "))
    && caps.findIndex((c) => /bespoke/i.test(c)) < caps.findIndex((c) => /commodity/i.test(c)));

  // The treatment workshop gets the same panel, scoped to what a measure is worth -
  // the parameters its own tables are about, at the top and shut by default.
  await page.locator(".ws-tab", { hasText: "Treatment" }).click();
  await page.waitForTimeout(900);
  ok("treatment has a control-parameter panel", (await page.locator(".cal").count()) === 1);
  const order = await page.locator(".main .panel .panel-head h3").allInnerTexts();
  ok("...directly below Chain defence, where its effect is shown",
    order[0] === "Chain defence" && order[1] === "Control parametrization");
  ok("...shut by default", !(await page.locator(".cal-body").count()));
  await page.locator(".cal .panel-head .btn").click();
  await page.waitForTimeout(300);
  const scoped = await page.locator(".cal-table h3").allInnerTexts();
  ok("...showing only the measure tables, not the whole calibration",
    scoped.length === 2 && /Defence in depth/.test(scoped[0]));
  ok("...and the same controls as the quantification panel",
    (await page.locator(".cal .dial-track").count()) > 5 && (await page.locator(".cal .depth-svg").count()) === 1);
  // The strengths are grouped by the class they belong to, with the channel each acts
  // through - a flat list of nine gave no clue which control type a figure was about.
  const classes = await page.locator(".cal-class-h b").allInnerTexts();
  ok("effect strengths are grouped by control class",
    ["Detective", "Corrective", "Deterrent", "Avoidance"].every((c) => classes.includes(c)));
  ok("...each naming the channel it acts through",
    /reduces the number of attempts made/i.test(await page.locator(".cal-class").nth(2).innerText()));

  // Sector lives in the scope workshop, with what it actually does to the numbers.
  await page.locator(".ws-tab", { hasText: "Assets" }).click();
  await page.waitForTimeout(350);
  ok("the sector picker sits in workshop 1", (await page.locator(".panel-head select").count()) === 1);
  ok("...as the app's standard panel", (await page.locator(".panel.ws-accent .panel-head h3").first().innerText()) === "Sector");
  const sectTxt = await page.locator(".sect-body").innerText();
  ok("...and explains what is specific about the chosen sector", /clinical systems|availability/i.test(sectTxt));
  ok("...and names the rate exceptions it actually triggers",
    /applied to the attack rate/i.test(sectTxt) && /Cybercriminals/.test(sectTxt));

  // The sector selects the base-rate exception behind every attempt rate, so changing it
  // changes every risk figure in the study. That has to be a recorded change like any
  // other - it used to be written straight into the study with nothing in the log.
  {
    const before = await page.locator(".panel-head select").inputValue();
    const other = before === "Manufacturing" ? "Finance & insurance" : "Manufacturing";
    await page.locator(".panel-head select").selectOption(other);
    await page.waitForTimeout(400);
    await page.locator(".sidebar .nav-item", { hasText: "Timeline" }).click();
    await page.waitForTimeout(400);
    const tl = await page.locator(".tl-body").first().innerText();
    ok("changing the sector is recorded as a change", /sector/i.test(tl), tl.split("\n").slice(0, 4).join(" | "));
    ok("...and the log still verifies afterwards",
      /integrity verified/i.test(await page.locator(".tl-stats").innerText())
      && (await page.locator(".tl-warn").count()) === 0);
    // Put it back; the sections after this read the sample's own sector.
    await page.locator(".sidebar .nav-item", { hasText: "Studies" }).click();
    await page.waitForTimeout(250);
    await page.locator(".study-card, .card").first().click().catch(() => {});
    await page.waitForTimeout(400);
    await page.locator(".ws-tab", { hasText: "Assets" }).click();
    await page.waitForTimeout(350);
    await page.locator(".panel-head select").selectOption(before);
    await page.waitForTimeout(350);
  }

  // Documents section
  await page.locator(".sidebar .nav-item", { hasText: "Documents" }).click();
  await page.waitForTimeout(200);
  {
    // The same three questions as in the workshops, asked where a table lives OUTSIDE them -
    // a check that only walks the tabs never sees this view. The corpus is empty in this
    // run (a reference is only kept through the file picker, which is `npm run test:corpus`),
    // so the assertion names both admissible states: a table that holds up, or the empty
    // state that explains why there is none. What it will not accept is neither.
    const shape = await tableShape();
    const empty = await page.locator(".empty", { hasText: /document|reference|corpus/i }).count();
    ok("the documents view is checked for the same three faults",
      shape.length
        ? shape.every((t) => t.headless === 0 && t.cols === t.cells && Math.abs(t.leftover) <= 1)
        : empty > 0,
      shape.length ? JSON.stringify(shape) : `no table, empty state: ${empty}`);
  }
  const docBody = await page.locator(".content").innerText();
  ok("documents section renders", docBody.includes("Documents") && docBody.toLowerCase().includes("reference"));
  await page.screenshot({ path: `${shots}/Documents.png` });

  // Extraction dialog (UI only — the model download needs network)
  await page.locator(".page-head button", { hasText: "Extract" }).click();
  await page.waitForTimeout(200);
  ok("extraction dialog opens", (await page.locator(".overlay .modal-lg").count()) > 0);
  ok(llmBuild ? "extraction offers fast + smart engines" : "extraction offers the embedding engine alone",
    (await page.locator(".modal-lg .seg-btn", { hasText: "embeddings" }).count()) > 0
    && (await page.locator(".modal-lg .seg-btn", { hasText: "local LLM" }).count()) === (llmBuild ? 1 : 0));
  ok("extraction defers model loading to the Model section", (await page.locator(".modal-lg", { hasText: "managed in the" }).count()) > 0);
  ok("extract disabled until a model is loaded", await page.locator(".modal-lg button", { hasText: "Extract" }).isDisabled());
  await page.screenshot({ path: `${shots}/Extraction.png` });
  await page.keyboard.press("Escape").catch(() => {});
  await page.locator(".overlay").click({ position: { x: 5, y: 5 } }).catch(() => {});

  // Two ways to protect an export, answering different problems: a password has to reach
  // the recipient somehow, a key does not. The second is only offered once a key has been
  // named, because encrypting to nobody is an unopenable file.
  await page.locator(".sidebar .nav-item", { hasText: "Studies" }).click();
  await page.waitForTimeout(250);
  {
    if (!(await page.locator(".ws-tabs").count())) {
      await page.getByText("Riverside General Hospital").first().click();
      await page.waitForSelector(".ws-tabs", { timeout: 10000 });
    }
    await page.locator("button", { hasText: "Export / Import" }).first().click();
    await page.waitForSelector(".menu-pop", { timeout: 8000 });
    const menu = page.locator(".menu-pop").first();
    const body = await menu.innerText().catch(() => "");
    // Escape closes a drop-down. Without it the backdrop takes the click and nothing else,
    // and a reader reaching for the habitual way out finds the page apparently stuck -
    // which then fails a later, unrelated interaction.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    ok("Escape closes the export menu", (await page.locator(".menu-pop").count()) === 0);
    await page.locator("button", { hasText: "Export / Import" }).first().click();
    await page.waitForSelector(".menu-pop", { timeout: 8000 });
    if (!(/Password/.test(body) && /Key/.test(body))) console.log("   menu:", body.replace(/\n/g, " | ").slice(0, 160));
    ok("the export offers both kinds of protection", /Password/.test(body) && /\bKey\b/.test(body));
    await menu.locator(".seg-btn", { hasText: /^Key$/ }).click();
    await page.waitForTimeout(250);
    const rows = await menu.locator(".menu-to-row").count();
    ok("...listing the keys that have been named", rows >= 1, `${rows} recipients`);
    ok("...and saying the recipient list is readable in the file",
      /readable in the file/i.test(await menu.innerText()));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
    await page.waitForTimeout(200);
  }

  // Model configuration section
  await page.locator(".sidebar .nav-item", { hasText: "Model" }).click();
  await page.waitForTimeout(200);
  const modelBody = await page.locator(".content").innerText();
  ok("model section renders", modelBody.includes("Model") && modelBody.includes("all-MiniLM"));
  ok("model section lists options", (await page.locator(".model-row").count()) >= 2);
  // One file, two builds: what the section must show depends on which one this is.
  if (llmBuild) {
    ok("model section manages the language models too", modelBody.includes("Language model") && modelBody.includes("SmolLM2") && modelBody.includes("Qwen2.5"));
    ok("model section offers Qwen-3B (WebLLM, level-2 default)", modelBody.includes("Qwen2.5-3B"));
  } else {
    ok("model section is embedding-only (no language model)",
      !modelBody.includes("Language model") && !modelBody.includes("SmolLM2") && !modelBody.includes("Qwen2.5"));
  }

  // What the SECTION shows is what a reader sees; what the FILE carries is what ships. The
  // gate in domain/gen.ts claims the released build drops the generative branch, and that
  // claim went unchecked for three releases while the file still carried the sentence
  // describing a model it cannot run. So it is read off the artefact, both ways round: the
  // released build must not carry these, and the LLM build must - otherwise this passes by
  // testing the wrong file.
  {
    const art = readFileSync(distPath, "utf8");
    const marks = {
      "model list": /SmolLM2|Qwen2\.5/,
      "runtime it talks to": /chat\/completions/,
      "extraction entry point": /extractByLLM/,
      "sampling parameter": /"?temperature"?\s*[:=]/,
      "language-model prose": /language model/i,
    };
    for (const [what, re] of Object.entries(marks)) {
      const hit = re.test(art);
      ok(llmBuild ? `the LLM build carries the ${what}` : `the released file carries no ${what}`,
        llmBuild ? hit : !hit, re.source);
    }
  }
  // DELETING ASKS FIRST, and says what it will take. The cascade removes 13 of 62 records in
  // the sample from a single risk source, which is a fifth of the study on one click; the
  // dialog is the only place a reader sees that before it happens. Afterwards the survivors
  // carry a mark where the reference was, read out of the change log.
  {
    // Back into the study: this runs after the Model section, where none is open.
    await page.locator(".sidebar .nav-item", { hasText: "Studies" }).click();
    await page.waitForTimeout(300);
    if (!(await page.locator(".ws-tabs").count())) {
      await page.getByText("Riverside").first().click();
      await page.waitForSelector(".ws-tabs", { timeout: 10000 });
    }
    await page.locator(".ws-tab", { hasText: "Assets & Scope" }).click();
    await page.waitForTimeout(400);
    const rows = () => page.locator("table.tbl tbody tr:not(.detail-row):not(.group-row)").count();
    const before = await rows();
    const row = page.locator("table.tbl tbody tr", { hasText: "HIS database server" }).first();
    await row.click();
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: /Delete/ }).first().click();
    await page.waitForTimeout(400);
    ok("deleting opens a dialog instead of deleting", (await page.locator(".scope-dlg").count()) > 0);
    const said = (await page.locator(".scope-dlg .scope-lead, .scope-dlg .scope-h").allTextContents()).join(" | ");
    console.log(`   ${said}`);
    ok("...and says what loses a reference to it", /Loses a reference to it \(\d+\)/.test(said));
    await page.locator(".scope-dlg .btn.ghost").click();
    await page.waitForTimeout(300);
    ok("...cancelling deletes nothing", (await rows()) === before);
    await page.getByRole("button", { name: /Delete/ }).first().click();
    await page.waitForTimeout(300);
    await page.locator(".scope-dlg .modal-lg-foot .danger").click();
    await page.waitForTimeout(700);
    ok("...confirming deletes the record", (await rows()) === before - 1);
    await page.locator(".ws-tab", { hasText: "Operational Scenarios" }).click();
    await page.waitForTimeout(600);
    const pills = await page.locator(".chip.gone").count();
    console.log(`   ${pills} record(s) show the deleted reference`);
    ok("...and the survivors show what they lost", pills > 0);
  }

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
