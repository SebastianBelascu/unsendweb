"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AtSign, Loader2, X } from "lucide-react";
import { UserAvatar } from "./UserAvatar";
import { MentionText } from "./MentionText";
import { useMentionsInbox } from "@/lib/api/messages";
import { useChatThreads } from "@/lib/api/threads";
import { useSession } from "@/lib/api/account";
import { threadTime } from "@/lib/format";
import { otherParticipants, threadDisplayName } from "@/lib/identity";
import type { ThreadListItem } from "@/lib/types";

/** Deep-link to a chat thread, mirroring ThreadCard's chat href construction. */
function chatHref(t: ThreadListItem, currentUsername?: string): string {
  const others = otherParticipants(t.participants, currentUsername);
  const isGroup = t.isGroup ?? others.length >= 2;
  const name =
    isGroup && t.groupName
      ? t.groupName
      : threadDisplayName(t.participants, currentUsername);
  const params = new URLSearchParams();
  params.set("n", name);
  params.set("t", t.topicId);
  const addr = others[0]?.address;
  if (addr && !isGroup) params.set("a", addr);
  if (isGroup) params.set("g", "1");
  return `/chat/${t.id}?${params.toString()}`;
}

/**
 * Mentions inbox (native: the @ inbox) — a bottom sheet listing messages where
 * you were @mentioned, newest first. Tapping a row deep-links into the chat.
 */
export function MentionsSheet({ onClose }: { onClose: () => void }) {
  const { data: me } = useSession();
  const { data: items, isLoading } = useMentionsInbox(true);
  const { data: chats } = useChatThreads();

  const threadMap = useMemo(() => {
    const m = new Map<string, ThreadListItem>();
    for (const t of chats ?? []) m.set(t.id, t);
    return m;
  }, [chats]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
    >
      <div
        className="slide-up flex max-h-[75vh] w-full max-w-md flex-col rounded-t-2xl border border-line-strong bg-surface-2 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="flex items-center gap-2 text-body font-bold text-ink-strong">
            <AtSign className="h-5 w-5 text-accent" />
            Mentions
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-faint hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-subhead text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : !items?.length ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-subhead text-muted">
              <AtSign className="h-8 w-8 text-faint" />
              <p>No mentions yet.</p>
              <p className="text-footnote text-faint">
                When someone @mentions you in a chat, it shows up here.
              </p>
            </div>
          ) : (
            items.map(({ message, threadId }) => {
              const t = threadId ? threadMap.get(threadId) : undefined;
              const href = t
                ? chatHref(t, me?.username)
                : threadId
                  ? `/chat/${threadId}`
                  : "#";
              return (
                <Link
                  key={message.id}
                  href={href}
                  onClick={onClose}
                  className="flex items-start gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-surface-3"
                >
                  <UserAvatar
                    name={message.from.name}
                    address={message.from.address}
                    isEmail={false}
                    size={40}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-subhead font-semibold text-ink-strong">
                        {message.from.name}
                      </span>
                      <span className="ml-auto shrink-0 text-caption text-faint">
                        {threadTime(message.date)}
                      </span>
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-subhead text-ink">
                      <MentionText
                        text={message.text ?? ""}
                        mentions={message.mentions}
                      />
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
