/*
  Tiny localStorage-backed draft store so an unsent reply/compose survives a
  refresh or navigation. Keyed by thread id (conversation) or a compose key.
*/

const PREFIX = "unsend.web.draft.";

export function loadDraft(key?: string): string {
  if (!key || typeof localStorage === "undefined") return "";
  return localStorage.getItem(PREFIX + key) ?? "";
}

export function saveDraft(key: string, value: string): void {
  if (typeof localStorage === "undefined") return;
  if (value) localStorage.setItem(PREFIX + key, value);
  else localStorage.removeItem(PREFIX + key);
}

export function clearDraft(key?: string): void {
  if (key && typeof localStorage !== "undefined")
    localStorage.removeItem(PREFIX + key);
}
