import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { ThreadsPage } from "@/lib/api/threads";
import type { ThreadListItem } from "@/lib/types";
import { mapThread } from "@/lib/api/mappers";
import type { BackendThread } from "@/lib/api/backend-types";
import { markBumped, markSeenLocally } from "./optimistic-bumps";
import { isActiveThread } from "./active-thread";

/*
  Optimistic conversation-list updates. The backend emits the socket `create`
  event BEFORE it commits the thread's updatedAt/seen (compose.service.ts), so a
  refetch right after returns STALE data for a few seconds. We therefore update
  the list cache ourselves — instant, and not fighting a stale refetch.

  The ["threads", *] caches are a MIX of shapes: inbox/bookmarks/spam/deleted are
  InfiniteData<ThreadsPage>, while ["threads","pinned"] is a flat ThreadListItem[]
  — so every updater branches on the actual shape and is wrapped in try/catch so a
  cosmetic cache write can NEVER crash the realtime/send flow.
*/

const isThreadArray = (v: unknown): v is ThreadListItem[] => Array.isArray(v);
const isInfinite = (v: unknown): v is InfiniteData<ThreadsPage> =>
  !!v && typeof v === "object" && Array.isArray((v as { pages?: unknown }).pages);

/** Bump a thread to the top with a fresh preview/updatedAt. Returns `found`. */
export function bumpThread(
  qc: QueryClient,
  opts: {
    threadId?: string;
    topicId?: string;
    preview?: string;
    outbound: boolean;
  },
): boolean {
  const { threadId, topicId, outbound } = opts;
  if (!threadId && !topicId) return false;

  // Protect this bump from a stale refetch for a short window (see
  // optimistic-bumps + the threads-query structuralSharing).
  markBumped(threadId, topicId);

  const preview = (opts.preview || "").replace(/\s+/g, " ").trim();
  const updatedAt = new Date().toISOString();
  const matches = (t: ThreadListItem | undefined) =>
    !!t &&
    ((!!threadId && t.id === threadId) || (!!topicId && t.topicId === topicId));
  const patch = (t: ThreadListItem): ThreadListItem => ({
    ...t,
    preview: preview || t.preview,
    updatedAt,
    // WhatsApp semantics: the OPEN conversation never bolds — you're reading it.
    unread: isActiveThread({ threadId: t.id, topicId: t.topicId })
      ? false
      : outbound
        ? t.unread
        : true,
  });

  let found = false;

  const flatBump = (list: unknown) => {
    try {
      if (!isThreadArray(list)) return list;
      const i = list.findIndex(matches);
      if (i < 0) return list;
      found = true;
      const next = list.slice();
      const [item] = next.splice(i, 1);
      next.unshift(patch(item));
      return next;
    } catch {
      return list;
    }
  };

  const update = (data: unknown) => {
    try {
      if (isThreadArray(data)) return flatBump(data);
      if (!isInfinite(data)) return data;
      let moved: ThreadListItem | undefined;
      const pages = data.pages.map((pg) => ({
        ...pg,
        items: (pg.items ?? []).filter((t) => {
          if (matches(t)) {
            moved = patch(t);
            return false;
          }
          return true;
        }),
      }));
      if (!moved) return data;
      found = true;
      const first = pages[0];
      pages[0] = { ...first, items: [moved, ...(first.items ?? [])] };
      return { ...data, pages };
    } catch {
      return data;
    }
  };

  qc.setQueriesData<unknown>({ queryKey: ["threads"] }, update);
  qc.setQueryData<unknown>(["chatThreads"], flatBump);

  return found;
}

/**
 * Insert a freshly-created conversation at the TOP of the inbox caches right
 * away, so a brand-new thread (compose's first send) shows in the list without
 * waiting for the refetch. Idempotent — skips if the row already exists; marks
 * the row bumped so the trailing refetch doesn't drop it before the server
 * commits. Mirrors the new-thread branch of `applyThreadEvent`.
 */
