"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inbox, Mail, MessageCircle, Phone, Settings } from "lucide-react";
import { NAV_SECTIONS, type NavSection } from "@/lib/inbox-view";
import { cn } from "@/lib/utils";

// Compact mobile labels + icons, keyed by section (kept in sync with NAV_SECTIONS).
const META: Record<NavSection, { label: string; icon: typeof MessageCircle }> = {
  all: { label: "All", icon: Inbox },
  chats: { label: "Chats", icon: MessageCircle },
  emails: { label: "Emails", icon: Mail },
  calls: { label: "Calls", icon: Phone },
};

/** Native-style bottom tab bar (mobile only) — mirrors the desktop NavRail. */
export function BottomTabBar({
  section,
  onSection,
}: {
  section: NavSection;
  onSection: (s: NavSection) => void;
}) {
  const pathname = usePathname();
  const isSettings = pathname.startsWith("/settings");

  return (
    <nav className="flex items-stretch border-t border-line bg-surface lg:hidden">
      {NAV_SECTIONS.map((s) => {
        const { label, icon: Icon } = META[s.key];
        const active = !isSettings && section === s.key;
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onSection(s.key)}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-micro font-medium transition-colors",
              active ? "text-accent" : "text-faint",
            )}
          >
            <Icon className="h-5 w-5" />
            {label}
          </button>
        );
      })}
      <Link
        href="/settings"
        className={cn(
          "flex flex-1 flex-col items-center gap-0.5 py-2 text-micro font-medium transition-colors",
          isSettings ? "text-accent" : "text-faint",
        )}
      >
        <Settings className="h-5 w-5" />
        Settings
      </Link>
    </nav>
  );
}
