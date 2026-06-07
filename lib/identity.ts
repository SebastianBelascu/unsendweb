import type { MailMessage, ThreadParticipant } from "./types";

/** Unsend mail domain (DOMAIN=unsend.app in the RN config). */
export const MAIL_DOMAIN = "@unsend.app";

/** Local part of an address, lowercased (mirrors RN emailNameParcer). */
export function localPart(address?: string): string {
  if (!address) return "";
  const i = address.indexOf("@");
  return (i >= 0 ? address.slice(0, i) : address).toLowerCase();
}

export function isSelf(
  p: { address?: string } | undefined,
  username?: string,
): boolean {
  if (!username || !p?.address) return false;
  return localPart(p.address) === username.toLowerCase();
}

/**
 * Whether a message belongs to the current user — mirrors RN
 * useMessageSenderDetails: own when there's no from.address, otherwise when the
 * sender's local-part matches the logged-in username. (NOT `outbound`.)
 */
export function isOwnMessage(message: MailMessage, username?: string): boolean {
  if (!message.from?.address) return true;
  if (!username) return false;
  return localPart(message.from.address) === username.toLowerCase();
}

function fullName(p: ThreadParticipant): string {
  const n = p.name?.trim();
  if (n) return n;
  return localPart(p.address) || "Unknown";
}

function firstName(p: ThreadParticipant): string {
  return fullName(p).split(/\s+/)[0];
}

/** Participants excluding the current user (falls back to all if that empties). */
export function otherParticipants(
  participants: ThreadParticipant[],
  username?: string,
): ThreadParticipant[] {
  const others = participants.filter((p) => !isSelf(p, username));
  return others.length ? others : participants;
}

/**
 * Row/header display name, excluding the current user — mirrors native
 * getThreadParticipantsUserName: 1 → full name, 2 → "A & B", 3+ → "A & N others"
 * (compact first names for groups).
 */
export function threadDisplayName(
  participants: ThreadParticipant[],
  username?: string,
  fallback = "Unknown",
): string {
  const list = otherParticipants(participants, username);
  if (list.length === 0) return fallback;
  if (list.length === 1) return fullName(list[0]);
  if (list.length === 2) return `${firstName(list[0])} & ${firstName(list[1])}`;
  return `${firstName(list[0])} & ${list.length - 1} others`;
}
