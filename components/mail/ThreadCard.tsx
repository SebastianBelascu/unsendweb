import Link from "next/link";
import { BellOff, Bookmark, Check, Paperclip, Pin } from "lucide-react";
import { Avatar } from "./Avatar";
import { ThreadActions } from "./ThreadActions";
import { threadTime } from "@/lib/format";
import { otherParticipants, threadDisplayName } from "@/lib/identity";
import { cn } from "@/lib/utils";
import type { MailFilter, ThreadListItem } from "@/lib/types";

export function ThreadCard({
  thread,
  filter,
  currentUsername,
  selecting = false,
  selected = false,
  onToggleSelect,
}: {
  thread: ThreadListItem;
  filter?: MailFilter;
  currentUsername?: string;
  selecting?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const others = otherParticipants(thread.participants, currentUsername);
  const name = threadDisplayName(thread.participants, currentUsername);
  const strong = thread.unread;
  const isGroup = others.length >= 2;

  const domain = others[0]?.address?.split("@")[1];
  const favicon =
    thread.favicon ||
    (thread.isPromotional && domain
      ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
      : undefined);

  const params = new URLSearchParams();
  if (thread.isEmail) {
    if (thread.subject) params.set("s", thread.subject);
    params.set("tid", thread.topicId);
  } else {
    params.set("n", name);
    params.set("t", thread.topicId);
    const addr = others[0]?.address;
    if (addr) params.set("a", addr);
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
            "mt-5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
            selected
              ? "border-email bg-email text-black"
              : "border-line-strong",
          )}
        >
          {selected && <Check className="h-3.5 w-3.5" />}
        </span>
      )}
      <Avatar
        name={others[0]?.name ?? name}
        seed={others[0]?.address}
        people={
          isGroup
            ? others.map((o) => ({ name: o.name, address: o.address }))
            : undefined
        }
        favicon={favicon}
        isEmail={thread.isEmail}
        size={56}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "truncate text-[16px]",
              strong ? "font-bold text-ink-strong" : "font-normal text-muted",
            )}
          >
            {name}
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {thread.isSilent && <BellOff className="h-3.5 w-3.5 text-yellow" />}
            {thread.isPinned ? (
              <Pin className="h-3.5 w-3.5 rotate-45 text-ink-strong" />
            ) : thread.isBookmarked ? (
              <Bookmark className="h-3.5 w-3.5 fill-current text-faint" />
            ) : null}
          </div>
        </div>

        {thread.isEmail && (
          <div
            className={cn(
              "mt-0.5 flex items-center gap-1.5 text-[15px]",
              strong ? "font-bold text-ink-strong" : "text-muted",
            )}
          >
            {thread.attachmentsCount ? (
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-faint" />
            ) : null}
            <span className="truncate">
              Subject: {thread.subject || "<no subject>"}
            </span>
          </div>
        )}

        <div className="mt-0.5 flex items-center gap-2">
          <span
            className={cn(
              "truncate text-[14px]",
              strong ? "text-ink" : "text-faint",
            )}
          >
            {thread.preview}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {thread.isDraft && (
              <span className="text-[12px] font-bold text-accent">draft</span>
            )}
            <span
              className={cn(
                "text-[12px]",
                strong ? "font-bold text-ink-strong" : "text-faint",
              )}
            >
              {threadTime(thread.updatedAt)}
            </span>
          </span>
        </div>
      </div>
    </>
  );

  const rowClass =
    "flex items-start gap-3 px-6 py-4 pr-12 text-left transition-colors hover:bg-surface/60";

  return (
    <div className="group relative">
      {selecting ? (
        <button
          type="button"
          onClick={onToggleSelect}
          className={cn(rowClass, "w-full", selected && "bg-surface/60")}
        >
          {inner}
        </button>
      ) : (
        <Link href={href} className={rowClass}>
          {inner}
        </Link>
      )}

      {filter && !selecting && (
        <div className="absolute right-2 top-3 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <ThreadActions thread={thread} filter={filter} />
        </div>
      )}
    </div>
  );
}
