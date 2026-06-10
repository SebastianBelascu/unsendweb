"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Avatar } from "./Avatar";
import { cn } from "@/lib/utils";
import type { MailMessage, MailReaction } from "@/lib/types";

/**
 * Bottom sheet listing who reacted — with "All" + per-emoji tabs (native
 * ReactionListBottomSheet). Tap your own reaction to remove it.
 */
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

  const [tab, setTab] = useState<string>("all");
  const shown = tab === "all" ? reactions : groups.get(tab) ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
    >
      <div
        className="slide-up flex max-h-[70vh] w-full max-w-md flex-col rounded-t-2xl border border-line-strong bg-surface-2 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="text-body font-bold text-ink-strong">Reactions</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-faint hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs: All + per-emoji */}
        <div className="flex gap-1.5 overflow-x-auto border-b border-line px-3 py-2">
          <Tab active={tab === "all"} onClick={() => setTab("all")}>
            All {reactions.length}
          </Tab>
          {order.map((emoji) => (
            <Tab key={emoji} active={tab === emoji} onClick={() => setTab(emoji)}>
              {emoji} {groups.get(emoji)!.length}
            </Tab>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {shown.map((r) => {
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
                <span className="text-[18px]">{r.emoji}</span>
                {mine && (
                  <span className="text-caption font-semibold text-accent">
                    Remove
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-footnote font-semibold transition-colors",
        active
          ? "bg-accent/15 text-accent"
          : "text-faint hover:bg-surface-3 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
