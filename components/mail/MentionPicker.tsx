"use client";

import { AtSign, Megaphone } from "lucide-react";
import { UserAvatar } from "./UserAvatar";
import { MAIL_DOMAIN } from "@/lib/identity";
import type { MentionParticipant } from "@/lib/mentions";
import { cn } from "@/lib/utils";

/*
  Inline @mention autocomplete shown above the composer while typing `@token`.
  Mirrors the native MentionPickerOverlay: an uppercase header (+ the typed
  token chip), a tinted `@everyone` row (groups/email), then participant rows
  with avatar + name + @username. Rows are pre-filtered by the caller so the
  composer and the picker agree on the active index for keyboard nav.
*/
export function MentionPicker({
  query,
  rows,
  showEveryone,
  activeIndex,
  onPick,
  onPickEveryone,
}: {
  query: string;
  rows: MentionParticipant[];
  showEveryone: boolean;
  activeIndex: number;
  onPick: (p: MentionParticipant) => void;
  onPickEveryone: () => void;
}) {
  if (rows.length === 0 && !showEveryone) return null;
  const baseForRows = showEveryone ? 1 : 0;

  return (
    <div className="pop-in mx-3 mb-2 overflow-hidden rounded-2xl border border-line-strong bg-surface-2 shadow-xl">
      <div className="flex items-center gap-1.5 px-3.5 pb-1.5 pt-2.5">
        <AtSign className="h-3 w-3 text-faint" />
        <span className="text-micro font-bold uppercase tracking-wide text-faint">
          {query ? "Matches" : "Mention someone"}
        </span>
        {query && (
          <span className="ml-auto rounded-full bg-accent/20 px-2 py-0.5 text-micro font-semibold text-accent">
            @{query}
          </span>
        )}
      </div>

      {showEveryone && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onPickEveryone}
          className={cn(
            "flex w-full items-center gap-3 px-3.5 py-2 text-left transition-colors hover:bg-surface-3",
            activeIndex === 0 && "bg-surface-3",
          )}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-white">
            <Megaphone className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <div className="text-footnote font-semibold text-ink">Everyone</div>
            <div className="truncate text-micro text-faint">
              Notify everyone in this thread
            </div>
          </span>
          <span className="ml-auto rounded-full bg-accent/20 px-2 py-0.5 text-micro font-semibold text-accent">
            @everyone
          </span>
        </button>
      )}

      {rows.map((p, i) => {
        const name = p.name.trim() || `@${p.username}`;
        return (
          <button
            key={p.username}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(p)}
            className={cn(
              "flex w-full items-center gap-3 px-3.5 py-2 text-left transition-colors hover:bg-surface-3",
              activeIndex === baseForRows + i && "bg-surface-3",
            )}
          >
            <UserAvatar
              name={name}
              address={`${p.username}${MAIL_DOMAIN}`}
              size={32}
              isEmail={false}
              showBadge={false}
            />
            <span className="min-w-0">
              <div className="truncate text-footnote font-semibold text-ink">
                {name}
              </div>
              {p.name.trim() && (
                <div className="truncate text-micro text-faint">
                  @{p.username}
                </div>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
