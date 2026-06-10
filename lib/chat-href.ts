import type { ThreadListItem } from "./types";
import { otherParticipants, threadDisplayName } from "./identity";

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
  const addr = address.toLowerCase();
  return (threads ?? []).find(
    (t) =>
      !t.isGroup &&
      !t.isEmail &&
      t.participants.some((p) => p.address?.toLowerCase() === addr),
  );
}
