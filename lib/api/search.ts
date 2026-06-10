import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchUsers, type UserResult } from "./users";
import { useContacts } from "./contacts";
import { localPart } from "../identity";

/*
  Universal-search helpers. The backend only exposes people/chat search (no
  full-text message/file/call search — native does those from its local DB,
  which the web doesn't hold), so web search = People (your contacts + platform
  users) + the conversation list filtered client-side.
*/

/**
 * People matching `q`: your address book first, then a broader platform-user
 * search, deduped by address, excluding yourself.
 */
export function useSearchPeople(q: string, selfUsername?: string): UserResult[] {
  const { data: contacts = [] } = useContacts();
  const { data: users = [] } = useQuery({
    queryKey: ["userSearch", q.trim()],
    queryFn: () => searchUsers(q.trim()),
    enabled: q.trim().length >= 2,
  });

  return useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    const self = (selfUsername ?? "").toLowerCase();
    const local: UserResult[] = contacts
      .filter(
        (c) =>
          (c.name || "").toLowerCase().includes(query) ||
          c.address.toLowerCase().includes(query) ||
          (c.phone || "").includes(query),
      )
      .map((c) => ({
        name: c.name || localPart(c.address),
        username: localPart(c.address),
        address: c.address,
      }));

    const out: UserResult[] = [];
    const seen = new Set<string>();
    for (const r of [...local, ...users]) {
      const key = r.address.toLowerCase();
      if (seen.has(key) || localPart(r.address) === self) continue;
      seen.add(key);
      out.push(r);
      if (out.length >= 12) break;
    }
    return out;
  }, [q, contacts, users, selfUsername]);
}

const RECENTS_KEY = "unsend.web.recentSearches";

export function getRecentSearches(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]") as string[];
  } catch {
    return [];
  }
}

export function pushRecentSearch(q: string): void {
  const term = q.trim();
  if (!term || typeof localStorage === "undefined") return;
  const next = [term, ...getRecentSearches().filter((r) => r !== term)].slice(0, 8);
  localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
}

export function clearRecentSearches(): void {
  if (typeof localStorage !== "undefined") localStorage.removeItem(RECENTS_KEY);
}
