// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Who this build says it is. Product identity in one place, so a sibling product
// built on the same engine changes its name and mark here rather than in the shell.
import type { Product } from "../../domain/types";

export const PRODUCT: Product = {
  name: "Aurelian Lite",
  tagline: "Structured cyber risk analysis",
  mark: "Aurelian",
  source: "github.com/aurelian-risk/aurelian-lite",
};

export type { Product };
