"use client";

import { UserAvatar } from "@/components/mail/UserAvatar";
import { useSearchPeople } from "@/lib/api/search";
import { useComposeModal } from "@/lib/compose-modal";

/*
  "People" section of universal search — surfaces contacts + platform users
  matching the query (even with no existing thread), so search finds people, not
  just open conversations. Tapping one starts/opens a chat. Rendered above the
  filtered conversation list while searching.
*/
export function SearchPeople({
  query,
  selfUsername,
}: {
  query: string;
  selfUsername?: string;
}) {
  const people = useSearchPeople(query, selfUsername);
  const openCompose = useComposeModal((s) => s.open);
  if (people.length === 0) return null;

  return (
    <div className="border-b border-line pb-1">
      <div className="px-4 pb-1 pt-2.5 text-micro font-semibold uppercase tracking-wide text-faint">
        People
      </div>
      {people.map((p) => (
        <button
          key={p.address}
          type="button"
          onClick={() => openCompose({ isEmail: false, to: p.address })}
          className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-surface-2"
        >
          <UserAvatar
            name={p.name}
            address={p.address}
            size={40}
            isEmail={false}
            showBadge={false}
          />
          <div className="min-w-0">
            <div className="truncate text-body font-semibold text-ink-strong">
              {p.name}
            </div>
            <div className="truncate text-footnote text-faint">
              @{p.username}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
