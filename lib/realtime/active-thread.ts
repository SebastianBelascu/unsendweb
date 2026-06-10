/*
  Tracks which conversation is currently OPEN (WhatsApp semantics): incoming
  messages for the active thread must never bold its inbox row, and should be
  acked as seen immediately. Module-level (not React state) so the socket layer
  can read it synchronously inside event handlers.
*/

let active: { threadId?: string; topicId?: string } = {};

export function setActiveThread(ids: {
  threadId?: string;
  topicId?: string;
}): void {
  active = { threadId: ids.threadId, topicId: ids.topicId };
}

export function clearActiveThread(ids?: {
  threadId?: string;
  topicId?: string;
}): void {
  // Only clear if it's still ours — a fast thread switch mounts the next view
  // before the previous one unmounts, and its cleanup must not wipe the new id.
  if (!ids || ids.threadId === active.threadId) active = {};
}

export function isActiveThread(ids: {
  threadId?: string;
  topicId?: string;
}): boolean {
  return Boolean(
    (ids.threadId && ids.threadId === active.threadId) ||
      (ids.topicId && ids.topicId === active.topicId),
  );
}
