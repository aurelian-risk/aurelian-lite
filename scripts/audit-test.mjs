// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Unit test for the study change log: the hash chain, and what it does and does not
// detect. These are the claims the tool makes to an auditor, so they are pinned here
// rather than left to hold by accident.
//
// Run: npm run test:audit
import { pathToFileURL } from "node:url";

const need = (n) => { const v = process.env[n]; if (!v) { console.error(`set ${n}`); process.exit(2); } return v; };
const { sealLog, appendLog, appendAll, verifyLog, hashValues, entryOf, diffValues, entryKey, verdictText } = await import(pathToFileURL(need("MOD_A")).href);
const { makeSampleStudy } = await import(pathToFileURL(need("MOD_S")).href);

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? (pass++, console.log("✓", name)) : (fail++, console.log("✗", name, extra)); };
const clone = (o) => JSON.parse(JSON.stringify(o));

// A tiny study: two records, one of them edited once.
const recs = [
  { id: "a", values: { name: "Alpha", sev: 3 } },
  { id: "b", values: { name: "Beta", sev: 1 } },
];
const base = (id, kind, ts, extra = {}) => ({
  ts, editor: "Analyst A", kind, entity: id, entityType: "thing",
  title: recs.find((r) => r.id === id).values.name, ...extra,
});
const mkLog = () => sealLog([
  base("a", "create", "2026-01-01T00:00:00.000Z", { state: hashValues(recs[0].values) }),
  base("b", "create", "2026-01-02T00:00:00.000Z", { state: hashValues({ name: "Beta", sev: 2 }) }),
  base("b", "update", "2026-01-03T00:00:00.000Z", {
    changes: [{ field: "sev", from: 2, to: 1 }], comment: "lowered", state: hashValues(recs[1].values),
  }),
]);

// ── the chain itself ──────────────────────────────────────────────────────
{
  const log = mkLog();
  ok("a sealed log verifies", verifyLog(log, recs).ok);
  ok("entries are numbered from 1, consecutively", log.map((e) => e.seq).join() === "1,2,3");
  ok("the first entry has no predecessor", log[0].prevHash === "");
  ok("each entry links to the one before it", log[1].prevHash === log[0].hash && log[2].prevHash === log[1].hash);
  ok("appending keeps it valid", verifyLog(appendLog(log, base("a", "update", "2026-01-04T00:00:00.000Z",
    { changes: [{ field: "sev", from: 3, to: 4 }], state: hashValues({ ...recs[0].values, sev: 4 }) })),
    [{ id: "a", values: { ...recs[0].values, sev: 4 } }, recs[1]]).ok);
  ok("a record's own history is the log filtered by id", entryOf(log, "b").length === 2 && entryOf(log, "a").length === 1);
}

// ── what tampering with the log looks like ────────────────────────────────
{
  const t = (label, mutate, expect) => {
    const log = clone(mkLog());
    mutate(log);
    const v = verifyLog(log, recs);
    ok(label, expect(v), JSON.stringify({ chainBroken: v.chainBroken, brokenAt: v.brokenAt, drifted: v.drifted, untracked: v.untracked }));
  };
  const broken = (v) => v.chainBroken && !v.ok;
  t("rewriting an editor breaks the chain", (l) => { l[0].editor = "someone else"; }, broken);
  t("rewriting a recorded value breaks the chain", (l) => { l[2].changes[0].to = 99; }, broken);
  t("rewriting a comment breaks the chain", (l) => { l[2].comment = "tampered"; }, broken);
  t("back-dating an entry breaks the chain", (l) => { l[1].ts = "2020-01-01T00:00:00.000Z"; }, broken);
  t("deleting an entry from the middle breaks the chain", (l) => l.splice(1, 1), broken);
  t("reordering entries breaks the chain", (l) => { [l[0], l[1]] = [l[1], l[0]]; }, broken);
  t("renumbering to hide a gap breaks the chain", (l) => { l.splice(1, 1); l[1].seq = 2; }, broken);
  t("naively appending an entry breaks the chain",
    (l) => l.push({ seq: 4, ts: "2026-01-05T00:00:00.000Z", editor: "x", kind: "update", entity: "a", entityType: "thing", title: "Alpha", prevHash: "", hash: "" }), broken);
  t("the first broken entry is named", (l) => { l[1].editor = "x"; }, (v) => v.brokenAt === 2);
}

