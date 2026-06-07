import { cn } from "@/lib/utils";

type Tone = "accent" | "chat" | "email" | "neutral";

const DOT: Record<Tone, string> = {
  accent: "bg-accent",
  chat: "bg-chat-light",
  email: "bg-email",
  neutral: "bg-muted",
};

const PILL: Record<Tone, string> = {
  accent: "bg-accent/15 text-accent",
  chat: "bg-chat/20 text-chat-light",
  email: "bg-email/15 text-email-light",
  neutral: "bg-surface-3 text-muted",
};

export function Badge({
  tone = "accent",
  dot = false,
  className,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  if (dot) {
    return (
      <span
        className={cn("inline-block h-2.5 w-2.5 rounded-full", DOT[tone], className)}
      />
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-micro font-semibold",
        PILL[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
