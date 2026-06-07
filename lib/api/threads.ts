import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiGet, apiSend } from "./http";
import { mapThread } from "./mappers";
import type { ThreadsResponse } from "./backend-types";
import type { MailFilter, ThreadListItem } from "../types";

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
  return useInfiniteQuery({
    queryKey: ["threads", filter],
    queryFn: ({ pageParam }) => fetchThreadsPage(filter, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page < last.totalPages ? last.page + 1 : undefined,
    refetchInterval: 20_000,
  });
}

/** Chat inbox: separate cache key; filters the inbox to non-email threads. */
export function useChatThreads() {
  return useQuery({
    queryKey: ["chatThreads"],
    queryFn: async () => {
      const res = await apiGet<ThreadsResponse>(
        `/threads/filter/inbox/page/1/size/50`,
      );
      return (res?.data ?? []).map(mapThread).filter((t) => !t.isEmail);
    },
    refetchInterval: 20_000,
  });
}

export async function updateThreads(
  threadIds: string[],
  updateType: string,
  update: boolean,
): Promise<unknown> {
  return apiSend("/threads/update", "PUT", { threadIds, updateType, update });
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
      qc.invalidateQueries({ queryKey: key });
    },
  });
}
