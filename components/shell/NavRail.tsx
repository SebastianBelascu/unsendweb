"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inbox, Mail, MessageCircle, Phone, Settings, Users } from "lucide-react";
import { NAV_SECTIONS, type NavSection } from "@/lib/inbox-view";
import { useSession } from "@/lib/api/account";
import { useNavBadges } from "@/lib/nav-badges";
import { useRealtime } from "@/lib/realtime/store";
import { selfAvatarUrl } from "@/lib/avatar-url";
import { Avatar } from "@/components/mail/Avatar";
import { NavBadge } from "./NavBadge";
import { cn } from "@/lib/utils";

const ICONS: Record<NavSection, typeof MessageCircle> = {
  all: Inbox,
  chats: MessageCircle,
  emails: Mail,
  calls: Phone,
  contacts: Users,
};

/**
 * WhatsApp-style vertical icon rail (desktop only). Switches the list pane's
 * section; Settings + profile sit at the bottom. On mobile this is replaced by
 * the BottomTabBar.
 */
export function NavRail({
  section,
  onSection,
}: {
  section: NavSection;
  onSection: (s: NavSection) => void;
}) {
  const pathname = usePathname();
  const isSettings = pathname.startsWith("/settings");
  const { data: me } = useSession();
  const ownVersion = useRealtime((s) =>
    me?.username ? s.avatarVersions[me.username.toLowerCase()] : undefined,
  );
  const ownPhoto = selfAvatarUrl(me?.username, ownVersion);
  const badges = useNavBadges();

  return (
    <nav className="hidden w-16 shrink-0 flex-col items-center gap-1 border-r border-line bg-surface py-3 lg:flex">
      {NAV_SECTIONS.map((s) => {
        const Icon = ICONS[s.key];
        const active = !isSettings && section === s.key;
        return (
          <button
            key={s.key}
            type="button"
            title={s.label}
            aria-label={s.label}
            onClick={() => onSection(s.key)}
            className={cn(
              "relative flex h-11 w-11 items-center justify-center rounded-2xl transition-colors",
              active
                ? "bg-accent/15 text-accent"
                : "text-faint hover:bg-surface-2 hover:text-ink",
            )}
          >
            <Icon className="h-[22px] w-[22px]" />
            <NavBadge count={badges[s.key]} className="absolute right-1 top-1" />
          </button>
        );
      })}

      <div className="mt-auto flex flex-col items-center gap-2">
        <Link
          href="/settings"
          title="Settings"
          aria-label="Settings"
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-2xl transition-colors",
            isSettings
              ? "bg-accent/15 text-accent"
              : "text-faint hover:bg-surface-2 hover:text-ink",
          )}
        >
          <Settings className="h-[22px] w-[22px]" />
        </Link>
        <Link href="/settings" title="Profile" aria-label="Profile" className="rounded-full">
          <Avatar
            name={me?.username ?? "You"}
            seed={me?.username ?? "You"}
            imageUrl={ownPhoto}
            isEmail={false}
            size={36}
            showBadge={false}
          />
        </Link>
      </div>
    </nav>
  );
}