// ── what an edit made OUTSIDE the application looks like ──────────────────
{
  const log = mkLog();
  const edited = [{ id: "a", values: { name: "Alpha", sev: 4 } }, recs[1]];   // sev changed in the file
  const v = verifyLog(log, edited);
  ok("editing a value in the file leaves the chain intact", !v.chainBroken);
  ok("...but the record no longer matches the log", !v.ok && v.drifted.join() === "a");

  const added = [...recs, { id: "c", values: { name: "Gamma" } }];
  const v2 = verifyLog(log, added);
  ok("a record added to the file from outside is reported as untracked", !v2.ok && v2.untracked.join() === "c");

  // Truncating the tail keeps the chain consistent - it is the state fingerprint that
  // catches it, which is exactly why the log binds itself to the data.
  const v3 = verifyLog(log.slice(0, 2), recs);
  ok("truncating the log at the end still leaves a consistent chain", !v3.chainBroken);
  ok("...but the newest state no longer matches, so it is caught", !v3.ok && v3.drifted.join() === "b");
}

// ── deletes outlive their records ─────────────────────────────────────────
{
  const log = appendLog(mkLog(), { ts: "2026-01-05T00:00:00.000Z", editor: "Analyst B", kind: "delete",
    entity: "b", entityType: "thing", title: "Beta", comment: "out of scope" });
  const v = verifyLog(log, [recs[0]]);                    // "b" is gone from the study
  ok("a deleted record verifies once it is gone", v.ok);
  ok("its entries stay in the log", entryOf(log, "b").length === 3);
  ok("the entry still carries the title, so the timeline can name it", entryOf(log, "b").pop().title === "Beta");
  const stillThere = verifyLog(log, recs);
  ok("a record that was deleted but is still in the file is reported", !stillThere.ok && stillThere.untracked.join() === "b");
}

// ── re-sealing: what confirming an import does ────────────────────────────
{
  const tampered = clone(mkLog());
  tampered[0].editor = "forged";
  ok("the tampered log is rejected", verifyLog(tampered, recs).chainBroken);
  const resealed = sealLog(tampered.map(({ seq, hash, prevHash, ...rest }) => rest));
  ok("re-sealing makes it verify again", verifyLog(resealed, recs).ok);
  ok("...and re-sealing does NOT restore the original content", resealed[0].editor === "forged");
  const withImport = appendAll(resealed, recs.map((r) => ({
    ts: "2026-02-01T00:00:00.000Z", editor: "Analyst C", kind: "import", entity: r.id,
    entityType: "thing", title: r.values.name, comment: "Imported from “peer.json”.", state: hashValues(r.values),
  })));
  ok("the import is recorded as such", withImport.filter((e) => e.kind === "import").length === 2);
  ok("the study verifies after the import", verifyLog(withImport, recs).ok);
}

// ── fingerprints and diffs ────────────────────────────────────────────────
{
  ok("a value fingerprint ignores key order",
    hashValues({ a: 1, b: 2 }) === hashValues({ b: 2, a: 1 }));
  ok("...but not the values themselves", hashValues({ a: 1 }) !== hashValues({ a: 2 }));
  ok("nested values are covered", hashValues({ a: [1, 2] }) !== hashValues({ a: [2, 1] }));
  ok("a diff reports only what changed",
    diffValues({ a: 1, b: 2 }, { a: 1, b: 3 }).map((c) => c.field).join() === "b");
}

