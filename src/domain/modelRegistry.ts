// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// User model registry — lets the user add models by id + backend without any
// hard-coded model or address in the code. Stored in localStorage and merged
// with the small built-in defaults (embeddings.ts / generative.ts). Ids are
// standard: a Hugging Face repo id for the "transformers" backend, an MLC model
// id for the "webllm" backend (see WebLLM's prebuiltAppConfig.model_list).
export interface UserModel {
  kind: "embed" | "gen";
  backend: "transformers" | "webllm";
  id: string;
  label: string;
  size?: string;
  note?: string;
  needsWebGPU?: boolean;
}

const LS = "ebios_offline_user_models";

export function getUserModels(): UserModel[] {
  try { const v = JSON.parse(localStorage.getItem(LS) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
function save(list: UserModel[]): void { try { localStorage.setItem(LS, JSON.stringify(list)); } catch { /* ignore */ } }

export function addUserModel(m: UserModel): void {
  const list = getUserModels().filter((x) => x.id !== m.id);
  list.push({ ...m, needsWebGPU: m.backend === "webllm" ? true : !!m.needsWebGPU });
  save(list);
}
export function removeUserModel(id: string): void { save(getUserModels().filter((x) => x.id !== id)); }
export const isUserModel = (id: string): boolean => getUserModels().some((m) => m.id === id);
