import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { ThreadsPage } from "@/lib/api/threads";
import type { ThreadListItem } from "@/lib/types";
import { markBumped } from "./optimistic-bumps";

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
    unread: outbound ? t.unread : true,
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

/** Optimistically clear a thread's unread flag everywhere (instant un-bold). */
export function markThreadReadInCache(
  qc: QueryClient,
  ids: { threadId?: string; topicId?: string },
): void {
  const { threadId, topicId } = ids;
  if (!threadId && !topicId) return;
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