// ── the sample study ships a valid, complete log ──────────────────────────
{
  const s = makeSampleStudy();
  const v = verifyLog(s.log, s.entities);
  ok("the sample study's log verifies", v.ok, JSON.stringify({ drifted: v.drifted.length, untracked: v.untracked.length }));
  ok("every record in the sample is covered by the log",
    new Set(s.log.map((e) => e.entity)).size === s.entities.length,
    `${new Set(s.log.map((e) => e.entity)).size} of ${s.entities.length}`);
  ok("no record carries a legacy per-entity history any more", s.entities.every((e) => !e.history));
  ok("the sample shows real edits, not just creates", s.log.filter((e) => e.kind === "update").length >= 4);
}

// ── what an import must state about its source ────────────────────────────
{
  const good = mkLog();
  ok("a sound file is described as such", verdictText(verifyLog(good, recs)) === "change log complete and matching");

  const broken = clone(good); broken[0].editor = "forged";
  ok("a tampered log is named as broken", /broken at entry 1/.test(verdictText(verifyLog(broken, recs))));

  const edited = [{ id: "a", values: { name: "Alpha", sev: 9 } }, recs[1]];
  ok("an edited value is named", /1 record edited outside the app/.test(verdictText(verifyLog(good, edited))));

  const extra = [...recs, { id: "c", values: { name: "Gamma" } }];
  ok("a record missing from the log is named", /1 record missing from the log/.test(verdictText(verifyLog(good, extra))));

  // Adopting a colleague's entries must not duplicate what we already hold.
  const mine = mkLog();
  const theirs = appendLog(mkLog(), base("a", "update", "2026-01-06T00:00:00.000Z",
    { changes: [{ field: "sev", from: 3, to: 5 }], comment: "peer edit", state: hashValues({ name: "Alpha", sev: 5 }) }));
  const seen = new Set(mine.map(entryKey));
  const adopted = theirs.map(({ seq, hash, prevHash, ...r }) => r).filter((e) => !seen.has(entryKey(e)));
  ok("only the entries we do not already hold are adopted", adopted.length === 1 && adopted[0].comment === "peer edit");
  ok("the adopted entry keeps its author and date",
    adopted[0].editor === "Analyst A" && adopted[0].ts === "2026-01-06T00:00:00.000Z");
  const merged = appendAll(mine, adopted);
  ok("the merged chain verifies", verifyLog(merged, [{ id: "a", values: { name: "Alpha", sev: 5 } }, recs[1]]).ok);
  ok("...and is numbered without gaps", merged.map((e) => e.seq).join() === "1,2,3,4");
}

// ── a destructive import belongs IN the chain, not instead of it ──────────
{
  // Our chain, then a file that replaces the study: one record dropped, one changed.
  const mine = mkLog();
  const dropped = { ts: "2026-03-01T00:00:00.000Z", editor: "Analyst C", kind: "delete", entity: "b",
    entityType: "thing", title: "Beta", comment: "Not present in “peer.json”; dropped when that file replaced this study." };
  const changedRec = { id: "a", values: { name: "Alpha", sev: 7 } };
  const fix = { ts: "2026-03-01T00:00:00.000Z", editor: "Analyst C", kind: "import", entity: "a",
    entityType: "thing", title: "Alpha", comment: "Taken over", state: hashValues(changedRec.values) };
  const marker = { ts: "2026-03-01T00:00:00.000Z", editor: "Analyst C", kind: "import", entity: "",
    entityType: "", title: "Study", comment: "Replaced by “peer.json”" };
  const after = appendAll(mine, [dropped, fix, marker]);
  ok("a destructive import keeps the entries that came before it", after.length === mine.length + 3);
  ok("...continues the numbering", after[after.length - 1].seq === mine.length + 3);
  ok("...and still verifies against the replaced contents", verifyLog(after, [changedRec]).ok);
  ok("the dropped record is recorded as a deletion, with its name",
    after.some((e) => e.kind === "delete" && e.title === "Beta"));
  ok("the study-scope entry never makes a record look tracked",
    verifyLog(after, [changedRec, { id: "", values: {} }]).untracked.join() === "");
}

console.log(`\n${pass}/${pass + fail} audit assertions passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
