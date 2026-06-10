/*
  The React Query cache is persisted to localStorage (offline-first instant
  paint). It is NOT account-scoped, so it MUST be wiped on every account change
  (login / logout / forced sign-out) — otherwise the next account briefly sees
  the previous one's threads/messages/contacts hydrated from the stale blob.
*/

export const QUERY_CACHE_KEY = "unsend.web.qcache";

/** Remove the persisted React Query cache blob from localStorage. */
export function clearPersistedQueryCache(): void {
  if (typeof localStorage !== "undefined")
    localStorage.removeItem(QUERY_CACHE_KEY);
}
