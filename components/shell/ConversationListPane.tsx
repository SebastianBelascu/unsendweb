'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BellOff,
  Bookmark,
  Info,
  Loader2,
  PenSquare,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import { ThreadsList } from '@/components/mail/ThreadsList';
import { CallsList } from '@/components/calls/CallsList';
import { ContactsPane } from '@/components/contacts/ContactsPane';
import { SearchPeople } from './SearchPeople';
import { SyncStatus } from '@/components/mail/SyncStatus';
import { SearchField } from '@/components/ui/SearchField';
import { IconButton } from '@/components/ui/IconButton';
import { Chip } from '@/components/ui/Chip';
import {
  useBulkThreadAction,
  usePinnedThreads,
  useThreadsInfinite,
} from '@/lib/api/threads';
import { useSession } from '@/lib/api/account';
import { useDraftStore } from '@/lib/drafts';
import { useRouter } from 'next/navigation';
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
} from '@/lib/inbox-view';
import { cn } from '@/lib/utils';
import type { MailFilter } from '@/lib/types';

/** Bulk-action toolbar buttons for the current bucket (multi-select mode). */
function bulkActionsFor(
  f: MailFilter,
): { label: string; Icon: typeof Bookmark; updateType: string; update: boolean }[] {
  if (f === 'deleted')
    return [
      { label: 'Restore', Icon: RotateCcw, updateType: 'isDeleted', update: false },
    ];
  if (f === 'spam')
    return [
      { label: 'Not spam', Icon: ShieldAlert, updateType: 'isSpam', update: false },
      { label: 'Delete', Icon: Trash2, updateType: 'isDeleted', update: true },
    ];
  if (f === 'bookmarks')
    return [
      { label: 'Remove bookmark', Icon: Bookmark, updateType: 'isBookmarked', update: false },
      { label: 'Mute', Icon: BellOff, updateType: 'isSilent', update: true },
      { label: 'Delete', Icon: Trash2, updateType: 'isDeleted', update: true },
    ];
  // inbox / promotions
  return [
    { label: 'Bookmark', Icon: Bookmark, updateType: 'isBookmarked', update: true },
    { label: 'Mute', Icon: BellOff, updateType: 'isSilent', update: true },
    { label: 'Mark as spam', Icon: ShieldAlert, updateType: 'isSpam', update: true },
    { label: 'Delete', Icon: Trash2, updateType: 'isDeleted', update: true },
  ];
}

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
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [callFilter, setCallFilter] = useState<CallFilter>('all');
  const { data: me } = useSession();

  // Hydrate persisted drafts once so inbox rows can show a "Draft" preview.
  useEffect(() => useDraftStore.getState().hydrate(), []);

  // The active filter clamped to what this section supports (chats has no
  // promo/spam) — invalid filters fall back to "all" while keeping the stored
  // value for when you return to a section that does support it.
  const sectionFilters = filtersForSection(section);
  const effectiveFilter = sectionFilters.some((f) => f.key === filter)
    ? filter
    : 'all';
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
    if (effectiveFilter !== 'all') return base;
    // Pins sort by pinDate (when you pinned), NOT last-message time — native
    // `Thread.sortedDate`. So a fresh message in a pinned chat updates its
    // preview but never reshuffles the pinned group. Most-recently-pinned first.
    const pinKey = (t: (typeof items)[number]) =>
      +new Date(t.pinDate ?? t.updatedAt);
    const pins = (pinned ?? [])
      .filter((t) => !t.isDeleted && !t.isSpam && (!typePred || typePred(t)))
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
        (t.groupName ?? '').toLowerCase().includes(q) ||
        (t.subject ?? '').toLowerCase().includes(q) ||
        t.preview.toLowerCase().includes(q) ||
        t.participants.some(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.address ?? '').toLowerCase().includes(q),
        ),
    );
  }, [all, query]);

  // Multi-select (entered from a row's ⋮ → Select / Select all). Selection is
  // scoped to the current bucket; switching section/filter clears it.
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const bulk = useBulkThreadAction();
  useEffect(() => {
    setSelecting(false);
    setSelectedIds(new Set());
  }, [section, effectiveFilter]);

  const allSelected =
    threads.length > 0 && selectedIds.size >= threads.length;
  function enterSelect(id: string) {
    setSelecting(true);
    setSelectedIds(new Set([id]));
  }
  function selectAllVisible() {
    setSelecting(true);
    setSelectedIds(new Set(threads.map((t) => t.id)));
  }
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function cancelSelect() {
    setSelecting(false);
    setSelectedIds(new Set());
  }
  function runBulk(updateType: string, update: boolean) {
    if (selectedIds.size === 0) return;
    bulk.mutate({ ids: [...selectedIds], updateType, update });
    cancelSelect();
  }

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

  const router = useRouter();
  const title = sectionLabel(section);
  // Chats rail → chat compose; All/Emails → email compose.
  const composeEmail = section !== 'chats';

  function toggleSearch() {
    setSearchOpen((open) => {
      if (open) {
        // Closing the search panel clears the query AND the filter — the chips
        // live inside this panel, so a hidden active filter would be confusing.
        setQuery('');
        onFilter('all');
        setCallFilter('all');
      }
      return !open;
    });
  }

  // Calls section: same search principle as the thread sections — tap the search
  // icon to reveal the field + the filter chips (hidden until then).
  if (section === 'calls') {
    return (
      <div className="flex h-full flex-col">
        <header className="flex flex-col gap-3 border-b border-line px-4 pb-3 pt-4">
          <div className="flex items-center gap-2">
            <h1 className="text-title font-bold text-ink-strong">Calls</h1>
            <div className="ml-auto flex items-center gap-1">
              <IconButton
                label={searchOpen ? 'Close search' : 'Search'}
                variant="surface"
                size={38}
                onClick={toggleSearch}
              >
                {searchOpen ? (
                  <X className="h-4 w-4" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </IconButton>
              <IconButton
                label="Calls ring on the web only while Unsend is open in a tab."
                variant="ghost"
                size={38}
                className="cursor-default text-faint"
              >
                <Info className="h-4 w-4" />
              </IconButton>
            </div>
          </div>
          {searchOpen && (
            <>
              <SearchField
                value={query}
                onChange={setQuery}
                placeholder="Search by name, username or phone"
                autoFocus
              />
              <div className="-mx-1 flex flex-wrap gap-1.5 px-1 pb-0.5">
                {CALL_FILTERS.map((c) => {
                  const on = callFilter === c.key;
                  return (
                    <Chip
                      key={c.key}
                      active={on}
                      onClick={() => setCallFilter(on ? 'all' : c.key)}
                      className={cn(
                        'gap-1 px-2',
                        on && 'bg-accent text-white hover:opacity-90',
                      )}
                    >
                      {c.label}
                      {on && <X className="-mr-0.5 h-3.5 w-3.5" />}
                    </Chip>
                  );
                })}
              </div>
            </>
          )}
        </header>
        <CallsList filter={callFilter} query={query} />
      </div>
    );
  }

  // The contacts section shows the address book (no threads).
  if (section === 'contacts') {
    return <ContactsPane />;
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-col gap-3 border-b border-line px-4 pb-3 pt-4">
        {selecting ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={cancelSelect}
              aria-label="Cancel selection"
              className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-ink"
            >
              <X className="h-5 w-5" />
            </button>
            <span className="text-headline font-semibold text-ink-strong">
              {selectedIds.size} selected
            </span>
            <button
              type="button"
              onClick={() =>
                allSelected ? setSelectedIds(new Set()) : selectAllVisible()
              }
              className="ml-1 rounded-pill bg-surface-2 px-3 py-1 text-footnote font-medium text-ink hover:bg-surface-3"
            >
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
            <div className="ml-auto flex items-center gap-1">
              {bulkActionsFor(backendFilter).map((a) => (
                <IconButton
                  key={a.label}
                  label={a.label}
                  variant="surface"
                  size={38}
                  onClick={() => runBulk(a.updateType, a.update)}
                >
                  <a.Icon className="h-4 w-4" />
                </IconButton>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <h1 className="text-title font-bold text-ink-strong">{title}</h1>
            <SyncStatus />
            <div className="ml-auto flex items-center gap-1">
              <IconButton
                label={searchOpen ? 'Close search' : 'Search'}
                variant="surface"
                size={38}
                onClick={toggleSearch}
              >
                {searchOpen ? (
                  <X className="h-4 w-4" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </IconButton>
              <button
                type="button"
                onClick={() =>
                  router.push(`/compose?type=${composeEmail ? 'email' : 'chat'}`)
                }
                aria-label="Compose"
                title="Compose"
                className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-accent text-white transition-colors hover:opacity-90"
              >
                <PenSquare className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
        {searchOpen && !selecting && (
          <>
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder="Search"
              autoFocus
            />
            <div className="-mx-1 flex flex-wrap gap-1.5 px-1 pb-0.5">
              {sectionFilters.map((c) => {
                const on = effectiveFilter === c.key;
                return (
                  <Chip
                    key={c.key}
                    active={on}
                    onClick={() => onFilter(on ? 'all' : c.key)}
                    className={cn(
                      'gap-1 px-2',
                      on && 'bg-accent text-white hover:opacity-90',
                    )}
                  >
                    {c.label}
                    {on && <X className="-mr-0.5 h-3.5 w-3.5" />}
                  </Chip>
                );
              })}
            </div>
          </>
        )}
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
            {/* "People" surfaces chat users and opens a CHAT on tap — only
                meaningful in chat-oriented sections. Hidden in Emails, where
                chat people next to an email search reads as confusing. */}
            {query.trim() && section !== 'emails' && (
              <SearchPeople query={query} selfUsername={me?.username} />
            )}
            <ThreadsList
              threads={threads}
              emptyLabel={`No ${title.toLowerCase()} conversations`}
              filter={backendFilter}
              currentUsername={me?.username}
              activeId={activeId}
              selecting={selecting}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onEnterSelect={enterSelect}
              onSelectAll={selectAllVisible}
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
