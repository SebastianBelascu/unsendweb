import type { ThreadListItem } from "./types";
import { localPart, otherParticipants, threadDisplayName } from "./identity";

/**
 * Route segment used for a not-yet-existing conversation. Tapping a contact you
 * have no thread with navigates to `/chat/new` or `/mail/thread/new` — the
 * ConversationView opens in "compose inline" mode (empty, recipient prefilled)
 * instead of the modal, and the first send creates the real thread + rebinds
 * the URL to it. Thread ids are random `createId()`s, so "new" never collides.
 */
export const NEW_THREAD_ID = "new";

/** URL that opens a fresh (not-yet-existing) chat with `address`. */
export function newChatHref(address: string, name?: string): string {
  const params = new URLSearchParams();
  params.set("n", name || localPart(address));
  params.set("a", address);
  return `/chat/${NEW_THREAD_ID}?${params.toString()}`;
}

/** URL that opens a fresh (not-yet-existing) email to `address`. */
export function newMailHref(address: string): string {
  const params = new URLSearchParams();
  params.set("to", address);
  return `/mail/thread/${NEW_THREAD_ID}?${params.toString()}`;
}

/** Deep-link href for a chat thread, mirroring ThreadCard's chat-href build. */
export function chatHref(t: ThreadListItem, currentUsername?: string): string {
  const others = otherParticipants(t.participants, currentUsername);
  const isGroup = t.isGroup ?? others.length >= 2;
  const name =
    isGroup && t.groupName
      ? t.groupName
      : threadDisplayName(t.participants, currentUsername);
  const params = new URLSearchParams();
  params.set("n", name);
  params.set("t", t.topicId);
  const addr = others[0]?.address;
  if (addr && !isGroup) params.set("a", addr);
  if (isGroup) params.set("g", "1");
  return `/chat/${t.id}?${params.toString()}`;
}

/**
 * The existing 1:1 chat thread with `address`, if any (native FriendsView tap
 * routing looks one up before falling back to compose).
 */
export function findDmThread(
  threads: ThreadListItem[] | undefined,
  address: string,
): ThreadListItem | undefined {
  // Match on the local-part (username), NOT the full address: chat participants
  // are Unsend users and their stored address domain can differ from the
  // contact's (the same value presence keys off, so this is the reliable key).
  // An exact full-address compare silently missed and fell through to compose.
  const user = localPart(address);
  if (!user) return undefined;
  return (threads ?? []).find(
    (t) =>
      !t.isGroup &&
      !t.isEmail &&
      t.participants.some((p) => localPart(p.address) === user),
  );
}

/** Deep-link href for an email thread, mirroring ThreadCard's email-href build. */
export function mailHref(t: ThreadListItem): string {
  const params = new URLSearchParams();
  if (t.subject) params.set("s", t.subject);
  params.set("tid", t.topicId);
  return `/mail/thread/${t.id}?${params.toString()}`;
}

/**
 * The most-recent 1:1 email thread with `address`, if any. Tapping an email
 * contact opens this instead of compose (matching the chat tap-routing); the
 * caller falls back to compose when none exists. `threads` is expected sorted
 * recent-first, so `.find` returns the latest match.
 */
export function findEmailThread(
  threads: ThreadListItem[] | undefined,
  address: string,
): ThreadListItem | undefined {
  const addr = address.toLowerCase();
  return (threads ?? []).find(
    (t) =>
      t.isEmail &&
      !t.isGroup &&
      t.participants.some((p) => p.address?.toLowerCase() === addr),
  );
}
