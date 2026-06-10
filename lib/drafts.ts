import { create } from "zustand";

/*
  Tiny localStorage-backed draft store so an unsent reply/compose survives a
  refresh or navigation. Keyed by thread id (conversation) or a compose key.

  Two parts, mirroring native DraftSnapshot:
  - the message TEXT (string), and
  - email META — subject + cc + bcc overrides (DraftEmailMeta). The `to` list is
    the thread default and isn't persisted; replyTo + attachment blobs are not
    persisted (the web has no local blob store to rehydrate uploads from).

  A small zustand mirror (`useDraftStore`) makes the TEXT reactive so the inbox
  rows can show a "Draft" preview (native ThreadRowView), since localStorage on
  its own doesn't notify React.
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

interface DraftStore {
  /** threadId/compose-key -> current draft text. */
  texts: Record<string, string>;
  hydrated: boolean;
  hydrate: () => void;
  put: (key: string, text: string) => void;
  drop: (key: string) => void;
}

/** Reactive mirror of the persisted draft TEXT (for inbox "Draft" previews). */
export const useDraftStore = create<DraftStore>((set, get) => ({
  texts: {},
  hydrated: false,
  hydrate: () => {
    if (get().hydrated || typeof localStorage === "undefined") return;
    const texts: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) {
        const v = localStorage.getItem(k);
        if (v) texts[k.slice(PREFIX.length)] = v;
      }
    }
    set({ texts, hydrated: true });
  },
  put: (key, text) =>
    set((s) => {
      if (s.texts[key] === text) return s;
      return { texts: { ...s.texts, [key]: text } };
    }),
  drop: (key) =>
    set((s) => {
      if (!(key in s.texts)) return s;
      const next = { ...s.texts };
      delete next[key];
      return { texts: next };
    }),
}));

/** Subscribe to a thread's draft text (trimmed; empty string when none). */
export function useDraftText(key?: string): string {
  return useDraftStore((s) => (key ? s.texts[key] ?? "" : ""));
}

export function loadDraft(key?: string): string {
  if (!key || typeof localStorage === "undefined") return "";
  return localStorage.getItem(PREFIX + key) ?? "";
}

// Per-keystroke persistence writes localStorage only — NOT the reactive store —
// so the inbox row never updates live while you type. The row is refreshed via
// `flushDraftToRow` when you leave the conversation (composer unmount).
export function saveDraft(key: string, value: string): void {
  if (typeof localStorage === "undefined") return;
  if (value) localStorage.setItem(PREFIX + key, value);
  else localStorage.removeItem(PREFIX + key);
}

/** Push the saved draft into the reactive store so the inbox row reflects it. */
export function flushDraftToRow(key: string): void {
  const text = loadDraft(key).trim();
  const store = useDraftStore.getState();
  if (text) store.put(key, text);
  else store.drop(key);
}

/**
 * Hide the draft from its inbox row (store only — localStorage is untouched, so
 * the draft is preserved). Used when the conversation is opened: WhatsApp shows
 * the last message for the chat you're in, then re-surfaces "Draft" on leave.
 */
export function hideDraftRow(key: string): void {
  useDraftStore.getState().drop(key);
}

export function clearDraft(key?: string): void {
  if (!key) return;
  if (typeof localStorage !== "undefined") localStorage.removeItem(PREFIX + key);
  useDraftStore.getState().drop(key);
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
