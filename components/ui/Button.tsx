"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "accent" | "email" | "chat" | "neutral" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANT: Record<Variant, string> = {
  accent: "bg-accent text-white hover:opacity-90",
  email: "bg-email text-white hover:opacity-90",
  chat: "bg-chat text-white hover:opacity-90",
  neutral: "bg-surface-2 text-ink hover:bg-surface-3",
  ghost: "text-muted hover:bg-surface hover:text-ink",
  danger: "border border-accent/40 text-accent hover:bg-accent/10",
};

const SIZE: Record<Size, string> = {
  sm: "h-9 px-4 text-footnote",
  md: "h-[42px] px-5 text-subhead",
};

type ButtonProps = {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  href?: string;
  className?: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  variant = "neutral",
  size = "md",
  loading = false,
  leftIcon,
  href,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const cls = cn(
    "inline-flex items-center justify-center gap-2 rounded-pill font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    VARIANT[variant],
    SIZE[size],
    className,
  );
  const inner = (
    <>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : leftIcon}
      {children}
    </>
  );
  // Link variant (navigation): used for "Back"/CTA links.
  if (href && !disabled && !loading) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button className={cls} disabled={disabled || loading} {...rest}>
      {inner}
    </button>
  );
}
