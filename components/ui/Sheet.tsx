"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";

type Side = "center" | "bottom" | "right" | "drawer";

/**
 * Lightweight modal/sheet: fixed overlay + backdrop click + ESC to close.
 * `drawer` = bottom sheet on mobile, right-side panel on desktop.
 */
export function Sheet({
  open,
  onClose,
  side = "center",
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  side?: Side;
  className?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const align =
    side === "center"
      ? "items-center justify-center p-4"
      : side === "bottom"
        ? "items-end justify-center"
        : side === "right"
          ? "items-stretch justify-end"
          : "items-end justify-center lg:items-stretch lg:justify-end";

  const panel =
    side === "center"
      ? "w-full max-w-md rounded-card"
      : side === "bottom"
        ? "w-full rounded-t-2xl"
        : side === "right"
          ? "h-full w-full max-w-md"
          : "max-h-[88vh] w-full rounded-t-2xl lg:h-full lg:max-h-none lg:max-w-md lg:rounded-none";

  return (
    <div
      className={cn("fixed inset-0 z-50 flex bg-black/50", align)}
      onClick={onClose}
    >
      <div
        className={cn(
          "flex flex-col overflow-hidden border border-line-strong bg-surface-2 shadow-xl",
          panel,
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
