// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// The artefact under test has to be the one that was just built.
//
// Every browser suite here reads dist/index.html and nothing else. A build that failed - a
// type error, an unused import - leaves the last GOOD artefact in place, so the suite runs,
// passes, and reports on code that no longer exists. Nothing in the output says which build
// it saw. A green run proving the previous version correct is worse than a red one, because
// it is believed.
//
// The check is a timestamp, which is enough: a build writes the file, so an artefact older
// than the newest source cannot be that build's output.
import { readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const newestUnder = (dir) => {
  let newest = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, e.name);
    newest = Math.max(newest, e.isDirectory() ? newestUnder(full) : statSync(full).mtimeMs);
  }
  return newest;
};

/** The path to a build that is not stale - or exit 2 saying which it is. */
export function requireFreshBuild(root) {
  const distPath = resolve(root, "dist/index.html");
  let built;
  try { built = statSync(distPath).mtimeMs; }
  catch { console.error("dist/index.html is missing - run `npm run build` first."); process.exit(2); }
  // package.json counts: vite.config.ts reads the version out of it into __APP_VERSION__, so
  // a version raised without a rebuild ships an artefact that reports the PREVIOUS number.
  const src = Math.max(newestUnder(resolve(root, "src")),
    ...["index.html", "vite.config.ts", "package.json"].map((f) => { try { return statSync(resolve(root, f)).mtimeMs; } catch { return 0; } }));
  if (built < src) {
    console.error(`dist/index.html is ${Math.round((src - built) / 1000)}s older than the newest source file.`);
    console.error("The build did not run, or it failed. Whatever this suite would report is about the PREVIOUS version.");
    process.exit(2);
  }
  return distPath;
}
