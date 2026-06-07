"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ConversationListPane } from "./ConversationListPane";
import { NavRail } from "./NavRail";
import { BottomTabBar } from "./BottomTabBar";
import {
  normalizeFilter,
  normalizeSection,
  type InboxFilter,
  type NavSection,
} from "@/lib/inbox-view";
import { cn } from "@/lib/utils";

/**
 * iMessage/WhatsApp-style shell: a left icon rail (NavRail) selects the section,
 * the conversation list lives in the middle pane (persists across navigations),
 * and the routed page is the detail pane. `section` (rail) + `filter` (chips)
 * are lifted here so the rail, list, and mobile tab bar share them. Settings
 * renders full-width (no list) but keeps the rail.
 */
export function InboxShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [section, setSection] = useState<NavSection>(() =>
    normalizeSection(searchParams.get("section")),
  );
  const [filter, setFilter] = useState<InboxFilter>(() =>
    normalizeFilter(searchParams.get("filter")),
  );

  const inThread =
    /^\/(?:chat|mail\/thread)\//.test(pathname) ||
    pathname.startsWith("/mail/compose");
  const isSettings = pathname.startsWith("/settings");
  const showList = !isSettings;
  const activeId = pathname.match(/^\/(?:chat|mail\/thread)\/([^/?]+)/)?.[1];
  const showBottomTabs = !inThread;

  // Switching section always surfaces the list (leaving settings / a thread).
  function goSection(s: NavSection) {
    setSection(s);
    if (pathname !== "/inbox") router.push("/inbox");
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1">
        <NavRail section={section} onSection={goSection} />
        {showList && (
          <div
            className={cn(
              "min-h-0 w-full flex-col border-line lg:flex lg:w-[400px] lg:border-r xl:w-[440px]",
              inThread ? "hidden lg:flex" : "flex",
            )}
          >
            <ConversationListPane
              section={section}
              filter={filter}
              onFilter={setFilter}
              activeId={activeId}
            />
          </div>
        )}
        <main
          className={cn(
            "min-h-0 min-w-0 flex-1 flex-col",
            !showList ? "flex" : inThread ? "flex" : "hidden lg:flex",
          )}
        >
          {children}
        </main>
      </div>
      {showBottomTabs && <BottomTabBar section={section} onSection={goSection} />}
    </div>
  );
}
