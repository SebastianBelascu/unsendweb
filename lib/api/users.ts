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
