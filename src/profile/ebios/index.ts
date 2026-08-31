// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// The EBIOS RM profile: what makes this build Aurelian Lite rather than the bare engine.
//
// Four things decide a product on this engine - its identity, its taxonomy, the study it
// offers as a sample, and the catalogues it ships. Everything else is shared.
export { PRODUCT, type Product } from "./product";
export { WORDS } from "./words";
export { DEFAULT_TAXONOMY, TAXONOMY_SCHEMA_VERSION } from "./taxonomy";
export { makeSampleStudy, isPristineSample } from "./sample";
export { BUNDLED_FRAMEWORKS, BUNDLED_MEASURE_CATALOGS, PUBLISHED_CATALOGS } from "./catalogs";
