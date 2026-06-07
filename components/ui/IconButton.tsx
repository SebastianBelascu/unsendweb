"use client";

import { cn } from "@/lib/utils";

type Variant = "ghost" | "surface" | "accent";

const VARIANT: Record<Variant, string> = {
  ghost: "text-muted hover:bg-surface hover:text-ink",
  surface: "bg-surface-2 text-ink hover:bg-surface-3",
  accent: "bg-accent text-white hover:opacity-90",
};

export function IconButton({
  label,
  variant = "ghost",
  size = 40,
  active = false,
  className,
  children,
  ...rest
}: {
  label: string;
  variant?: Variant;
  size?: number;
  active?: boolean;
  className?: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      style={{ width: size, height: size }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50",
        active ? "bg-surface-3 text-ink" : VARIANT[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
