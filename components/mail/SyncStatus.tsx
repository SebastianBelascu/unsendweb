"use client";

import { useIsFetching } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Loader2, WifiOff } from "lucide-react";
import { useRealtime } from "@/lib/realtime/store";

function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

/**
 * Status pill: "Offline" (no network), "Connecting…" (network up but the
 * realtime socket isn't connected yet), or "Syncing…" while queries are
 * in-flight. Socket state comes from the realtime store.
 */
export function SyncStatus() {
  const online = useOnline();
  const fetching = useIsFetching();
  const socket = useRealtime((s) => s.socket);
  const connected = useRealtime((s) => s.connected);

  // Only surface "Syncing…" for genuinely slow syncs. Realtime + optimistic
  // cache writes keep the UI fresh; brief background reconciliations/polls
  // shouldn't flash the pill (that read as constant churn).
  const isFetching = fetching > 0;
  const [showSync, setShowSync] = useState(false);
  useEffect(() => {
    if (!isFetching) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowSync(false);
      return;
    }
    const t = setTimeout(() => setShowSync(true), 600);
    return () => clearTimeout(t);
  }, [isFetching]);

  if (!online) {
    return (
      <span className="flex items-center gap-1 text-caption text-warning">
        <WifiOff className="h-3.5 w-3.5" /> Offline
      </span>
    );
  }
  // A socket exists (realtime is expected) but hasn't connected yet.
  if (socket && !connected) {
    return (
      <span className="flex items-center gap-1 text-caption text-faint">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Connecting…
      </span>
    );
  }
  if (showSync) {
    return (
      <span className="flex items-center gap-1 text-caption text-faint">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Syncing…
      </span>
    );
  }
  return null;
}
