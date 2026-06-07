"use client";

import { usePathname } from "next/navigation";
import { MailInbox } from "@/components/mail/MailInbox";
import { cn } from "@/lib/utils";
import { isMailFilter, type MailFilter } from "@/lib/types";

/**
 * Desktop master/detail for the mail surface: the thread list lives here (left),
 * the page renders into the right pane (placeholder, reading view, or composer).
 * On mobile it collapses to a single pane (list, or detail when one is open).
 */
export default function MailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const seg = pathname.split("/")[2] ?? "";
  const emailOnly = seg === "emails";
  const filter: MailFilter = isMailFilter(seg) ? seg : "inbox";
  const detailOpen = seg === "thread" || seg === "compose";

  return (
    <div className="flex h-full min-h-0">
      <div
        className={cn(
          "min-h-0 w-full flex-col border-line lg:flex lg:w-[400px] lg:border-r",
          detailOpen ? "hidden lg:flex" : "flex",
        )}
      >
        <MailInbox filter={filter} emailOnly={emailOnly} />
      </div>
      <div
        className={cn(
          "min-h-0 min-w-0 flex-1",
          detailOpen ? "flex flex-col" : "hidden lg:flex lg:flex-col",
        )}
      >
        {children}
      </div>
    </div>
  );
}
