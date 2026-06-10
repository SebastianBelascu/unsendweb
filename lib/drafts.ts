/*
  Tiny localStorage-backed draft store so an unsent reply/compose survives a
  refresh or navigation. Keyed by thread id (conversation) or a compose key.

  Two parts, mirroring native DraftSnapshot:
  - the message TEXT (string), and
  - email META — subject + cc + bcc overrides (DraftEmailMeta). The `to` list is
    the thread default and isn't persisted; replyTo + attachment blobs are not
    persisted (the web has no local blob store to rehydrate uploads from).
*/

const PREFIX = "unsend.web.draft.";
const META_PREFIX = "unsend.web.draftmeta.";

export interface DraftRecipient {
  name?: string;
  address: string;
}

export interface DraftMeta {
  subject?: string;
  cc?: DraftRecipient[];
  bcc?: DraftRecipient[];
}

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

function metaIsEmpty(m: DraftMeta): boolean {
  return (
    !m.subject &&
    (!m.cc || m.cc.length === 0) &&
    (!m.bcc || m.bcc.length === 0)
  );
}

export function loadDraftMeta(key?: string): DraftMeta | null {
  if (!key || typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(META_PREFIX + key);
    return raw ? (JSON.parse(raw) as DraftMeta) : null;
  } catch {
    return null;
  }
}

export function saveDraftMeta(key: string, meta: DraftMeta): void {
  if (typeof localStorage === "undefined") return;
  if (metaIsEmpty(meta)) {
    localStorage.removeItem(META_PREFIX + key);
    return;
  }
  try {
    localStorage.setItem(META_PREFIX + key, JSON.stringify(meta));
  } catch {
    // ignore quota errors
  }
}

export function clearDraftMeta(key?: string): void {
  if (key && typeof localStorage !== "undefined")
    localStorage.removeItem(META_PREFIX + key);
}
