"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePinnedThreads, useThreadsInfinite } from "@/lib/api/threads";
import { useSession } from "@/lib/api/account";
import { threadHref } from "@/lib/thread-href";

/**
 * On desktop, the detail pane should never sit empty — open the most recent
 * conversation automatically. Mobile keeps the list focused (no auto-open).
 * Rendered by the /inbox page (the empty right pane); redirects once threads
 * are available.
 */
export function AutoOpenLatest() {
  const router = useRouter();
  const { data: me } = useSession();
  const { data } = useThreadsInfinite("inbox");
  const { data: pinned } = usePinnedThreads();

  useEffect(() => {
    if (typeof window === "undefined" || !me) return;
    if (!window.matchMedia("(min-width: 1024px)").matches) return; // desktop only
    const items = data?.pages.flatMap((p) => p.items) ?? [];
    const all = [...(pinned ?? []), ...items];
    if (!all.length) return;
    const latest = all.reduce((a, b) =>
      +new Date(b.updatedAt) > +new Date(a.updatedAt) ? b : a,
    );
    router.replace(threadHref(latest, me?.username));
  }, [data, pinned, me, router]);

  return null;
}