export function insertNewThreadRow(qc: QueryClient, item: ThreadListItem): void {
  try {
    if ((!item.id && !item.topicId) || item.isDeleted || item.isSpam) return;
    markBumped(item.id, item.topicId);
    const matches = (t: ThreadListItem | undefined) =>
      !!t &&
      ((!!item.id && t.id === item.id) ||
        (!!item.topicId && t.topicId === item.topicId));

    qc.setQueryData<InfiniteData<ThreadsPage>>(["threads", "inbox"], (cache) => {
      if (!cache) return cache;
      if (cache.pages.some((pg) => (pg.items ?? []).some(matches))) return cache;
      const [first, ...rest] = cache.pages;
      const f = first ?? { items: [], page: 1, totalPages: 1 };
      return {
        ...cache,
        pages: [{ ...f, items: [item, ...(f.items ?? [])] }, ...rest],
      };
    });
    // Flat caches: the nav-badge inbox snapshot + the chat-only list.
    qc.setQueryData<ThreadListItem[]>(["threads", "inboxAll"], (list) =>
      Array.isArray(list) && !list.some(matches) ? [item, ...list] : list,
    );
    if (!item.isEmail) {
      qc.setQueryData<ThreadListItem[]>(["chatThreads"], (list) =>
        Array.isArray(list) && !list.some(matches) ? [item, ...list] : list,
      );
    }
  } catch {
    /* a cosmetic list write must never break the send flow */
  }
}

/**
 * Reconcile a THREAD socket event (`data.lastMessage` present, no `headerId`)
 * into the conversation-list caches — the instant-list counterpart to the
 * message reconciliation in SocketProvider. Mirrors the native `useThreadUpdates`
 * hook: an existing thread is bumped (preview/unread/order) in place; a brand-new
 * one is inserted at the top of the inbox so it appears WITHOUT waiting for a
 * refetch (previously such threads lagged behind the 1.2s/20s refetch).
 */
export function applyThreadEvent(qc: QueryClient, data: BackendThread): void {
  try {
    const lm = data.lastMessage;
    const preview =
      lm?.reactionText ||
      lm?.text ||
      (lm?.attachments?.length ? "📎 Attachment" : "");
    const found = bumpThread(qc, {
      threadId: data.threadId || data._id,
      topicId: data.topicId,
      preview,
      outbound: Boolean(lm?.outbound),
    });
    if (found) return;

    // Brand-new conversation → insert the full mapped row at the top of inbox.
    const item = mapThread(data);
    if ((!item.id && !item.topicId) || item.isDeleted || item.isSpam) return;
    markBumped(item.id, item.topicId);

    const matches = (t: ThreadListItem | undefined) =>
      !!t &&
      ((!!item.id && t.id === item.id) ||
        (!!item.topicId && t.topicId === item.topicId));

    qc.setQueryData<InfiniteData<ThreadsPage>>(["threads", "inbox"], (cache) => {
      if (!cache) return cache;
      if (cache.pages.some((pg) => (pg.items ?? []).some(matches))) return cache;
      const [first, ...rest] = cache.pages;
      const f = first ?? { items: [], page: 1, totalPages: 1 };
      return {
        ...cache,
        pages: [{ ...f, items: [item, ...(f.items ?? [])] }, ...rest],
      };
    });
    if (!item.isEmail) {
      qc.setQueryData<ThreadListItem[]>(["chatThreads"], (list) =>
        Array.isArray(list) && !list.some(matches) ? [item, ...list] : list,
      );
    }
  } catch {
    /* a cosmetic list write must never break realtime */
  }
}

/** Optimistically clear a thread's unread flag everywhere (instant un-bold). */
export function markThreadReadInCache(
  qc: QueryClient,
  ids: { threadId?: string; topicId?: string },
): void {
  const { threadId, topicId } = ids;
  if (!threadId && !topicId) return;
  // Shield the un-bold from refetches that land before the server commits the
  // seen write (they'd return seen=false and re-bold the row for a flash).
  markSeenLocally(threadId, topicId);
  const matches = (t: ThreadListItem | undefined) =>
    !!t &&
    ((!!threadId && t.id === threadId) || (!!topicId && t.topicId === topicId));
  const clear = (t: ThreadListItem) =>
    matches(t) && t.unread ? { ...t, unread: false } : t;

  const update = (data: unknown) => {
    try {
      if (isThreadArray(data)) return data.map(clear);
      if (!isInfinite(data)) return data;
      return {
        ...data,
        pages: data.pages.map((pg) => ({
          ...pg,
          items: (pg.items ?? []).map(clear),
        })),
      };
    } catch {
      return data;
    }
  };

  qc.setQueriesData<unknown>({ queryKey: ["threads"] }, update);
  qc.setQueryData<unknown>(["chatThreads"], (data: unknown) =>
    isThreadArray(data) ? data.map(clear) : data,
  );
}
