"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AtSign,
  CheckCheck,
  ListChecks,
  Loader2,
  PenSquare,
  RotateCcw,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { ThreadsList } from "@/components/mail/ThreadsList";
import { CallsList } from "@/components/calls/CallsList";
import { ContactsPane } from "@/components/contacts/ContactsPane";
import { MentionsSheet } from "@/components/mail/MentionsSheet";
import { SearchPeople } from "./SearchPeople";
import { SyncStatus } from "@/components/mail/SyncStatus";
import { SearchField } from "@/components/ui/SearchField";
import { IconButton } from "@/components/ui/IconButton";
import { Chip } from "@/components/ui/Chip";
import {
  updateThreads,
  usePinnedThreads,
  useThreadsInfinite,
} from "@/lib/api/threads";
import { markThreadSeen } from "@/lib/api/messages";
import { useSession } from "@/lib/api/account";
import { useComposeModal } from "@/lib/compose-modal";
import {
  INBOX_FILTERS,
  filterBackendFilter,
  filterPredicate,
  promoVisible,
  sectionLabel,
  sectionTypePredicate,
  type InboxFilter,
  type NavSection,
} from "@/lib/inbox-view";
import { cn } from "@/lib/utils";

/**
 * Conversation list (middle pane). The left rail picks the `section`; inside the
 * inbox section, chips pick the `filter`. The "calls" section shows call history
 * instead of threads.
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
  const [selecting, setSelecting] = useState(false);
  const [mentionsOpen, setMentionsOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const { data: me } = useSession();
  const qc = useQueryClient();

  const isCalls = section === "calls";
  const backendFilter = filterBackendFilter(filter);
  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useThreadsInfinite(backendFilter);
  // Pinned threads are excluded from the backend `inbox` filter, so fetch them
  // separately and pin them to the top of the normal ("all" bucket) view.
  const { data: pinned } = usePinnedThreads();

  const all = useMemo(() => {
    const items = data?.pages.flatMap((p) => p.items) ?? [];
    const typePred = sectionTypePredicate(section); // chats vs emails vs all
    const bucketPred = filterPredicate(filter); // unread / groups
    const keep = (t: (typeof items)[number]) =>
      (!typePred || typePred(t)) &&
      (!bucketPred || bucketPred(t)) &&
      promoVisible(t, filter, backendFilter); // promo only under "Promotions"
    const base = items.filter(keep);
    // Pinned row only on the normal bucket (chip "all"); honor the rail type.
    if (filter !== "all") return base;
    const pins = (pinned ?? []).filter(
      (t) =>
        !t.isDeleted &&
        !t.isSpam &&
        !t.isPromotional &&
        (!typePred || typePred(t)),
    );
    if (!pins.length) return base;
    const pinnedIds = new Set(pins.map((t) => t.id));
    return [...pins, ...base.filter((t) => !pinnedIds.has(t.id))];
  }, [data, section, filter, pinned, backendFilter]);

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
  const openCompose = useComposeModal((s) => s.open);
  const title = sectionLabel(section);
  // Chats rail → chat compose; All/Emails → email compose.
  const composeEmail = section !== "chats";

  // The calls section has its own list (no threads, no selection).
  if (section === "calls") {
    return (
      <div className="flex h-full flex-col">
        <header className="flex items-center gap-2 border-b border-line px-4 pb-3 pt-4">
          <h1 className="text-title font-bold text-ink-strong">Calls</h1>
        </header>
        <CallsList />
      </div>
    );
  }

  // The contacts section shows the address book (no threads, no selection).
  if (section === "contacts") {
    return <ContactsPane />;
  }

  return (
    <div className="flex h-full flex-col">
      {selecting ? (
        <header className="flex flex-col gap-2.5 border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <IconButton
              label="Cancel selection"
              onClick={() => {
                setSelecting(false);
                setSelected(new Set());
              }}
              size={36}
            >
              <X className="h-5 w-5" />
            </IconButton>
            <span className="text-body font-semibold text-ink-strong">
              {selected.size} selected
            </span>
            {busy && <Loader2 className="h-4 w-4 animate-spin text-faint" />}
            <button
              type="button"
              onClick={() =>
                setSelected((cur) =>
                  cur.size >= threads.length && threads.length > 0
                    ? new Set()
                    : new Set(threads.map((t) => t.id)),
                )
              }
              className="ml-auto rounded-pill px-3 py-1.5 text-footnote font-semibold text-link hover:bg-surface-3"
            >
              {selected.size >= threads.length && threads.length > 0
                ? "Deselect all"
                : "Select all"}
            </button>
          </div>
          <div className="flex items-stretch gap-1.5">
            <BulkBtn
              label="Mark read"
              icon={CheckCheck}
              disabled={!ids.length || busy}
              onClick={() => runBulk(() => Promise.all(ids.map(markThreadSeen)))}
            />
            {backendFilter === "spam" ? (
              <BulkBtn
                label="Not spam"
                icon={ShieldAlert}
                disabled={!ids.length || busy}
                onClick={() => runBulk(() => updateThreads(ids, "isSpam", false))}
              />
            ) : backendFilter !== "deleted" ? (
              <BulkBtn
                label="Spam"
                icon={ShieldAlert}
                disabled={!ids.length || busy}
                onClick={() => runBulk(() => updateThreads(ids, "isSpam", true))}
              />
            ) : null}
            {backendFilter === "deleted" ? (
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
                danger
                disabled={!ids.length || busy}
                onClick={() => runBulk(() => updateThreads(ids, "isDeleted", true))}
              />
            )}
          </div>
        </header>
      ) : (
        <header className="flex flex-col gap-3 border-b border-line px-4 pb-3 pt-4">
          <div className="flex items-center gap-2">
            <h1 className="text-title font-bold text-ink-strong">{title}</h1>
            <SyncStatus />
            <div className="ml-auto flex items-center gap-1">
              <IconButton
                label="Mentions"
                variant="surface"
                size={38}
                onClick={() => setMentionsOpen(true)}
              >
                <AtSign className="h-4 w-4" />
              </IconButton>
              <IconButton
                label="Select"
                variant="surface"
                size={38}
                onClick={() => setSelecting(true)}
              >
                <ListChecks className="h-4 w-4" />
              </IconButton>
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
          <SearchField value={query} onChange={setQuery} placeholder="Search" />
          {!isCalls && (
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
              {INBOX_FILTERS.map((c) => (
                <Chip
                  key={c.key}
                  active={filter === c.key}
                  onClick={() => onFilter(c.key)}
                >
                  {c.label}
                </Chip>
              ))}
            </div>
          )}
        </header>
      )}

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

      {mentionsOpen && <MentionsSheet onClose={() => setMentionsOpen(false)} />}
    </div>
  );
}

function BulkBtn({
  label,
  icon: Icon,
  disabled,
  danger,
  onClick,
}: {
  label: string;
  icon: typeof Trash2;
  disabled: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={label}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-1 rounded-xl bg-surface-2 px-2 py-2 text-caption font-semibold transition-colors hover:bg-surface-3 disabled:opacity-40",
        danger ? "text-accent" : "text-ink",
      )}
    >
      <Icon className="h-[18px] w-[18px]" />
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}
