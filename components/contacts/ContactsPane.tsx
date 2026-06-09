"use client";

import { useMemo, useState } from "react";
import { Loader2, Users } from "lucide-react";
import { UserAvatar } from "@/components/mail/UserAvatar";
import { SearchField } from "@/components/ui/SearchField";
import { useContacts, type Contact } from "@/lib/api/contacts";
import { useComposeModal } from "@/lib/compose-modal";
import { localPart } from "@/lib/identity";

/*
  Contacts list (middle pane, "Contacts" rail section). Lists the user's address
  book with search; tapping a contact opens the chat composer pre-addressed to
  them (the backend reuses an existing DM if there is one).
*/
export function ContactsPane() {
  const { data, isLoading, isError, refetch } = useContacts();
  const [query, setQuery] = useState("");
  const openCompose = useComposeModal((s) => s.open);

  const contacts = useMemo(() => {
    const list = [...(data ?? [])].sort((a, b) =>
      (a.name || a.address).localeCompare(b.name || b.address),
    );
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) =>
        (c.name || "").toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q) ||
        (c.phone || "").includes(q),
    );
  }, [data, query]);

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
            {contacts.map((c) => {
              const name = c.name || localPart(c.address);
              return (
                <li key={c.address}>
                  <button
                    type="button"
                    onClick={() => startChat(c)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2"
                  >
                    <UserAvatar
                      name={name}
                      address={c.address}
                      size={44}
                      isEmail={false}
                      showBadge={false}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-body font-semibold text-ink-strong">
                        {name}
                      </div>
                      <div className="truncate text-footnote text-faint">
                        {c.phone || c.address}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
