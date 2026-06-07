"use client";

import { format } from "date-fns";
import { X } from "lucide-react";
import type { MailMessage, ThreadParticipant } from "@/lib/types";

function Row({ label, people }: { label: string; people?: ThreadParticipant[] }) {
  if (!people || people.length === 0) return null;
  return (
    <div className="flex gap-2 py-1.5 text-footnote">
      <span className="w-12 shrink-0 text-faint">{label}</span>
      <span className="min-w-0 flex-1 text-ink">
        {people
          .map((p) => (p.address ? `${p.name} <${p.address}>` : p.name))
          .join(", ")}
      </span>
    </div>
  );
}

/** Email message details: full From/To/Cc/Bcc headers + timestamp + flags. */
export function MessageInfoSheet({
  message,
  onClose,
}: {
  message: MailMessage;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl border border-line-strong bg-surface-2 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="text-body font-bold text-ink-strong">Message info</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-faint hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="divide-y divide-line/60 px-4 py-2">
          <Row label="From" people={[message.from]} />
          <Row label="To" people={message.to} />
          <Row label="Cc" people={message.cc} />
          <Row label="Bcc" people={message.bcc} />
          <div className="flex gap-2 py-1.5 text-footnote">
            <span className="w-12 shrink-0 text-faint">Date</span>
            <span className="min-w-0 flex-1 text-ink">
              {format(new Date(message.date), "PPpp")}
            </span>
          </div>
          {(message.forwarded || message.isPrivate) && (
            <div className="flex gap-2 py-1.5 text-footnote">
              <span className="w-12 shrink-0 text-faint">Flags</span>
              <span className="min-w-0 flex-1 text-ink">
                {[
                  message.forwarded ? "Forwarded" : null,
                  message.isPrivate ? "Private" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
