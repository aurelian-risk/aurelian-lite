// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Fold memory: does it stay small, and does it stay out of the study?
//
// The feature is trivial; the ways it goes wrong are not. A view preference that writes on
// every click stalls the main thread, one that never evicts grows for as long as the
// browser lives, and one that is kept in the study travels in exports and is recorded in
// the audit log as an edit to the assessment.
//
// Run: npm run test:viewstate
import { pathToFileURL } from "node:url";

// A localStorage good enough to measure against: it counts what it is asked to do.
let writes = 0, reads = 0;
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => { reads++; return mem.has(k) ? mem.get(k) : null; },
  setItem: (k, v) => { writes++; mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
};

const need = (k) => { const v = process.env[k]; if (!v) { console.error(`set ${k}`); process.exit(2); } return v; };
const V = await import(pathToFileURL(need("MOD_V")).href);

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { c ? pass++ : fail++; console.log(`${c ? "✓" : "✗"} ${n}${d ? `  (${d})` : ""}`); };
// Wait for the write to actually land, rather than for a length of time. A fixed sleep
// against a debounce is a race: it passes on an idle machine and fails on a busy one, and
// the failure looks like the code's fault.
const settle = async (want) => {
  const target = want ?? writes + 1;
  for (let i = 0; i < 300 && writes < target; i++) await new Promise((r) => setTimeout(r, 20));
  await new Promise((r) => setTimeout(r, 20));
};

const KEY = "aurelian_view_folds";

// ── 1. it remembers, and only the deviation ─────────────────────────────────
{
  const scope = V.foldScope("study-1", "requirement", "framework");
  ok("nothing is remembered before anything is folded", V.getFolds(scope).size === 0);
  V.setFolds(scope, new Set(["NIS2", "NIST CSF"]));
  await settle();
  ok("what was folded comes back", [...V.getFolds(scope)].sort().join() === "NIS2,NIST CSF");
  // Open is the default, so an open table has to cost nothing at all - otherwise the
  // payload grows with the data rather than with what the reader did to it.
  V.setFolds(scope, new Set());
  await settle();
  ok("unfolding everything leaves nothing behind", !JSON.parse(mem.get(KEY) ?? "{}")[scope]);
}

// ── 2. writes are coalesced ─────────────────────────────────────────────────
{
  writes = 0;
  const scope = V.foldScope("study-1", "measure", "");
  for (let i = 0; i < 40; i++) V.setFolds(scope, new Set([`g${i}`]));
  ok("a burst of folds writes nothing yet", writes === 0, String(writes));
  await settle(1);
  ok("...and settles into a single write", writes === 1, String(writes));
}

// ── 3. it is bounded ────────────────────────────────────────────────────────
{
  for (let i = 0; i < 120; i++) V.setFolds(V.foldScope(`s${i}`, "t", ""), new Set(["x"]));
  await settle();
  const kept = Object.keys(JSON.parse(mem.get(KEY) ?? "{}")).length;
  ok("the number of remembered tables is capped", kept <= 60, `${kept} scopes`);
  // Eviction has to take the oldest, not whatever the object happens to yield first: the
  // table someone is using right now is the one that must survive.
  const store = JSON.parse(mem.get(KEY));
  const survivors = Object.keys(store).map((k) => Number(k.match(/^s(\d+)/)?.[1] ?? -1));
  ok("...and keeps the most recently seen", Math.min(...survivors) > 0, `oldest kept: s${Math.min(...survivors)}`);
}
{
  const scope = V.foldScope("wide", "t", "");
  V.setFolds(scope, new Set(Array.from({ length: 900 }, (_, i) => `g${i}`)));
  await settle();
  const n = JSON.parse(mem.get(KEY))[scope].k.length;
  ok("one table cannot remember an unbounded number of folds", n <= 200, `${n} keys`);
}

// ── 4. a study's folds do not outlive it ────────────────────────────────────
{
  V.setGroupKey(V.foldScope("doomed", "a"), "framework");
  V.setFolds(V.foldScope("doomed", "a", ""), new Set(["x"]));
  V.setFolds(V.foldScope("doomed", "b", ""), new Set(["y"]));
  V.setFolds(V.foldScope("kept", "a", ""), new Set(["z"]));
  await settle();
  V.forgetStudy("doomed");
  await settle();
  const store = JSON.parse(mem.get(KEY));
  ok("deleting a study forgets its folds", !Object.keys(store).some((k) => k.startsWith("doomed|")));
  ok("...and its arrangement too",
    !Object.keys(JSON.parse(mem.get("aurelian_view_group") ?? "{}")).some((k) => k.startsWith("doomed|")));
  ok("...and leaves other studies alone", !!store[V.foldScope("kept", "a", "")]);
}

// ── 5. reading is cheap ─────────────────────────────────────────────────────
{
  reads = 0;
  const scope = V.foldScope("study-1", "requirement", "framework");
  for (let i = 0; i < 500; i++) V.getFolds(scope);
  ok("repeated reads do not go back to storage every time", reads <= 1, `${reads} storage reads for 500 lookups`);
}

// ── 6. grouping by a different field is a different layout ──────────────────
{
  const byFw = V.foldScope("s", "requirement", "framework");
  const byCat = V.foldScope("s", "requirement", "category");
  V.setFolds(byFw, new Set(["NIS2"]));
  await settle();
  ok("folds do not leak between two ways of grouping the same table", V.getFolds(byCat).size === 0);
}

// ── 7. arrangement comes back, selection does not ───────────────────────────
{
  const scope = V.foldScope("s", "requirement");
  ok("a table starts ungrouped", V.getGroupKey(scope) === "");
  V.setGroupKey(scope, "framework");
  await settle();
  ok("how it was grouped comes back", V.getGroupKey(scope) === "framework");
  V.setGroupKey(scope, "");
  await settle();
  ok("...and going back to a plain table leaves nothing behind",
    !JSON.parse(mem.get("aurelian_view_group") ?? "{}")[scope]);
  // There is no API for it and there should not be: a facet remembered across visits
  // hides rows the reader cannot see they are missing.
  ok("nothing here remembers a filter or a search",
    !Object.keys(V).some((k) => /facet|query|search|filter/i.test(k)), Object.keys(V).join(","));
}

// ── 8. it survives storage refusing to co-operate ───────────────────────────
{
  const real = globalThis.localStorage.setItem;
  globalThis.localStorage.setItem = () => { throw new Error("QuotaExceededError"); };
  V.setFolds(V.foldScope("s", "t", ""), new Set(["x"]));
  await settle();
  ok("a full or blocked storage does not take the app down with it", true);
  globalThis.localStorage.setItem = real;
}

console.log(`\n${pass}/${pass + fail} view-state assertions passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
