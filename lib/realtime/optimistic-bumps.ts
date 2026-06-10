/*
  Tracks which threads were just optimistically bumped (a send, or an incoming
  socket `create`). Used by the threads-query `structuralSharing` to protect a
  fresh bump from being clobbered by a stale refetch — the backend commits a
  thread's lastMessage/updatedAt AFTER emitting the socket event, so a refetch in
  that window returns the previous message. We trust the optimistic cache for a
  short window, then defer to the backend (which has caught up by then).

  Uses only the client clock (Date.now on both write + read), so it never
  compares timestamps across the client/server clock boundary.
*/

const bumpedAt = new Map<string, number>();
const WINDOW_MS = 10_000;

/** Mark thread id(s) as just bumped (ignores undefined ids). */
export function markBumped(...ids: (string | undefined)[]): void {
  const now = Date.now();
  for (const id of ids) if (id) bumpedAt.set(id, now);
}

/** Was this thread bumped within the protection window? */
export function recentlyBumped(id?: string): boolean {
  if (!id) return false;
  const t = bumpedAt.get(id);
  if (t == null) return false;
  if (Date.now() - t >= WINDOW_MS) {
    bumpedAt.delete(id); // expired — let the backend win + keep the map bounded
    return false;
  }
  return true;
}

/*
  Same idea for SEEN: the backend commits the `seen` write with a lag, so a list
  refetch right after opening a conversation returns seen=false and re-bolds the
  row (a visible flash). Track locally-marked-seen threads and force unread=false
  on refetched rows within the window — by then the server has caught up.
*/
const seenAt = new Map<string, number>();

export function markSeenLocally(...ids: (string | undefined)[]): void {
  const now = Date.now();
  for (const id of ids) if (id) seenAt.set(id, now);
}

export function recentlySeen(id?: string): boolean {
  if (!id) return false;
  const t = seenAt.get(id);
  if (t == null) return false;
  if (Date.now() - t >= WINDOW_MS) {
    seenAt.delete(id);
    return false;
  }
  return true;
}
