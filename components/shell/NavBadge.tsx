import { cn } from "@/lib/utils";

/**
 * iOS-style unread count bubble for the nav icons — solid accent (red) pill with
 * a white count, ringed in the bar's background so it reads as a floating badge.
 * Renders nothing when the count is zero. Caps the display at 99+.
 */
export function NavBadge({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "pointer-events-none flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-white ring-2 ring-surface",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
