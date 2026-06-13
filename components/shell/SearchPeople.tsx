"use client";

import { useRouter } from "next/navigation";
import { UserAvatar } from "@/components/mail/UserAvatar";
import { useSearchPeople } from "@/lib/api/search";
import { useAllThreadsMeta, useInboxThreads } from "@/lib/api/threads";
import { chatHref, findDmThread, newChatHref } from "@/lib/chat-href";

/*
  "People" section of universal search — surfaces contacts + platform users
  matching the query (even with no existing thread), so search finds people, not
  just open conversations. Tapping one OPENS the existing chat thread (with its
  history) when one exists, else a fresh conversation view with the composer —
  never the old compose modal. Rendered above the filtered conversation list
  while searching.
*/
export function SearchPeople({
  query,
  selfUsername,
}: {
  query: string;
  selfUsername?: string;
}) {
  const people = useSearchPeople(query, selfUsername);
  // Resolve against the FULL thread set (not just inbox page-1) so an existing
  // conversation — even an old one — opens with its history instead of a blank
  // compose; fall back to inbox page-1 until the full set loads.
  const { data: allThreads } = useAllThreadsMeta();
  const { data: inbox } = useInboxThreads();
  const resolveSource = allThreads ?? inbox;
  const router = useRouter();
  if (people.length === 0) return null;

  function openPerson(address: string, name: string) {
    const dm = findDmThread(resolveSource, address);
    router.push(dm ? chatHref(dm, selfUsername) : newChatHref(address, name));
  }

  return (
    <div className="border-b border-line pb-1">
      <div className="px-4 pb-1 pt-2.5 text-micro font-semibold uppercase tracking-wide text-faint">
        People
      </div>
      {people.map((p) => (
        <button
          key={p.address}
          type="button"
          onClick={() => openPerson(p.address, p.name)}
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
