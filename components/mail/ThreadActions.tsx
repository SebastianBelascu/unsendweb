"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type InfiniteData, useQueryClient } from "@tanstack/react-query";
import {
  BellOff,
  Bookmark,
  MoreHorizontal,
  Pin,
  RotateCcw,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { type ThreadsPage, useThreadAction } from "@/lib/api/threads";
import type { MailFilter, ThreadListItem } from "@/lib/types";

const MAX_PINS = 4;

interface ActionItem {
  label: string;
  icon: typeof Bookmark;
  updateType: string;
  update: boolean;
}

function actionsFor(thread: ThreadListItem, filter: MailFilter): ActionItem[] {
  if (filter === "deleted") {
    return [
      { label: "Restore", icon: RotateCcw, updateType: "isDeleted", update: false },
    ];
  }
  if (filter === "spam") {
    return [
      { label: "Not spam", icon: ShieldAlert, updateType: "isSpam", update: false },
      { label: "Delete", icon: Trash2, updateType: "isDeleted", update: true },
    ];
  }
  const items: ActionItem[] = [];
  // Pin is chat-only (matches native); bookmark + spam are email-only.
  if (!thread.isEmail) {
    items.push({
      label: thread.isPinned ? "Unpin" : "Pin",
      icon: Pin,
      updateType: "isPinned",
      update: !thread.isPinned,
    });
  } else {
    items.push({
      label: thread.isBookmarked ? "Remove bookmark" : "Bookmark",
      icon: Bookmark,
      updateType: "isBookmarked",
      update: !thread.isBookmarked,
    });
  }
  items.push({
    label: thread.isSilent ? "Unmute" : "Mute",
    icon: BellOff,
    updateType: "isSilent",
    update: !thread.isSilent,
  });
  if (thread.isEmail) {
    items.push({
      label: "Mark as spam",
      icon: ShieldAlert,
      updateType: "isSpam",
      update: true,
    });
  }
  items.push({ label: "Delete", icon: Trash2, updateType: "isDeleted", update: true });
  return items;
}

export function ThreadActions({
  thread,
  filter,
}: {
  thread: ThreadListItem;
  filter: MailFilter;
}) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const qc = useQueryClient();
  const action = useThreadAction(filter);
  const items = actionsFor(thread, filter);

  // Close on scroll/resize — the menu is fixed-positioned, so it would
  // otherwise drift away from its row.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      // Estimate menu height to flip upward when there's no room below.
      const estimated = items.length * 38 + 16;
      const below = window.innerHeight - r.bottom;
      const top = below < estimated ? r.top - estimated - 4 : r.bottom + 4;
      setPos({ top: Math.max(8, top), right: window.innerWidth - r.right });
    }
    setNotice(null);
    setOpen(true);
  }

  function countPinned(): number {
    const data = qc.getQueryData<InfiniteData<ThreadsPage>>(["threads", filter]);
    if (!data) return 0;
    return data.pages.reduce(
      (n, p) => n + p.items.filter((t) => t.isPinned).length,
      0,
    );
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggle();
        }}
        className="rounded-md bg-surface/80 p-1.5 text-faint backdrop-blur hover:bg-surface-3 hover:text-ink"
        aria-label="Thread actions"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open &&
        pos &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[60]"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
              }}
            />
            <div
              className="fixed z-[61] w-48 overflow-hidden rounded-xl border border-line-strong bg-surface-2 py-1 shadow-2xl"
              style={{ top: pos.top, right: pos.right }}
              onClick={(e) => e.stopPropagation()}
            >
              {items.map((it) => {
                const Icon = it.icon;
                return (
                  <button
                    key={it.label}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (
                        it.updateType === "isPinned" &&
                        it.update &&
                        countPinned() >= MAX_PINS
                      ) {
                        setNotice(`You can pin up to ${MAX_PINS} chats.`);
                        return;
                      }
                      action.mutate({
                        id: thread.id,
                        updateType: it.updateType,
                        update: it.update,
                      });
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-footnote text-ink hover:bg-surface-3"
                  >
                    <Icon className="h-4 w-4 text-faint" />
                    {it.label}
                  </button>
                );
              })}
              {notice && (
                <p className="border-t border-line px-3 py-2 text-caption text-faint">
                  {notice}
                </p>
              )}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
