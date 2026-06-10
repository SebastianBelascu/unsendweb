"use client";

import { format, formatDistanceToNow } from "date-fns";
import { Check, CheckCheck, X } from "lucide-react";
import { UserAvatar } from "./UserAvatar";
import { MAIL_DOMAIN } from "@/lib/identity";
import type { MailMessage, MessageReceipt, ThreadParticipant } from "@/lib/types";

function rel(at?: string): string {
  if (!at) return "";
  try {
    return formatDistanceToNow(new Date(at), { addSuffix: true });
  } catch {
    return "";
  }
}

function HeaderRow({ label, people }: { label: string; people?: ThreadParticipant[] }) {
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

function ReceiptList({
  label,
  items,
}: {
  label: string;
  items?: MessageReceipt[];
}) {
  if (!items || items.length === 0) return null;
  return (
    <div className="py-2.5">
      <div className="mb-1.5 text-micro font-semibold uppercase tracking-wide text-faint">
        {label}
      </div>
      <div className="flex flex-col gap-2">
        {items.map((p, i) => (
          <div key={`${p.username ?? p.name}-${i}`} className="flex items-center gap-2.5">
            <UserAvatar
              name={p.name}
              address={p.username ? `${p.username}${MAIL_DOMAIN}` : undefined}
              size={28}
              isEmail={false}
              showBadge={false}
            />
            <span className="min-w-0 flex-1 truncate text-footnote text-ink">
              {p.name}
            </span>
            {p.at && (
              <span className="shrink-0 text-micro text-faint">{rel(p.at)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Message details. For chat (WhatsApp-style "Message info"): sent time + the
 * "Read by" / "Delivered to" rosters (who saw it, when) — mirrors native
 * MessageInfoModal. For email: the full From/To/Cc/Bcc headers + timestamp.
 */
export function MessageInfoSheet({
  message,
  isEmail,
  isOwn,
  onClose,
}: {
  message: MailMessage;
  isEmail?: boolean;
  isOwn?: boolean;
  onClose: () => void;
}) {
  const readInfo = message.readInfo ?? [];
  const deliveryInfo = message.deliveryInfo ?? [];
  const hasRosters = readInfo.length > 0 || deliveryInfo.length > 0;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
    >
      <div
        className="slide-up w-full max-w-md rounded-t-2xl border border-line-strong bg-surface-2 shadow-xl sm:rounded-2xl"
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

        {isEmail ? (
          <div className="divide-y divide-line/60 px-4 py-2">
            <HeaderRow label="From" people={[message.from]} />
            <HeaderRow label="To" people={message.to} />
            <HeaderRow label="Cc" people={message.cc} />
            <HeaderRow label="Bcc" people={message.bcc} />
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
        ) : (
          <div className="px-4 py-2">
            {/* Sent */}
            <div className="flex items-center gap-2 py-2.5 text-footnote">
              <span className="text-faint">Sent</span>
              <span className="ml-auto text-ink">
                {format(new Date(message.date), "MMM d, h:mm a")}
              </span>
            </div>

            <ReceiptList label="Read by" items={readInfo} />
            <ReceiptList label="Delivered to" items={deliveryInfo} />

            {/* 1:1 / no roster yet → a simple status line for your own message. */}
            {isOwn && !hasRosters && (
              <div className="flex items-center gap-2 border-t border-line/60 py-2.5 text-footnote">
                <span className="text-faint">Status</span>
                <span className="ml-auto flex items-center gap-1.5 text-ink">
                  {message.isRead ? (
                    <>
                      <CheckCheck className="h-4 w-4 text-link" /> Read
                    </>
                  ) : message.isDelivered ? (
                    <>
                      <CheckCheck className="h-4 w-4" /> Delivered
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" /> Sent
                    </>
                  )}
                </span>
              </div>
            )}

            {!isOwn && !hasRosters && (
              <div className="py-2 text-center text-caption text-faint">
                No delivery details for this message.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
