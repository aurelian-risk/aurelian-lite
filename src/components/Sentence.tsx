// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// One sentence that has something in the middle of it.
//
// The alternative is what this replaces: a sentence broken into fragments by the markup
// that interrupts it, each fragment its own key. That is translatable only into a language
// with the same word order — German moves the emphasised word, and fixed fragment order
// forbids it. Here the sentence is one string with `{0}` in it, and the pieces are handed
// in separately.
import type { ReactNode } from "react";
import { tParts } from "../domain/i18n";

export function Sentence({ k, en, parts }: { k: string; en: string; parts: ReactNode[] }) {
  return <>{tParts(k, en).map((p, i) =>
    typeof p === "number"
      ? <span key={i}>{parts[p]}</span>
      : <span key={i}>{p}</span>)}</>;
}
