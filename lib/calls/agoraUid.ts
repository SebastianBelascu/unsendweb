/**
 * Deterministic Agora UID from a username — MUST stay byte-identical to the
 * backend (backend/src/agora/agora.service.ts `generateAgoraUid`) and the RN
 * replica. The server mints the RTC token for this exact numeric UID; joining
 * with any other UID is rejected. Do NOT "improve" this.
 *
 * `(hash << 5) - hash` is `hash * 31`; JS bitwise ops are 32-bit, so the signed
 * overflow wraparound is reproducible cross-platform. Range: 1 .. 2^31-1.
 */
export function generateAgoraUid(username: string): number {
  if (!username) return 0;
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return (Math.abs(hash) % 2147483647) + 1;
}
