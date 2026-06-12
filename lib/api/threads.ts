import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiGet, apiSend } from "./http";
import { mapParticipant, mapThread } from "./mappers";
import { recentlyBumped, recentlySeen } from "../realtime/optimistic-bumps";
import type { BackendThread, ThreadsResponse } from "./backend-types";
import type { MailFilter, ThreadListItem, ThreadParticipant } from "../types";

// MailFilter -> backend FetchThreadsFilterEnum value
const FILTER_MAP: Record<MailFilter, string> = {
  inbox: "inbox",
  bookmarks: "isBookmarked",
  spam: "isSpam",
  deleted: "isDeleted",
};

const PAGE_SIZE = 25;

export interface ThreadsPage {
  items: ThreadListItem[];
  page: number;
  totalPages: number;
}

/*
  The backend commits a thread's `lastMessage`/`updatedAt` AFTER emitting the
  socket event, so a refetch landing in that window returns a STALE preview/order
  and would clobber the instant optimistic bump (see realtime/threadCache.ts).
  On each refetch we therefore keep the cached copy of any thread bumped within
  the last few seconds, then defer to the backend once it has caught up
  (recentlyBumped expires) — self-healing. This runs only inside the queryFn (on
  fetch/refetch), NOT on the deliberate setQueryData updates like read-clear or
  flag toggles, so those still apply. Recency is tracked on the client clock only
  (see optimistic-bumps), avoiding any client/server timestamp comparison.
*/
function keepRecentlyBumped(cached: ThreadListItem[] | undefined) {
  const byId = new Map((cached ?? []).map((t) => [t.id, t]));
  return (t: ThreadListItem): ThreadListItem => {
    const old = byId.get(t.id);
    const kept =
      old && (recentlyBumped(t.id) || recentlyBumped(t.topicId)) ? old : t;
    // Seen-protection: we just marked this thread read locally; the server's
    // seen write lags, so a refetch in that window would re-bold it (flash).
    if (kept.unread && (recentlySeen(t.id) || recentlySeen(t.topicId)))
      return { ...kept, unread: false };
    return kept;
  };
}

export async function fetchThreadsPage(
  filter: MailFilter,
  page: number,
): Promise<ThreadsPage> {
  const res = await apiGet<ThreadsResponse>(
    `/threads/filter/${FILTER_MAP[filter]}/page/${page}/size/${PAGE_SIZE}`,
  );
  return {
    items: (res?.data ?? []).map(mapThread),
    page: res?.currentPage ?? page,
    totalPages: res?.totalPages ?? 1,
  };
}

export function useThreadsInfinite(filter: MailFilter) {
  const qc = useQueryClient();
  return useInfiniteQuery({
    queryKey: ["threads", filter],
    queryFn: async ({ pageParam }) => {
      const page = await fetchThreadsPage(filter, pageParam);
      const cached = qc.getQueryData<InfiniteData<ThreadsPage>>([
        "threads",
        filter,
      ]);
      const keep = keepRecentlyBumped(cached?.pages.flatMap((p) => p.items));
      return { ...page, items: page.items.map(keep) };
    },
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page < last.totalPages ? last.page + 1 : undefined,
    refetchInterval: 20_000,
  });
}

/**
 * Pinned threads. The backend excludes pinned threads from the `inbox` filter
 * (they live in a separate PINNED bucket), so we fetch them separately and the
 * list prepends them — otherwise pinning a chat makes it vanish.
 */
export async function fetchPinnedThreads(): Promise<ThreadListItem[]> {
  const res = await apiGet<ThreadsResponse>(
    `/threads/filter/isPinned/page/1/size/50`,
  );
  return (res?.data ?? []).map(mapThread);
}

export function usePinnedThreads() {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["threads", "pinned"],
    queryFn: async () => {
      const items = await fetchPinnedThreads();
      const cached = qc.getQueryData<ThreadListItem[]>(["threads", "pinned"]);
      return items.map(keepRecentlyBumped(cached));
    },
    refetchInterval: 20_000,
  });
}

/** Chat inbox: separate cache key; filters the inbox to non-email threads. */
export function useChatThreads() {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["chatThreads"],
    queryFn: async () => {
      const res = await apiGet<ThreadsResponse>(
        `/threads/filter/inbox/page/1/size/50`,
      );
      const items = (res?.data ?? [])
        .map(mapThread)
        .filter((t) => !t.isEmail);
      const cached = qc.getQueryData<ThreadListItem[]>(["chatThreads"]);
      return items.map(keepRecentlyBumped(cached));
    },
    refetchInterval: 20_000,
  });
}

