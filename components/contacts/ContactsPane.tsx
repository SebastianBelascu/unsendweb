'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  Loader2,
  MessageCircle,
  Mail,
  MoreVertical,
  Phone,
  Search,
  Users,
  Video,
  X,
} from 'lucide-react';
import { UserAvatar } from '@/components/mail/UserAvatar';
import { SearchField } from '@/components/ui/SearchField';
import { IconButton } from '@/components/ui/IconButton';
import { useContacts, type Contact } from '@/lib/api/contacts';
import { useChatThreads } from '@/lib/api/threads';
import { useComposeModal } from '@/lib/compose-modal';
import { useSession } from '@/lib/api/account';
import { placeCall } from '@/lib/calls/controller';
import { chatHref, findDmThread } from '@/lib/chat-href';
import { localPart, MAIL_DOMAIN } from '@/lib/identity';
import { useLastSeen, useOnline, usePresenceFor } from '@/lib/realtime/hooks';
import { useRealtime } from '@/lib/realtime/store';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

/*
  Contacts list (middle pane, "Contacts" rail section) — mirrors native
  FriendsView with three subscreens switched from a top-right ⋮ menu:
  - Chat Friends: Unsend users, tap-to-chat (default)
  - Email Friends: off-platform addresses, tap-to-email
  - Call: Unsend users with audio + video call CTAs
  All three filter the same address book (GET /contacts) by address domain.
*/

type Subscreen = 'chat' | 'email' | 'call';

const SUBSCREENS: {
  key: Subscreen;
  label: string;
  title: string;
  Icon: typeof MessageCircle;
}[] = [
  {
    key: 'chat',
    label: 'Chat Friends',
    title: 'Contacts',
    Icon: MessageCircle,
  },
  { key: 'email', label: 'Email Friends', title: 'Email Friends', Icon: Mail },
  { key: 'call', label: 'Call', title: 'Call', Icon: Phone },
];

