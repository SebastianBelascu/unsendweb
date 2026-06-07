"use client";

import { useIsFetching } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { Loader2, WifiOff } from "lucide-react";

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

/** Small status pill: "Offline" when disconnected, "Syncing…" while fetching. */
export function SyncStatus() {
  const online = useOnline();
  const fetching = useIsFetching();

  if (!online) {
    return (
      <span className="flex items-center gap-1 text-[12px] text-warning">
        <WifiOff className="h-3.5 w-3.5" /> Offline
      </span>
    );
  }
  if (fetching > 0) {
    return (
      <span className="flex items-center gap-1 text-[12px] text-faint">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Syncing…
      </span>
    );
  }
  return null;
}
