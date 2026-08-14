// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Which catalogues this product ships ready to use.
//
// The catalogue CONTENT lives in src/domain/frameworks.ts, which is engine: a parsed
// framework is the same object whatever the method. What belongs to the product is the
// selection - a build aimed at a different regime seeds different catalogues.
import { MEASURE_LIBRARY, NIS2, NIST_CSF, NIST_800_53, type Framework, type PublishedCatalog } from "../../domain/frameworks";

/** Seeds the compliance requirements table. */
export const BUNDLED_FRAMEWORKS: Framework[] = [NIS2, NIST_CSF, NIST_800_53];

/** Seeds the security measures table: the curated library first, then the frameworks,
 *  whose items are themselves controls. */
export const BUNDLED_MEASURE_CATALOGS: Framework[] = [MEASURE_LIBRARY, NIS2, NIST_CSF, NIST_800_53];

/** Catalogues this product offers to download from their publisher. None here: the
 *  frameworks above are shipped, and EBIOS RM itself is a method rather than a
 *  catalogue of requirements. */
export const PUBLISHED_CATALOGS: PublishedCatalog[] = [];
