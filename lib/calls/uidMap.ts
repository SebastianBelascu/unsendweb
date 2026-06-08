import { generateAgoraUid } from "./agoraUid";
import { localPart } from "../identity";
import type { CallRosterEntry } from "./store";

export interface UidInfo {
  name: string;
  address?: string;
  /** This uid is the participant's screen-share stream (`<username>#screen`). */
  isScreen: boolean;
}

/**
 * Map every Agora uid we might see (each participant's camera uid AND screen
 * uid) back to their roster name, so tiles can be labelled. Mirrors the backend
 * derivation: generateAgoraUid(username) for camera, generateAgoraUid(
 * `${username}#screen`) for screen.
 */
export function buildUidMap(
  roster: CallRosterEntry[] | undefined,
): Map<number, UidInfo> {
  const map = new Map<number, UidInfo>();
  for (const p of roster ?? []) {
    const u = localPart(p.address);
    if (!u) continue;
    map.set(generateAgoraUid(u), {
      name: p.name,
      address: p.address,
      isScreen: false,
    });
    map.set(generateAgoraUid(`${u}#screen`), {
      name: p.name,
      address: p.address,
      isScreen: true,
    });
  }
  return map;
}
