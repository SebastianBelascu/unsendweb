import { apiGet } from "./http";
import { MAIL_DOMAIN } from "../identity";

export interface UserResult {
  name: string;
  username: string;
  address: string;
}

interface RawUser {
  _id?: string;
  userId?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
}

function normalize(u: RawUser): UserResult | null {
  const username = u.username;
  if (!username) return null;
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return {
    name: full || u.name || username,
    username,
    address: `${username}${MAIL_DOMAIN}`,
  };
}

/** Avatar versions changed since `since` (ms epoch) → seeds the version map. */
export async function getAvatarChanges(
  since = 0,
): Promise<{ username: string; version: number }[]> {
  try {
    const res = await apiGet<{
      changes?: { username: string; version: number }[];
    }>(`/users/avatar-changes?since=${since}`);
    return res?.changes ?? [];
  } catch {
    return [];
  }
}

export interface UserProfile {
  userId?: string;
  username: string;
  name?: string;
  phone?: string;
}

/** Fetch one user's public profile (GET /users/user/:username). */
export async function getUserProfile(
  username: string,
): Promise<UserProfile | null> {
  try {
    const res = await apiGet<{
      status?: string;
      data?: { userId?: string; username?: string; phone?: string; name?: string };
    }>(`/users/user/${encodeURIComponent(username)}`);
    const d = res?.data;
    if (!d?.username) return null;
    return {
      userId: d.userId,
      username: d.username,
      name: d.name?.trim() || d.username,
      phone: d.phone,
    };
  } catch {
    return null;
  }
}

/** Search Unsend users by username/name (GET /users/search/:q). */
export async function searchUsers(q: string): Promise<UserResult[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  let res: RawUser[] | { data?: RawUser[]; users?: RawUser[] } | null;
  try {
    res = await apiGet(`/users/search/${encodeURIComponent(term)}`);
  } catch {
    return [];
  }
  const arr: RawUser[] = Array.isArray(res)
    ? res
    : (res?.data ?? res?.users ?? []);
  return arr.map(normalize).filter((u): u is UserResult => u !== null);
}
