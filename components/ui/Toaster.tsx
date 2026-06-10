"use client";

import { useToastStore } from "@/lib/toast";
import { cn } from "@/lib/utils";

/** Renders the single transient toast (slide-fade up, tap to dismiss). */
export function Toaster() {
  const current = useToastStore((s) => s.current);
  const dismiss = useToastStore((s) => s.dismiss);
  if (!current) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(1.75rem,env(safe-area-inset-bottom))] z-[300] flex justify-center px-4">
      <button
        key={current.id}
        type="button"
        onClick={dismiss}
        style={{ animation: "toastIn 0.22s ease-out" }}
        className={cn(
          "pointer-events-auto max-w-[90vw] truncate rounded-full px-4 py-2.5 text-footnote font-medium shadow-2xl",
          current.tone === "error"
            ? "bg-accent text-white"
            : "border border-line-strong bg-surface-2 text-ink-strong",
        )}
      >
        {current.message}
      </button>
    </div>
  );
}
