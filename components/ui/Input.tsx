"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Input({
  leadingIcon,
  trailingSlot,
  className,
  ...rest
}: {
  leadingIcon?: ReactNode;
  trailingSlot?: ReactNode;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const input = (
    <input
      className={cn(
        "h-[42px] w-full rounded-input border border-line-strong bg-canvas px-3 text-body text-ink-strong outline-none transition-colors placeholder:text-faint focus:border-muted",
        leadingIcon && "pl-9",
        trailingSlot && "pr-10",
        className,
      )}
      {...rest}
    />
  );
  if (!leadingIcon && !trailingSlot) return input;
  return (
    <div className="relative">
      {leadingIcon && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint">
          {leadingIcon}
        </span>
      )}
      {input}
      {trailingSlot && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2">
          {trailingSlot}
        </span>
      )}
    </div>
  );
}
