"use client";

import { X } from "lucide-react";
import { Avatar } from "./Avatar";
import type { MailMessage, MailReaction } from "@/lib/types";

/** Bottom sheet listing who reacted, grouped by emoji. Tap your own to remove. */
export function ReactorSheet({
  message,
  myUserId,
  onRemove,
  onClose,
}: {
  message: MailMessage;
  myUserId?: string;
  onRemove: (reactionId: string) => void;
  onClose: () => void;
}) {
  const reactions = message.reactions ?? [];
  const order: string[] = [];
  const groups = new Map<string, MailReaction[]>();
  for (const r of reactions) {
    if (!groups.has(r.emoji)) {
      groups.set(r.emoji, []);
      order.push(r.emoji);
    }
    groups.get(r.emoji)!.push(r);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[70vh] w-full max-w-md flex-col rounded-t-2xl border border-line-strong bg-surface-2 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="text-body font-bold text-ink-strong">
            Reactions · {reactions.length}
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
          {order.map((emoji) => (
            <div key={emoji} className="mb-1">
              <div className="px-2 py-1 text-footnote text-faint">
                {emoji} {groups.get(emoji)!.length}
              </div>
              {groups.get(emoji)!.map((r) => {
                const mine = Boolean(r.byUserId && r.byUserId === myUserId);
                return (
                  <button
                    key={r.id}
                    type="button"
                    disabled={!mine}
                    onClick={() => mine && onRemove(r.id)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left enabled:hover:bg-surface-3"
                  >
                    <Avatar
                      name={r.byName ?? "?"}
                      seed={r.byName}
                      isEmail={false}
                      size={32}
                      showBadge={false}
                    />
                    <span className="min-w-0 flex-1 truncate text-subhead text-ink">
                      {r.byName ?? "Someone"}
                      {mine && <span className="text-faint"> (You)</span>}
                    </span>
                    <span className="text-[18px]">{emoji}</span>
                    {mine && (
                      <span className="text-caption font-semibold text-accent">
                        Remove
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
