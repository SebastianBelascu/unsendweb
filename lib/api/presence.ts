import { apiSend } from "./http";

/** Seed presence for a set of usernames (POST /users/presence). */
export async function seedPresence(usernames: string[]): Promise<{
  online: string[];
  lastSeen: Record<string, string>;
}> {
  if (!usernames.length) return { online: [], lastSeen: {} };
  return apiSend("/users/presence", "POST", { usernames });
}
