"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCheck,
  ListChecks,
  Loader2,
  PenSquare,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { ThreadsList } from "./ThreadsList";
import { SyncStatus } from "./SyncStatus";
import { updateThreads, useThreadsInfinite } from "@/lib/api/threads";
import { markThreadSeen } from "@/lib/api/messages";
import { useSession } from "@/lib/api/account";
import { MAIL_FILTERS, type MailFilter } from "@/lib/types";

export function MailInbox({
  filter,
  emailOnly = false,
}: {
  filter: MailFilter;
  emailOnly?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const { data: me } = useSession();
  const qc = useQueryClient();
  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useThreadsInfinite(filter);

  const all = useMemo(() => {
    const items = data?.pages.flatMap((p) => p.items) ?? [];
    return filter === "inbox" && emailOnly
      ? items.filter((t) => t.isEmail)
      : items;
  }, [data, filter, emailOnly]);

  const threads = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (t) =>
        (t.subject ?? "").toLowerCase().includes(q) ||
        t.preview.toLowerCase().includes(q) ||
        t.participants.some(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.address ?? "").toLowerCase().includes(q),
        ),
    );
  }, [all, query]);

  const title =
    emailOnly && filter === "inbox"
      ? "Emails"
      : (MAIL_FILTERS.find((f) => f.key === filter)?.label ?? "Inbox");

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

  function toggleSelect(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runBulk(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
    } finally {
      qc.invalidateQueries({ queryKey: ["threads"] });
      qc.invalidateQueries({ queryKey: ["chatThreads"] });
      setSelected(new Set());
      setSelecting(false);
      setBusy(false);
    }
  }

  const ids = [...selected];

  return (
    <div className="flex h-full flex-col">
      {selecting ? (
        <header className="flex items-center gap-2 border-b border-line px-4 py-4">
          <button
            type="button"
            onClick={() => {
              setSelecting(false);
              setSelected(new Set());
            }}
            className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-ink"
            aria-label="Cancel selection"
          >
            <X className="h-5 w-5" />
          </button>
          <span className="text-[15px] font-semibold text-ink-strong">
            {selected.size} selected
          </span>
          <button
            type="button"
            onClick={() => setSelected(new Set(threads.map((t) => t.id)))}
            className="ml-1 text-[13px] text-link hover:underline"
          >
            Select all
          </button>

          <div className="ml-auto flex items-center gap-1">
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin text-faint" />}
            <BulkBtn
              label="Mark read"
              icon={CheckCheck}
              disabled={!ids.length || busy}
              onClick={() => runBulk(() => Promise.all(ids.map(markThreadSeen)))}
            />
            {filter === "spam" ? (
              <BulkBtn
                label="Not spam"
                icon={ShieldAlert}
                disabled={!ids.length || busy}
                onClick={() => runBulk(() => updateThreads(ids, "isSpam", false))}
              />
            ) : filter !== "deleted" ? (
              <BulkBtn
                label="Spam"
                icon={ShieldAlert}
                disabled={!ids.length || busy}
                onClick={() => runBulk(() => updateThreads(ids, "isSpam", true))}
              />
            ) : null}
            {filter === "deleted" ? (
              <BulkBtn
                label="Restore"
                icon={RotateCcw}
                disabled={!ids.length || busy}
                onClick={() => runBulk(() => updateThreads(ids, "isDeleted", false))}
              />
            ) : (
              <BulkBtn
                label="Delete"
                icon={Trash2}
                disabled={!ids.length || busy}
                onClick={() => runBulk(() => updateThreads(ids, "isDeleted", true))}
              />
            )}
          </div>
        </header>
      ) : (
        <header className="flex items-center gap-3 border-b border-line px-6 py-4">
          <h1 className="text-[20px] font-bold text-ink-strong">{title}</h1>
          <SyncStatus />

          <div className="relative ml-auto w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or email ID"
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

          <button
            type="button"
            onClick={() => setSelecting(true)}
            className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-surface-2 text-ink hover:bg-surface-3"
            aria-label="Select"
          >
            <ListChecks className="h-4 w-4" />
          </button>
          <Link
            href="/mail/compose"
            className="flex h-[42px] items-center gap-2 rounded-full bg-surface-2 px-4 text-[14px] font-semibold text-ink transition-colors hover:bg-surface-3"
          >
            <PenSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Compose</span>
          </Link>
        </header>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center p-10 text-faint">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-center text-sm text-muted">
            <p>Couldn&apos;t load your inbox.</p>
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
              emptyLabel={`No ${title.toLowerCase()} conversations`}
              filter={filter}
              currentUsername={me?.username}
              selecting={selecting}
              selectedIds={selected}
              onToggleSelect={toggleSelect}
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

function BulkBtn({
  label,
  icon: Icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: typeof Trash2;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={label}
      className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-surface-3 disabled:opacity-40"
    >
      <Icon className="h-4 w-4" />
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}
