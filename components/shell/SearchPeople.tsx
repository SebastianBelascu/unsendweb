"use client";

import { useRouter } from "next/navigation";
import { UserAvatar } from "@/components/mail/UserAvatar";
import { useSearchPeople } from "@/lib/api/search";
import { useChatThreads } from "@/lib/api/threads";
import { useComposeModal } from "@/lib/compose-modal";
import { chatHref, findDmThread } from "@/lib/chat-href";

/*
  "People" section of universal search — surfaces contacts + platform users
  matching the query (even with no existing thread), so search finds people, not
  just open conversations. Tapping one OPENS the existing chat thread (the goal)
  and only falls back to compose when there's no thread yet. Rendered above the
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
  const { data: chats } = useChatThreads();
  const openCompose = useComposeModal((s) => s.open);
  const router = useRouter();
  if (people.length === 0) return null;

  function openPerson(address: string) {
    const dm = findDmThread(chats, address);
    if (dm) router.push(chatHref(dm, selfUsername));
    else openCompose({ isEmail: false, to: address });
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
          onClick={() => openPerson(p.address)}
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
