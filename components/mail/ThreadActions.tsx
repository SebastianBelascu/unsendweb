"use client";

import { useState } from "react";
import {
  BellOff,
  Bookmark,
  MoreHorizontal,
  Pin,
  RotateCcw,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useThreadAction } from "@/lib/api/threads";
import type { MailFilter, ThreadListItem } from "@/lib/types";

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
  return [
    {
      label: thread.isBookmarked ? "Remove bookmark" : "Bookmark",
      icon: Bookmark,
      updateType: "isBookmarked",
      update: !thread.isBookmarked,
    },
    {
      label: thread.isPinned ? "Unpin" : "Pin",
      icon: Pin,
      updateType: "isPinned",
      update: !thread.isPinned,
    },
    {
      label: thread.isSilent ? "Unmute" : "Mute",
      icon: BellOff,
      updateType: "isSilent",
      update: !thread.isSilent,
    },
    { label: "Mark as spam", icon: ShieldAlert, updateType: "isSpam", update: true },
    { label: "Delete", icon: Trash2, updateType: "isDeleted", update: true },
  ];
}

export function ThreadActions({
  thread,
  filter,
}: {
  thread: ThreadListItem;
  filter: MailFilter;
}) {
  const [open, setOpen] = useState(false);
  const action = useThreadAction(filter);
  const items = actionsFor(thread, filter);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="rounded-md bg-surface/80 p-1.5 text-faint backdrop-blur hover:bg-surface-3 hover:text-ink"
        aria-label="Thread actions"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-line-strong bg-surface-2 py-1 shadow-lg">
            {items.map((it) => {
              const Icon = it.icon;
              return (
                <button
                  key={it.label}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    action.mutate({
                      id: thread.id,
                      updateType: it.updateType,
                      update: it.update,
                    });
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-ink hover:bg-surface-3"
                >
                  <Icon className="h-4 w-4 text-faint" />
                  {it.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
