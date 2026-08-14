// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// The product's own palette, applied over the shared tokens.
//
// src/styles/tokens.css is the engine's design system and is identical in every build.
// What a product may differ in — its colours, its radii, its type — is declared in the
// profile (Product.theme) and written here as one stylesheet at startup. Keeping it out
// of the token file is what lets two products look unlike each other without the shared
// CSS diverging.
import { PRODUCT } from "../profile";

const block = (selector: string, vars: Record<string, string> | undefined): string =>
  vars && Object.keys(vars).length
    ? `${selector}{${Object.entries(vars).map(([k, v]) => `${k.startsWith("--") ? k : `--${k}`}:${v}`).join(";")}}`
    : "";

/** Set the starting theme and write the product's token overrides. Call once, before the
 *  first render: the class decides which half of tokens.css applies, and the overrides
 *  have to be in the document before anything is painted. */
export function applyProductTheme(doc: Document = document): void {
  const scheme = PRODUCT.scheme ?? "dark";
  doc.documentElement.classList.add(scheme);
  if (PRODUCT.styles) {
    const own = doc.createElement("style");
    own.setAttribute("data-product-styles", "");
    own.textContent = PRODUCT.styles;
    doc.head.appendChild(own);
  }
  const t = PRODUCT.theme;
  if (!t) return;
  // Written after tokens.css and with the same specificity, so these win on order.
  const css = [
    block(":root", t.base),
    block(":root.light", t.light),
    block(":root.dark", t.dark),
  ].filter(Boolean).join("\n");
  if (!css) return;
  const el = doc.createElement("style");
  el.setAttribute("data-product-theme", "");
  el.textContent = css;
  doc.head.appendChild(el);
}
