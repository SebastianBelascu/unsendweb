"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, PenSquare, X } from "lucide-react";
import { ThreadsList } from "@/components/mail/ThreadsList";
import { CallsList } from "@/components/calls/CallsList";
import { ContactsPane } from "@/components/contacts/ContactsPane";
import { SearchPeople } from "./SearchPeople";
import { SyncStatus } from "@/components/mail/SyncStatus";
import { SearchField } from "@/components/ui/SearchField";
import { Chip } from "@/components/ui/Chip";
import { usePinnedThreads, useThreadsInfinite } from "@/lib/api/threads";
import { useSession } from "@/lib/api/account";
import { useDraftStore } from "@/lib/drafts";
import { useComposeModal } from "@/lib/compose-modal";
import {
  CALL_FILTERS,
  filterBackendFilter,
  filtersForSection,
  promoVisible,
  sectionLabel,
  sectionTypePredicate,
  type CallFilter,
  type InboxFilter,
  type NavSection,
} from "@/lib/inbox-view";
import { cn } from "@/lib/utils";

/**
 * Conversation list (middle pane). The left rail picks the `section`; chips pick
 * the bucket (per section). Search is collapsed behind an icon. Calls + Contacts
 * sections render their own lists.
 */
export function ConversationListPane({
  section,
  filter,
  onFilter,
  activeId,
}: {
  section: NavSection;
  filter: InboxFilter;
  onFilter: (f: InboxFilter) => void;
  activeId?: string;
}) {
  const [query, setQuery] = useState("");
  const [callFilter, setCallFilter] = useState<CallFilter>("all");
  const { data: me } = useSession();

  // Hydrate persisted drafts once so inbox rows can show a "Draft" preview.
  useEffect(() => useDraftStore.getState().hydrate(), []);

  // The active filter clamped to what this section supports (chats has no
  // promo/spam) — invalid filters fall back to "all" while keeping the stored
  // value for when you return to a section that does support it.
  const sectionFilters = filtersForSection(section);
  const effectiveFilter = sectionFilters.some((f) => f.key === filter)
    ? filter
    : "all";
  const backendFilter = filterBackendFilter(effectiveFilter);

  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useThreadsInfinite(backendFilter);
  const { data: pinned } = usePinnedThreads();

  const all = useMemo(() => {
    const items = data?.pages.flatMap((p) => p.items) ?? [];
    const typePred = sectionTypePredicate(section); // chats vs emails vs all
    const keep = (t: (typeof items)[number]) =>
      (!typePred || typePred(t)) &&
      promoVisible(t, effectiveFilter, backendFilter); // promo only under "Promotions"
    // Order by last-message time (the mapped `updatedAt`), so metadata bumps
    // (bookmark/silent/read) never reorder the list — only pin does, via pins.
    const base = items
      .filter(keep)
      .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
    // Pinned row only on the normal bucket (chip "all"); honor the rail type.
    if (effectiveFilter !== "all") return base;
    // Pins sort by pinDate (when you pinned), NOT last-message time — native
    // `Thread.sortedDate`. So a fresh message in a pinned chat updates its
    // preview but never reshuffles the pinned group. Most-recently-pinned first.
    const pinKey = (t: (typeof items)[number]) =>
      +new Date(t.pinDate ?? t.updatedAt);
    const pins = (pinned ?? [])
      .filter(
        (t) => !t.isDeleted && !t.isSpam && (!typePred || typePred(t)),
      )
      .sort((a, b) => pinKey(b) - pinKey(a));
    if (!pins.length) return base;
    const pinnedIds = new Set(pins.map((t) => t.id));
    return [...pins, ...base.filter((t) => !pinnedIds.has(t.id))];
  }, [data, section, effectiveFilter, pinned, backendFilter]);

  const threads = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (t) =>
        (t.groupName ?? "").toLowerCase().includes(q) ||
        (t.subject ?? "").toLowerCase().includes(q) ||
        t.preview.toLowerCase().includes(q) ||
        t.participants.some(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.address ?? "").toLowerCase().includes(q),
        ),
    );
  }, [all, query]);

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

  const openCompose = useComposeModal((s) => s.open);
  const title = sectionLabel(section);
  // Chats rail → chat compose; All/Emails → email compose.
  const composeEmail = section !== "chats";

  // Calls section: native parity — a persistent search bar pinned under the
  // title (like iOS `.searchable`), with the filter chips always visible below.
  if (section === "calls") {
    return (
      <div className="flex h-full flex-col">
        <header className="flex flex-col gap-3 border-b border-line px-4 pb-3 pt-4">
          <div className="flex items-center gap-2">
            <h1 className="text-title font-bold text-ink-strong">Calls</h1>
          </div>
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search by name, username or phone"
          />
          <div className="-mx-1 flex flex-wrap gap-1.5 px-1 pb-0.5">
            {CALL_FILTERS.map((c) => {
              const on = callFilter === c.key;
              return (
                <Chip
                  key={c.key}
                  active={on}
                  onClick={() => setCallFilter(on ? "all" : c.key)}
                  className={cn(
                    "gap-1 px-2",
                    on && "bg-accent text-white hover:opacity-90",
                  )}
                >
                  {c.label}
                  {on && <X className="-mr-0.5 h-3.5 w-3.5" />}
                </Chip>
              );
            })}
          </div>
        </header>
        <CallsList filter={callFilter} query={query} />
      </div>
    );
  }

  // The contacts section shows the address book (no threads).
  if (section === "contacts") {
    return <ContactsPane />;
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-col gap-3 border-b border-line px-4 pb-3 pt-4">
        <div className="flex items-center gap-2">
          <h1 className="text-title font-bold text-ink-strong">{title}</h1>
          <SyncStatus />
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => openCompose({ isEmail: composeEmail })}
              aria-label="Compose"
              title="Compose"
              className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-accent text-white transition-colors hover:opacity-90"
            >
              <PenSquare className="h-4 w-4" />
            </button>
          </div>
        </div>
        {/* Native parity: a persistent search bar pinned under the title (iOS
            `.searchable`), with the filter chips always visible below it. */}
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search"
        />
        <div className="-mx-1 flex flex-wrap gap-1.5 px-1 pb-0.5">
          {sectionFilters.map((c) => {
            const on = effectiveFilter === c.key;
            return (
              <Chip
                key={c.key}
                active={on}
                onClick={() => onFilter(on ? "all" : c.key)}
                className={cn(
                  "gap-1 px-2",
                  on && "bg-accent text-white hover:opacity-90",
                )}
              >
                {c.label}
                {on && <X className="-mr-0.5 h-3.5 w-3.5" />}
              </Chip>
            );
          })}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="px-4 py-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5">
                <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-surface-2" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3 w-1/3 animate-pulse rounded bg-surface-2" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-surface-2" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-center text-subhead text-muted">
            <p>Couldn&apos;t load your conversations.</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="rounded-pill bg-surface-2 px-4 py-2 font-semibold text-ink hover:bg-surface-3"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {query.trim() && (
              <SearchPeople query={query} selfUsername={me?.username} />
            )}
            <ThreadsList
              threads={threads}
              emptyLabel={`No ${title.toLowerCase()} conversations`}
              filter={backendFilter}
              currentUsername={me?.username}
              activeId={activeId}
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
