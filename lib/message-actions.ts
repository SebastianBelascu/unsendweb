import type { MailMessage } from "./types";

// Native parity (ThreadDetailViewModel.canEdit / canDeleteForAll):
// edit is allowed within 15 min of send, unsend-for-everyone within 24 h.
const EDIT_WINDOW_MS = 15 * 60 * 1000;
const UNSEND_WINDOW_MS = 24 * 60 * 60 * 1000;

// Wall-clock-dependent helpers live here (not in a component) so React's
// render-purity rule doesn't trip on Date.now(): a freshly opened action menu
// should reflect the real elapsed time, which is exactly this impurity.
function ageMs(iso?: string): number {
  if (!iso) return Infinity;
  return Date.now() - new Date(iso).getTime();
}

/** Edit gate: own + non-empty + not in-flight/failed + within the 15-min window. */
export function canEditMessage(
  message: MailMessage,
  isOwn: boolean,
  hasText: boolean,
): boolean {
  if (!isOwn || !hasText || message.isDeleted) return false;
  if (message.status === "sending" || message.status === "failed") return false;
  return ageMs(message.date) <= EDIT_WINDOW_MS;
}

/** Unsend-for-everyone gate: own + non-deleted + within the 24-h window. */
export function canUnsendForAll(message: MailMessage, isOwn: boolean): boolean {
  if (!isOwn || message.isDeleted) return false;
  return ageMs(message.date) <= UNSEND_WINDOW_MS;
}

/** Still inside the 15-min edit window (re-checked at save time). */
export function withinEditWindow(iso?: string): boolean {
  return ageMs(iso) <= EDIT_WINDOW_MS;
}
