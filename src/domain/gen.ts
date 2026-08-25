// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// The gate in front of the generative branch.
//
// Two products are built from this one tree: the released one, which extracts with
// embeddings alone, and the development one, which also runs a language model. That used
// to be a difference of FILES - seven of them, kept in two versions by hand, which is how
// a file gets forgotten. It is a build flag now.
//
// `VITE_LLM=1` turns the branch on. With the flag off, `LLM` folds to a constant false,
// the dynamic import below becomes unreachable, and the bundler drops `generative.ts` and
// everything it pulls in: no model list, no runtime it talks to, no sampling parameters,
// no language-model prose. `scripts/e2e.mjs` reads that off the BUILT file, and asserts
// the opposite of the LLM build, so it cannot pass by testing the wrong artefact.
//
// What the released file does still carry, and why it is left there:
//
//  · `genModelId` in the settings a bundle exports and imports. A study exported from a
//    development build names the model it was worked with; this build reads that field,
//    hands it to `gen()`, gets null and moves on. Dropping it would make the two builds
//    unable to read each other's files, which costs more than a dead property name.
//  · `backend === "webllm"` where a user-added model is normalised, for the same reason:
//    the record may have been written by the other build.
//
// Neither is text a reader can see or a capability the file can reach. Anything that IS -
// a sentence about what a language model does, a call into the module - has to hang off
// `LLM` and not off a runtime condition: a runtime branch keeps its contents in the
// bundle, which is how the released file came to describe a model it cannot run for three
// releases (v0.6.0 to v0.6.2). Straightened in the release after those.
//
// Callers ask for the module and cope with `null`, which is also what they must do while
// it is still loading. Nothing else in the app may import `generative` directly: doing so
// puts it back in the released build and the check will say so.
export const LLM: boolean = import.meta.env.VITE_LLM === "1";

type GenModule = typeof import("./generative");
let loaded: GenModule | null = null;
let loading: Promise<GenModule | null> | null = null;

/** The generative module, or null when this build was made without it. */
export function gen(): Promise<GenModule | null> {
  if (!LLM) return Promise.resolve(null);
  if (loaded) return Promise.resolve(loaded);
  loading ??= import("./generative").then((m) => { loaded = m; return m; });
  return loading;
}

/** Already there, for a render that cannot wait. Null until `gen()` has resolved once. */
export const genNow = (): GenModule | null => loaded;

// The language model's file cache travels with it: keeping a model as a file next to the
// app only means anything where there is a model.
type FileModule = typeof import("./genFileCache");
let files: FileModule | null = null;
let filesLoading: Promise<FileModule | null> | null = null;

export function genFiles(): Promise<FileModule | null> {
  if (!LLM) return Promise.resolve(null);
  if (files) return Promise.resolve(files);
  filesLoading ??= import("./genFileCache").then((m) => { files = m; return m; });
  return filesLoading;
}
export const genFilesNow = (): FileModule | null => files;
