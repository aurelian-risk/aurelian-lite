// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Which product this build is.
//
// THE SINGLE LINE A SIBLING PRODUCT CHANGES. A fork that targets a different method
// adds its own directory beside ./ebios and re-points this export; the engine under
// src/domain and src/components is untouched, so upstream development merges cleanly.
export * from "./ebios";