/**
 * First page of the inbox (email + chat together), kept globally for the nav
 * unread badges. Unread threads sort to the top, so page 1 reliably catches
 * them; muted threads already carry unread=false (see mappers).
 */
export function useInboxThreads() {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["threads", "inboxAll"],
    queryFn: async () => {
      const res = await apiGet<ThreadsResponse>(
        `/threads/filter/inbox/page/1/size/50`,
      );
      const items = (res?.data ?? []).map(mapThread);
      const cached = qc.getQueryData<ThreadListItem[]>(["threads", "inboxAll"]);
      return items.map(keepRecentlyBumped(cached));
    },
    refetchInterval: 20_000,
  });
}

export async function fetchThreadParticipants(
  threadId: string,
): Promise<ThreadParticipant[]> {
  const t = await apiGet<BackendThread>(
    `/threads/${encodeURIComponent(threadId)}`,
  );
  return (t?.participants ?? []).map(mapParticipant);
}

/**
 * Full group roster (name + address) from the chat detail (GET /threads/:id).
 * The thread list collapses group participants to just the chat name, and a
 * freshly-synced external group has no addressed members in its local message
 * history — so the member list and their avatars are sourced from here.
 */
export function useThreadParticipants(threadId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["thread-participants", threadId],
    queryFn: () => fetchThreadParticipants(threadId),
    enabled: enabled && Boolean(threadId),
    staleTime: 60_000,
  });
}

export async function updateThreads(
  threadIds: string[],
  updateType: string,
  update: boolean,
): Promise<unknown> {
  return apiSend("/threads/update", "PUT", { threadIds, updateType, update });
}

/** Rename a group (PUT /chat/:topicId — the `subject` field carries the name). */
export async function updateChatName(
  topicId: string,
  subject: string,
): Promise<unknown> {
  return apiSend(`/chat/${topicId}`, "PUT", { subject });
}

/** Replace the full participant list (PUT /chat/:topicId/participants). */
export async function updateChatParticipants(
  topicId: string,
  participants: string[],
): Promise<unknown> {
  return apiSend(`/chat/${topicId}/participants`, "PUT", { participants });
}

/** Leave a group chat (PUT /chat/:topicId/leave). */
export async function leaveChat(topicId: string): Promise<unknown> {
  return apiSend(`/chat/${topicId}/leave`, "PUT");
}

/** Group-management mutations for one topic, all refreshing the thread caches. */
export function useGroupActions(topicId: string, threadId?: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["threads"] });
    qc.invalidateQueries({ queryKey: ["chatThreads"] });
    if (threadId) qc.invalidateQueries({ queryKey: ["messages", threadId] });
  };
  const rename = useMutation({
    mutationFn: (subject: string) => updateChatName(topicId, subject),
    onSuccess: invalidate,
  });
  const setParticipants = useMutation({
    mutationFn: (participants: string[]) =>
      updateChatParticipants(topicId, participants),
    onSuccess: invalidate,
  });
  const leave = useMutation({
    mutationFn: () => leaveChat(topicId),
    onSuccess: invalidate,
  });
  return { rename, setParticipants, leave };
}

const FLAG_KEY: Record<string, keyof ThreadListItem> = {
  isPinned: "isPinned",
  isBookmarked: "isBookmarked",
  isSilent: "isSilent",
  isSpam: "isSpam",
  isDeleted: "isDeleted",
};

export function useThreadAction(filter: MailFilter) {
  const qc = useQueryClient();
  const key = ["threads", filter];

  return useMutation({
    mutationFn: ({
      id,
      updateType,
      update,
    }: {
      id: string;
      updateType: string;
      update: boolean;
    }) => updateThreads([id], updateType, update),

    onMutate: async ({ id, updateType, update }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<InfiniteData<ThreadsPage>>(key);
      const removeIt =
        (updateType === "isDeleted" || updateType === "isSpam") && update;
      const flag = FLAG_KEY[updateType];

      qc.setQueryData<InfiniteData<ThreadsPage>>(key, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((pg) => ({
            ...pg,
            items: removeIt
              ? pg.items.filter((t) => t.id !== id)
              : pg.items.map((t) =>
                  t.id === id && flag ? { ...t, [flag]: update } : t,
                ),
          })),
        };
      });

      return { prev };
    },

    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },

    onSettled: () => {
      // Invalidate every thread list (inbox + pinned + other filters): pinning
      // moves a thread between the inbox and pinned buckets server-side.
      qc.invalidateQueries({ queryKey: ["threads"] });
    },
  });
}
