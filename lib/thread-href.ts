import { otherParticipants, threadDisplayName } from "./identity";
import type { ThreadListItem } from "./types";

/**
 * The route for a conversation, matching ThreadCard's link (segment = the
 * sender's threadId; topicId + header bits go in the query so the detail pane
 * paints instantly before its data loads).
 */
export function threadHref(
  thread: ThreadListItem,
  currentUsername?: string,
): string {
  const others = otherParticipants(thread.participants, currentUsername);
  // Trust the backend group flag; only infer from participant count when it's
  // absent.
  const isGroup = thread.isGroup ?? others.length >= 2;
  const name =
    isGroup && thread.groupName
      ? thread.groupName
      : threadDisplayName(thread.participants, currentUsername);
  const params = new URLSearchParams();
  if (thread.isEmail) {
    if (thread.subject) params.set("s", thread.subject);
    params.set("tid", thread.topicId);
  } else {
    params.set("n", name);
    params.set("t", thread.topicId);
    const addr = others[0]?.address;
    if (addr && !isGroup) params.set("a", addr);
    if (isGroup) params.set("g", "1");
  }
  const qs = params.toString() ? `?${params.toString()}` : "";
  return thread.isEmail
    ? `/mail/thread/${thread.id}${qs}`
    : `/chat/${thread.id}${qs}`;
}
