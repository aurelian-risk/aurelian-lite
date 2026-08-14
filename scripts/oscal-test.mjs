// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Reading an OSCAL catalog. Offline half.
//
// The fixture is invented, for the reason given in listimport-test.mjs: no publisher's
// catalogue is committed here. What it reproduces is the SHAPE OSCAL allows - nested
// groups, a control inside a control, prose split across nested parts, properties on the
// statement rather than the control, a repeated property name. The half that runs against
// the BSI's own 5.2 MB catalogue is `npm run test:corpus`.
//
// Run: npm run test:oscal
import { pathToFileURL } from "node:url";

const need = (n) => { const v = process.env[n]; if (!v) { console.error(`set ${n}`); process.exit(2); } return v; };
const { parseOscalCatalog, looksLikeOscal } = await import(pathToFileURL(need("MOD_O")).href);

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? (pass++, console.log("✓", name)) : (fail++, console.log("✗", name, extra)); };

const FIXTURE = {
  catalog: {
    uuid: "0000",
    metadata: { title: "Invented catalogue", version: "2026-01-01", "oscal-version": "1.1.3" },
    groups: [{
      id: "ZZ", title: "Outer practice",
      groups: [{
        id: "ZZ.1", title: "Inner group",
        controls: [{
          id: "ZZ.1.1", title: "First requirement",
          props: [
            { name: "effort_level", value: "3" },
            { name: "tags", value: "alpha" },
            { name: "tags", value: "beta" },
          ],
          parts: [
            { name: "statement", prose: "Outer MUSS something do.", props: [{ name: "modal_verb", value: "MUSS" }] },
            { name: "guidance", parts: [{ name: "item", prose: "Guidance one." }, { name: "item", prose: "Guidance two." }] },
            { name: "example", prose: "An example nobody should lose." },
          ],
          controls: [{ id: "ZZ.1.1.1", title: "Nested requirement", parts: [{ name: "statement", prose: "Nested statement." }] }],
        }],
      }],
    }],
  },
};
const text = JSON.stringify(FIXTURE);
const fw = parseOscalCatalog(text, "fallback");
const byId = Object.fromEntries(fw.items.map((i) => [i.ref_id, i]));

ok("recognises an OSCAL catalog", looksLikeOscal(text) === "catalog", String(looksLikeOscal(text)));
ok("takes the catalogue's own title over the file name", fw.name === "Invented catalogue", fw.name);
ok("reads a control nested inside a control", fw.items.length === 2 && !!byId["ZZ.1.1.1"], `${fw.items.length} items`);
ok("records the group path as a section", byId["ZZ.1.1"]?.section === "ZZ Outer practice / ZZ.1 Inner group", byId["ZZ.1.1"]?.section);
ok("carries the control's properties", byId["ZZ.1.1"]?.props?.effort_level === "3", JSON.stringify(byId["ZZ.1.1"]?.props));
ok("carries properties that sit on the statement", byId["ZZ.1.1"]?.props?.modal_verb === "MUSS", JSON.stringify(byId["ZZ.1.1"]?.props));
ok("accumulates a repeated property instead of overwriting", byId["ZZ.1.1"]?.props?.tags === "alpha, beta", byId["ZZ.1.1"]?.props?.tags);
ok("joins prose from nested parts", /Guidance one\./.test(byId["ZZ.1.1"]?.description ?? "") && /Guidance two\./.test(byId["ZZ.1.1"]?.description ?? ""));
ok("keeps parts that are neither statement nor guidance", /nobody should lose/.test(byId["ZZ.1.1"]?.description ?? ""));

// A profile selects controls from a catalogue; reading it as one would yield nothing and
// look like an empty catalogue, so it is refused by name.
try {
  parseOscalCatalog(JSON.stringify({ profile: { imports: [] } }), "x");
  ok("refuses an OSCAL profile", false, "no error thrown");
} catch (e) {
  ok("refuses an OSCAL profile, saying why", /profile/.test(e.message), e.message);
}
try {
  parseOscalCatalog(JSON.stringify({ something: 1 }), "x");
  ok("refuses JSON that is not OSCAL", false, "no error thrown");
} catch (e) {
  ok("refuses JSON that is not OSCAL", /no OSCAL catalog/.test(e.message), e.message);
}
ok("does not claim plain JSON is OSCAL", looksLikeOscal('{"name":"x","items":[]}') === null);

console.log(`\n${pass}/${pass + fail} OSCAL assertions passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
