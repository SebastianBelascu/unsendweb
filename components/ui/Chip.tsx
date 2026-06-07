"use client";

import { cn } from "@/lib/utils";

export function Chip({
  active = false,
  count,
  onClick,
  className,
  children,
}: {
  active?: boolean;
  count?: number;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-pill px-3 py-1.5 text-footnote font-semibold transition-colors",
        active
          ? "bg-surface-3 text-ink-strong"
          : "bg-surface-2 text-muted hover:text-ink",
        className,
      )}
    >
      {children}
      {count != null && count > 0 && (
        <span
          className={cn(
            "rounded-full px-1.5 text-micro",
            active ? "bg-canvas/40 text-ink" : "text-faint",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
