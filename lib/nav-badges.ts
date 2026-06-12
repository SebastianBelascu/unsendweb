import { useQuery } from "@tanstack/react-query";
import { useSession } from "./api/account";
import { useInboxThreads } from "./api/threads";
import { getCallHistory, type CallRecord } from "./api/calls";
import type { NavSection } from "./inbox-view";

/** A call that never connected — the call-history "missed" partition. */
function isMissed(c: CallRecord): boolean {
  return (
    c.status === "missed" || c.status === "declined" || c.status === "failed"
  );
}

/**
 * Per-section nav badge counts: unread emails/chats from the inbox, and missed
 * (incoming, unanswered) calls from history. Shared by the desktop NavRail and
 * the mobile BottomTabBar so both stay in sync. Reuses the calls-history query
 * key, so it shares a cache with the Calls list (no extra fetch).
 */
export function useNavBadges(): Record<NavSection, number> {
  const { data: me } = useSession();
  const { data: threads } = useInboxThreads();
  const { data: calls } = useQuery({
    queryKey: ["calls", "history"],
    queryFn: () => getCallHistory(100),
    refetchInterval: 15_000,
  });

  const list = threads ?? [];
  const emails = list.filter((t) => t.unread && t.isEmail).length;
  const chats = list.filter((t) => t.unread && !t.isEmail).length;
  const missed = (calls ?? []).filter(
    (c) => isMissed(c) && !(me?.userId && c.callerId === me.userId),
  ).length;

  return {
    all: emails + chats,
    chats,
    emails,
    calls: missed,
    contacts: 0,
  };
}
