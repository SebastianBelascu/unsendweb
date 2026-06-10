"use client";

import Link from "next/link";
import { BellOff, Bookmark, Check, Paperclip, Pin } from "lucide-react";
import { Avatar } from "./Avatar";
import { UserAvatar } from "./UserAvatar";
import { ThreadActions } from "./ThreadActions";
import { Badge } from "@/components/ui/Badge";
import { threadTime } from "@/lib/format";
import { localPart, otherParticipants, threadDisplayName } from "@/lib/identity";
import { useOnline, useTyping } from "@/lib/realtime/hooks";
import { useDraftText } from "@/lib/drafts";
import { brandfetchFavicon } from "@/lib/brandfetch";
import { cn } from "@/lib/utils";
import type { MailFilter, ThreadListItem } from "@/lib/types";

export function ThreadCard({
  thread,
  filter,
  currentUsername,
  active = false,
  selecting = false,
  selected = false,
  onToggleSelect,
}: {
  thread: ThreadListItem;
  filter?: MailFilter;
  currentUsername?: string;
  active?: boolean;
  selecting?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const others = otherParticipants(thread.participants, currentUsername);
  const unread = thread.unread;
  // Trust the backend group flag; infer from count only when it's absent.
  const isGroup = thread.isGroup ?? others.length >= 2;
  const name =
    isGroup && thread.groupName
      ? thread.groupName
      : threadDisplayName(thread.participants, currentUsername);

  const dmUsername =
    !thread.isEmail && !isGroup && others[0]?.address
      ? localPart(others[0].address)
      : undefined;
  const online = useOnline(dmUsername);
  const typing = useTyping(thread.topicId);
  // Unsent draft for this thread → shows as a "Draft" preview (native ThreadRowView).
  const draft = useDraftText(thread.id).trim();

  // Brand favicon for promo/brand email senders — Brandfetch off the APEX domain
  // (native parity); the mail subdomain made Google return a generic globe.
  const favicon =
    thread.favicon ||
    (thread.isPromotional
      ? brandfetchFavicon(others[0]?.address)
      : undefined);

  const params = new URLSearchParams();
  if (thread.isEmail) {
    if (thread.subject) params.set("s", thread.subject);
    params.set("tid", thread.topicId);
  } else {
    params.set("n", name);
    params.set("t", thread.topicId);
    const addr = others[0]?.address;
    if (addr && !isGroup) params.set("a", addr);
    if (isGroup) params.set("g", "1");
  }
  const qs = params.toString() ? `?${params.toString()}` : "";
  const href = thread.isEmail
    ? `/mail/thread/${thread.id}${qs}`
    : `/chat/${thread.id}${qs}`;

  const inner = (
    <>
      {selecting && (
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
            selected ? "border-accent bg-accent text-white" : "border-line-strong",
          )}
        >
          {selected && <Check className="h-3.5 w-3.5" />}
        </span>
      )}
      {isGroup ? (
        <UserAvatar
          name={others[0]?.name ?? name}
          people={others.map((o) => ({ name: o.name, address: o.address }))}
          isEmail={thread.isEmail}
          size={52}
          online={online}
        />
      ) : favicon ? (
        <Avatar
          name={others[0]?.name ?? name}
          seed={others[0]?.address}
          favicon={favicon}
          isEmail={thread.isEmail}
          size={52}
          online={online}
        />
      ) : (
        <UserAvatar
          name={others[0]?.name ?? name}
          address={others[0]?.address}
          isEmail={thread.isEmail}
          size={52}
          online={online}
        />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              "truncate text-callout text-ink-strong",
              unread ? "font-bold" : "font-medium text-ink",
            )}
          >
            {name}
          </span>
          <span
            className={cn(
              "ml-auto shrink-0 text-caption",
              unread ? "font-semibold text-ink-strong" : "text-faint",
            )}
          >
            {threadTime(thread.updatedAt)}
          </span>
        </div>

        {thread.isEmail && (
          <div
            className={cn(
              "mt-0.5 flex items-center gap-1.5 text-subhead",
              unread ? "font-semibold text-ink" : "text-muted",
            )}
          >
            {thread.attachmentsCount ? (
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-faint" />
            ) : null}
            <span className="truncate">{thread.subject || "(no subject)"}</span>
          </div>
        )}

        <div className="mt-0.5 flex items-center gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-subhead",
              typing.length
                ? "font-medium text-accent"
                : unread
                  ? "text-ink"
                  : "text-faint",
            )}
          >
            {typing.length ? (
              isGroup && typing[0] ? (
                `${typing[0]} is typing…`
              ) : (
                "typing…"
              )
            ) : draft ? (
              <>
                <span className="font-semibold text-accent">Draft: </span>
                {draft}
              </>
            ) : (
              thread.preview
            )}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {thread.isSilent && <BellOff className="h-3.5 w-3.5 text-yellow" />}
            {thread.isPinned ? (
              <Pin className="h-3.5 w-3.5 rotate-45 text-ink-strong" />
            ) : thread.isBookmarked ? (
              <Bookmark className="h-3.5 w-3.5 fill-current text-faint" />
            ) : null}
            {thread.isDraft && (
              <span className="text-caption font-bold text-accent">draft</span>
            )}
            {unread && <Badge dot tone={thread.isEmail ? "email" : "chat"} />}
          </span>
        </div>
      </div>
    </>
  );

  // Fixed height so every row is identical, whether it's a 1-line chat preview
  // or a 2-line email (subject + body). Content is single-line (truncated) so it
  // always fits; items-center keeps it vertically centered.
  const rowClass =
    "flex h-[84px] items-center gap-3 border-b border-line px-4 pr-11 text-left transition-colors";

  return (
    <div className="group relative">
      {selecting ? (
        <button
          type="button"
          onClick={onToggleSelect}
          className={cn(rowClass, "w-full", selected ? "bg-surface" : "hover:bg-surface")}
        >
          {inner}
        </button>
      ) : (
        <Link
          href={href}
          className={cn(rowClass, active ? "bg-surface-3" : "hover:bg-surface")}
        >
          {inner}
        </Link>
      )}

      {filter && !selecting && (
        // Always reachable on touch (no hover); hover-revealed on desktop.
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-100 transition-opacity lg:opacity-0 lg:focus-within:opacity-100 lg:group-hover:opacity-100">
          <ThreadActions thread={thread} filter={filter} />
        </div>
      )}
    </div>
  );
}
