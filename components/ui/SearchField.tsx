"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function SearchField({
  value,
  onChange,
  placeholder = "Search",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-[42px] w-full rounded-pill border border-line-strong bg-canvas pl-9 pr-9 text-body text-ink-strong outline-none transition-colors placeholder:text-faint focus:border-muted"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
