"use client";

import { useMemo, useState } from "react";
import { Loader2, Users } from "lucide-react";
import { UserAvatar } from "@/components/mail/UserAvatar";
import { SearchField } from "@/components/ui/SearchField";
import { useContacts, type Contact } from "@/lib/api/contacts";
import { useComposeModal } from "@/lib/compose-modal";
import { localPart, MAIL_DOMAIN } from "@/lib/identity";
import { useLastSeen, useOnline, usePresenceFor } from "@/lib/realtime/hooks";

/*
  Contacts list (middle pane, "Contacts" rail section) — mirrors the native
  FriendsView chat-contacts: only Unsend users, each row with avatar + name +
  @username, an online dot / last-seen subtitle, and tap-to-chat. The composer
  reuses an existing DM if there is one.
*/

function lastSeenLabel(iso?: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "last seen just now";
  if (m < 60) return `last seen ${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `last seen ${h}h ago`;
  const d = Math.floor(h / 24);
  return `last seen ${d}d ago`;
}

function ContactRow({ c, onOpen }: { c: Contact; onOpen: () => void }) {
  const username = localPart(c.address);
  const online = useOnline(username);
  const lastSeen = useLastSeen(username);
  const name = c.name || username;
  const subtitle = online
    ? "online"
    : lastSeen
      ? lastSeenLabel(lastSeen)
      : `@${username}`;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2"
    >
      <UserAvatar
        name={name}
        address={c.address}
        size={48}
        isEmail={false}
        online={online}
        showBadge={false}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-body font-semibold text-ink-strong">
          {name}
        </div>
        <div
          className={online ? "truncate text-footnote text-email" : "truncate text-footnote text-faint"}
        >
          {subtitle}
        </div>
      </div>
    </button>
  );
}

export function ContactsPane() {
  const { data, isLoading, isError, refetch } = useContacts();
  const [query, setQuery] = useState("");
  const openCompose = useComposeModal((s) => s.open);

  // Chat contacts only (Unsend users) — external emails can't be messaged here.
  const all = useMemo(
    () =>
      [...(data ?? [])].filter((c) =>
        c.address.toLowerCase().includes(MAIL_DOMAIN),
      ),
    [data],
  );

  // Subscribe presence for the whole list → online dots + last-seen.
  const usernames = useMemo(() => all.map((c) => localPart(c.address)), [all]);
  usePresenceFor(usernames);

  const contacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? all.filter(
          (c) =>
            (c.name || "").toLowerCase().includes(q) ||
            c.address.toLowerCase().includes(q) ||
            (c.phone || "").includes(q),
        )
      : all;
    return [...filtered].sort((a, b) =>
      (a.name || a.address).localeCompare(b.name || b.address),
    );
  }, [all, query]);

  function startChat(c: Contact) {
    openCompose({ isEmail: false, to: c.address });
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-col gap-3 border-b border-line px-4 pb-3 pt-4">
        <h1 className="text-title font-bold text-ink-strong">Contacts</h1>
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search contacts"
        />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center p-10 text-faint">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-center text-subhead text-muted">
            <p>Couldn&apos;t load your contacts.</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="rounded-pill bg-surface-2 px-4 py-2 font-semibold text-ink hover:bg-surface-3"
            >
              Retry
            </button>
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-center text-muted">
            <Users className="h-10 w-10 text-faint" />
            <p className="text-subhead">
              {query ? "No contacts match your search." : "No contacts yet."}
            </p>
          </div>
        ) : (
          <ul className="py-1">
            {contacts.map((c) => (
              <li key={c.address}>
                <ContactRow c={c} onOpen={() => startChat(c)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
