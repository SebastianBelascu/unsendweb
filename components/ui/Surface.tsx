import { cn } from "@/lib/utils";

/** Opaque card/section surface — replaces faint `bg-surface/40` usages. */
export function Surface({
  as: As = "div",
  padded = false,
  className,
  children,
  ...rest
}: {
  as?: React.ElementType;
  padded?: boolean;
  className?: string;
  children?: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <As
      className={cn(
        "rounded-card border border-line bg-surface-card",
        padded && "p-5",
        className,
      )}
      {...rest}
    >
      {children}
    </As>
  );
}
