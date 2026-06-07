"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, PenSquare, Search, X } from "lucide-react";
import { ThreadsList } from "./ThreadsList";
import { SyncStatus } from "./SyncStatus";
import { useThreadsInfinite } from "@/lib/api/threads";
import { useSession } from "@/lib/api/account";

/** Chat inbox (DM + group): the inbox thread stream filtered to non-email. */
export function ChatInbox() {
  const [query, setQuery] = useState("");
  const { data: me } = useSession();
  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useThreadsInfinite("inbox");

  const all = useMemo(
    () => (data?.pages.flatMap((p) => p.items) ?? []).filter((t) => !t.isEmail),
    [data],
  );

  const threads = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (t) =>
        t.preview.toLowerCase().includes(q) ||
        t.participants.some(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.address ?? "").toLowerCase().includes(q),
        ),
    );
  }, [all, query]);

  // Keep pulling pages so chats aren't hidden behind a wall of emails.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const ob = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !isFetchingNextPage) fetchNextPage();
    });
    ob.observe(el);
    return () => ob.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-line px-6 py-4">
        <h1 className="text-[20px] font-bold text-ink-strong">Chats</h1>
        <SyncStatus />

        <div className="relative ml-auto w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            className="h-[42px] w-full rounded-full border border-line-strong bg-canvas pl-9 pr-9 text-[15px] text-ink-strong outline-none placeholder:text-faint focus:border-muted"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-ink"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <Link
          href="/mail/compose?type=chat"
          className="flex h-[42px] items-center gap-2 rounded-full bg-surface-2 px-4 text-[14px] font-semibold text-ink transition-colors hover:bg-surface-3"
        >
          <PenSquare className="h-4 w-4" />
          <span className="hidden sm:inline">New chat</span>
        </Link>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center p-10 text-faint">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-center text-sm text-muted">
            <p>Couldn&apos;t load your chats.</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="rounded-full bg-surface-2 px-4 py-2 font-semibold text-ink hover:bg-surface-3"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <ThreadsList
              threads={threads}
              emptyLabel="No conversations yet"
              currentUsername={me?.username}
            />
            <div ref={sentinel} className="h-8" />
            {isFetchingNextPage && (
              <div className="flex justify-center pb-4 text-faint">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
