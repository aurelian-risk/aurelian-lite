// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// No hook may sit after an early return.
//
// React counts hooks per render and throws when the count changes between two renders of
// the same component. A guard that returns before some of them produces exactly that: a
// render where a condition is not yet true returns with three hooks behind it, the next one
// runs ten, and the page goes WHITE - no message, no view, nothing to navigate back from.
//
// It is not hypothetical. CoverageMatrix had this shape, and it showed up as "switching
// tabs sometimes blanks the page": the store rehydrates after a navigation, and for a beat
// the taxonomy carries no measure type. Reported from the sibling product, found here by
// looking rather than by waiting for it.
//
// A scan rather than a runtime test, because the failure needs a specific interleaving to
// appear and a green test run proves nothing about the render that did not happen.
//
// Run: npm run test:hooks
import { readdirSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const roots = ["src/components", "src/domain"].map((d) => resolve(here, "..", d));

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "✓" : "✗"} ${name}${detail && !cond ? `\n    ${detail}` : ""}`);
};

/** A call that is a hook: React's own, and ours - anything named useSomething. */
const HOOK = /(?:^|[^.\w])(use[A-Z]\w*)\s*\(/;
/** A return that leaves the function early. `return (` and `return <` start the render
 *  proper and end the body, so they are not guards. */
const EARLY_RETURN = /^\s*(?:if\s*\(.*\)\s*)?return\b(?!\s*[(<])/;
/** Where a component or hook begins. Only these have hook rules. */
const FN_START = /^(?:export\s+)?function\s+(use[A-Z]\w*|[A-Z]\w*)\s*\(/;

const files = [];
for (const root of roots) {
  for (const name of readdirSync(root)) if (/\.tsx?$/.test(name)) files.push(join(root, name));
}
ok("there are components to scan", files.length > 5, String(files.length));

const offenders = [];
for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n");
  let fn = null, depth = 0, sawReturn = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const code = line.replace(/\/\/.*$/, "");
    const start = FN_START.exec(code);
    if (start && depth === 0) { fn = { name: start[1], line: i + 1 }; sawReturn = 0; }
    if (fn) {
      // Only guards at the function's own level count; a return inside a callback is
      // that callback's business.
      const before = depth;
      depth += (code.match(/\{/g) ?? []).length - (code.match(/\}/g) ?? []).length;
      // `return useSomething(...)` is the function's result, not a guard in front of it.
      if (before === 1 && EARLY_RETURN.test(code) && !HOOK.test(code)) sawReturn = i + 1;
      if (sawReturn && before >= 1 && HOOK.test(code)) {
        const hook = HOOK.exec(code)[1];
        offenders.push(`${file.split("/").slice(-2).join("/")}:${i + 1}  ${fn.name}() calls ${hook}() after the guard on line ${sawReturn}`);
        sawReturn = 0;                      // one report per function is enough
      }
      if (depth <= 0) { fn = null; sawReturn = 0; depth = 0; }
    }
  }
}

ok("no hook runs after an early return", offenders.length === 0, offenders.join("\n    "));

// A checker that has never caught the thing it was written for is not evidence. This is
// the shape CoverageMatrix actually had, and it must be reported.
{
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "hooks-"));
  const bad = join(dir, "Bad.tsx");
  writeFileSync(bad, [
    'export function Bad({ tax }: { tax: T }) {',
    '  const [rec, setRec] = useState(null);',
    '  const t = tax.entityTypes.find((x) => x.k);',
    '  if (!t) return null;',
    '  const f = useTableFilter(t, []);',
    '  return <div>{f}</div>;',
    '}',
  ].join("\n"));
  const lines = readFileSync(bad, "utf8").split("\n");
  let caught = false, depth = 0, guard = 0, inFn = false;
  for (let i = 0; i < lines.length; i++) {
    const code = lines[i].replace(/\/\/.*$/, "");
    if (FN_START.test(code) && depth === 0) { inFn = true; guard = 0; }
    if (!inFn) continue;
    const before = depth;
    depth += (code.match(/\{/g) ?? []).length - (code.match(/\}/g) ?? []).length;
    if (before === 1 && EARLY_RETURN.test(code) && !HOOK.test(code)) guard = i + 1;
    if (guard && before >= 1 && HOOK.test(code)) { caught = true; break; }
    if (depth <= 0) { inFn = false; depth = 0; }
  }
  rmSync(dir, { recursive: true, force: true });
  ok("...and the check would catch it if one did", caught);
}

console.log(`\n${pass}/${pass + fail} hook-order assertions passed · ${fail} failed · ${files.length} files scanned`);
process.exit(fail ? 1 : 0);