function lastSeenLabel(iso?: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'last seen just now';
  if (m < 60) return `last seen ${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `last seen ${h}h ago`;
  const d = Math.floor(h / 24);
  return `last seen ${d}d ago`;
}

function ContactRow({
  c,
  variant,
  onOpen,
  onAudio,
  onVideo,
}: {
  c: Contact;
  variant: Subscreen;
  onOpen: () => void;
  onAudio?: () => void;
  onVideo?: () => void;
}) {
  const platform = variant !== 'email';
  const username = localPart(c.address);
  const online = useOnline(platform ? username : undefined);
  const lastSeen = useLastSeen(platform ? username : undefined);
  const name = c.name || username;
  const subtitle =
    variant === 'email'
      ? c.address
      : online
      ? 'online'
      : lastSeen
      ? lastSeenLabel(lastSeen)
      : `@${username}`;
  return (
    <div className="flex h-[120px] w-full items-center gap-4 border-b border-line px-4 transition-colors hover:bg-surface">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-4 text-left"
      >
        <UserAvatar
          name={name}
          address={c.address}
          size={64}
          isEmail={!platform}
          online={platform && online}
          showBadge={false}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-headline font-semibold text-ink-strong">
            {name}
          </div>
          <div
            className={cn(
              'mt-1.5 truncate text-body',
              platform && online ? 'text-email' : 'text-faint',
            )}
          >
            {subtitle}
          </div>
        </div>
      </button>
      {variant === 'call' && (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onAudio}
            aria-label={`Audio call ${name}`}
            title="Audio call"
            className="flex h-9 w-9 items-center justify-center rounded-full text-accent transition-colors hover:bg-surface-3"
          >
            <Phone className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={onVideo}
            aria-label={`Video call ${name}`}
            title="Video call"
            className="flex h-9 w-9 items-center justify-center rounded-full text-accent transition-colors hover:bg-surface-3"
          >
            <Video className="h-[18px] w-[18px]" />
          </button>
        </div>
      )}
    </div>
  );
}

export function ContactsPane() {
  const { data, isLoading, isError, refetch } = useContacts();
  const { data: me } = useSession();
  const { data: chats } = useChatThreads();
  const router = useRouter();
  const myUserId = me?.userId;
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [subscreen, setSubscreen] = useState<Subscreen>('chat');
  const [menuOpen, setMenuOpen] = useState(false);
  const openCompose = useComposeModal((s) => s.open);

  // Search collapses behind the icon (same as the thread/call sections) so the
  // header keeps an identical height across tabs — no jump on section switch.
  function toggleSearch() {
    setSearchOpen((open) => {
      if (open) setQuery('');
      return !open;
    });
  }

  const active = SUBSCREENS.find((s) => s.key === subscreen)!;

  // Partition the address book by domain: Unsend (platform) vs external email.
  const pool = useMemo(() => {
    const onPlatform = subscreen !== 'email';
    return [...(data ?? [])].filter((c) => {
      const isPlatform = c.address.toLowerCase().includes(MAIL_DOMAIN);
      return onPlatform ? isPlatform : !isPlatform;
    });
  }, [data, subscreen]);

  // Subscribe presence only for the platform subscreens.
  const usernames = useMemo(
    () => (subscreen === 'email' ? [] : pool.map((c) => localPart(c.address))),
    [pool, subscreen],
  );
  usePresenceFor(usernames);

  const online = useRealtime((s) => s.online);
  const lastSeen = useRealtime((s) => s.lastSeen);
  const contacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? pool.filter(
          (c) =>
            (c.name || '').toLowerCase().includes(q) ||
            c.address.toLowerCase().includes(q) ||
            (c.phone || '').includes(q),
        )
      : pool;
    // Email friends sort alphabetically; chat/call sort by activity (online →
    // most-recent last-seen → name), mirroring native FriendsView.
    if (subscreen === 'email') {
      return [...filtered].sort((a, b) =>
        (a.name || a.address).localeCompare(b.name || b.address),
      );
    }
    return [...filtered].sort((a, b) => {
      const ua = localPart(a.address);
      const ub = localPart(b.address);
      const oa = !!online[ua];
      const ob = !!online[ub];
      if (oa !== ob) return oa ? -1 : 1;
      if (!oa) {
        const la = lastSeen[ua];
        const lb = lastSeen[ub];
        if (la && lb) {
          if (la !== lb) return la > lb ? -1 : 1;
        } else if (la) return -1;
        else if (lb) return 1;
      }
      return (a.name || a.address).localeCompare(b.name || b.address);
    });
  }, [pool, query, online, lastSeen, subscreen]);

  function startChat(c: Contact) {
    // Native FriendsView: open the existing 1:1 chat if there is one; only fall
    // back to chat-compose when no thread exists yet.
    const dm = findDmThread(chats, c.address);
    if (dm) {
      router.push(chatHref(dm, me?.username));
      return;
    }
    openCompose({ isEmail: false, to: c.address });
  }
  function startEmail(c: Contact) {
    openCompose({ isEmail: true, to: c.address });
  }
  function callContact(c: Contact, isVideo: boolean) {
    if (!myUserId) {
      toast("Couldn't start the call");
      return;
    }
    void placeCall({
      recipientUsername: localPart(c.address),
      isVideo,
      peerName: c.name || localPart(c.address),
      peerAddress: c.address,
      callerId: myUserId,
    });
  }

  const emptyLabel = query
    ? 'No contacts match your search.'
    : subscreen === 'email'
    ? 'No email contacts yet.'
    : 'No contacts yet.';

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-col gap-3 border-b border-line px-4 pb-3 pt-4">
        <div className="flex items-center gap-2">
          <h1 className="text-title font-bold text-ink-strong">
            {active.title}
          </h1>
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
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Switch contacts view"
                title="Switch contacts view"
                className="flex h-[38px] w-[38px] items-center justify-center rounded-full text-faint transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <MoreVertical className="h-5 w-5" />
              </button>
              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="pop-in absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-2xl border border-line-strong bg-surface-2 py-1.5 shadow-2xl">
                    {SUBSCREENS.map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => {
                          setSubscreen(s.key);
                          setMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-footnote text-ink hover:bg-surface-3"
                      >
                        <s.Icon className="h-4 w-4 shrink-0 text-faint" />
                        <span className="flex-1">{s.label}</span>
                        {subscreen === s.key && (
                          <Check className="h-4 w-4 shrink-0 text-accent" />
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        {searchOpen && (
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder={`Search ${active.label.toLowerCase()}`}
            autoFocus
          />
        )}
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
            <p className="text-subhead">{emptyLabel}</p>
          </div>
        ) : (
          <ul className="flex flex-col">
            {contacts.map((c) => (
              <li key={c.address}>
                <ContactRow
                  c={c}
                  variant={subscreen}
                  onOpen={() =>
                    subscreen === 'email' ? startEmail(c) : startChat(c)
                  }
                  onAudio={() => callContact(c, false)}
                  onVideo={() => callContact(c, true)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
