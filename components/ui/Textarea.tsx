"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/** Auto-growing textarea (caps at maxHeight, then scrolls). */
export function Textarea({
  value,
  className,
  minRows = 1,
  maxHeight = 160,
  ...rest
}: {
  minRows?: number;
  maxHeight?: number;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [value, maxHeight]);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={minRows}
      className={cn(
        "w-full resize-none bg-transparent text-body leading-relaxed text-ink-strong outline-none placeholder:text-faint",
        className,
      )}
      {...rest}
    />
  );
}
