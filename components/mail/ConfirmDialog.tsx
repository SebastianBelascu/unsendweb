"use client";

import { cn } from "@/lib/utils";

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-line-strong bg-surface-2 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-callout font-bold text-ink-strong">{title}</h3>
        {body && <p className="mt-1.5 text-subhead text-muted">{body}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full bg-surface-3 px-4 py-2 text-footnote font-semibold text-ink hover:opacity-90"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={cn(
              "rounded-full px-4 py-2 text-footnote font-semibold text-white hover:opacity-90",
              danger ? "bg-accent" : "bg-email",
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
