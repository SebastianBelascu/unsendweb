"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bookmark,
  Inbox,
  Mail,
  MessageCircle,
  Settings,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MAIL_FILTERS } from "@/lib/types";

const FOLDER_ICONS: Record<string, typeof Inbox> = {
  inbox: Inbox,
  bookmarks: Bookmark,
  spam: ShieldAlert,
  deleted: Trash2,
};

function NavItem({
  href,
  active,
  icon: Icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: typeof Inbox;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] transition-colors",
        active
          ? "bg-surface-3 font-semibold text-ink-strong"
          : "text-muted hover:bg-surface hover:text-ink",
      )}
    >
      <Icon className="h-[18px] w-[18px]" />
      {children}
    </Link>
  );
}

export function MailSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-surface/40">
      <div className="px-5 py-5">
        <span className="text-[20px] font-bold lowercase tracking-tight text-ink-strong">
          unsend
        </span>
      </div>

      <nav className="flex flex-col gap-0.5 px-2">
        <p className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-faint">
          Mail
        </p>
        <NavItem href="/mail/inbox" active={pathname === "/mail/inbox"} icon={Inbox}>
          Inbox
        </NavItem>
        <NavItem href="/mail/emails" active={pathname === "/mail/emails"} icon={Mail}>
          Emails
        </NavItem>
        {MAIL_FILTERS.filter((f) => f.key !== "inbox").map(({ key, label }) => (
          <NavItem
            key={key}
            href={`/mail/${key}`}
            active={pathname === `/mail/${key}`}
            icon={FOLDER_ICONS[key] ?? Inbox}
          >
            {label}
          </NavItem>
        ))}

        <p className="mt-3 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-faint">
          Chat
        </p>
        <NavItem
          href="/chat"
          active={pathname.startsWith("/chat")}
          icon={MessageCircle}
        >
          Chats
        </NavItem>
      </nav>

      <div className="mt-auto flex flex-col gap-0.5 px-2 pb-4">
        <NavItem
          href="/settings"
          active={pathname.startsWith("/settings")}
          icon={Settings}
        >
          Settings
        </NavItem>
      </div>
    </aside>
  );
}
