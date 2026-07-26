// User model registry — lets the user add embedding models by Hugging Face repo
// id, without any hard-coded model or address in the code. Stored in localStorage
// and merged with the small built-in defaults (see embeddings.ts).
export interface UserModel {
  kind: "embed";
  backend: "transformers";
  id: string;
  label: string;
  size?: string;
  note?: string;
}

const LS = "ebios_offline_user_models";

export function getUserModels(): UserModel[] {
  try { const v = JSON.parse(localStorage.getItem(LS) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
function save(list: UserModel[]): void { try { localStorage.setItem(LS, JSON.stringify(list)); } catch { /* ignore */ } }

export function addUserModel(m: UserModel): void {
  const list = getUserModels().filter((x) => x.id !== m.id);
  list.push(m);
  save(list);
}
export function removeUserModel(id: string): void { save(getUserModels().filter((x) => x.id !== id)); }
export const isUserModel = (id: string): boolean => getUserModels().some((m) => m.id === id);
