import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRealtime } from "./store";
import { seedPresence } from "../api/presence";

/**
 * Seed (REST) + subscribe (socket) presence for the given usernames.
 * Re-runs on reconnect. Presence state lands in the realtime store.
 */
export function usePresenceFor(usernames: string[]) {
  const socket = useRealtime((s) => s.socket);
  const connected = useRealtime((s) => s.connected);
  const mergeSeed = useRealtime((s) => s.mergeSeed);

  const key = useMemo(
    () =>
      [...new Set(usernames.filter(Boolean).map((u) => u.toLowerCase()))]
        .sort()
        .join(","),
    [usernames],
  );

  useEffect(() => {
    const list = key ? key.split(",") : [];
    if (!list.length) return;
    seedPresence(list)
      .then((r) => mergeSeed(r.online ?? [], r.lastSeen ?? {}))
      .catch(() => {});
    if (connected && socket) {
      socket.emit("presence:subscribe", { usernames: list });
      return () => {
        socket.emit("presence:unsubscribe", { usernames: list });
      };
    }
  }, [key, connected, socket, mergeSeed]);
}

export function useOnline(username?: string): boolean {
  return useRealtime((s) =>
    username ? Boolean(s.online[username.toLowerCase()]) : false,
  );
}

export function useLastSeen(username?: string): string | undefined {
  return useRealtime((s) =>
    username ? s.lastSeen[username.toLowerCase()] : undefined,
  );
}

/**
 * Active typing display names for a topic. Expired entries are dropped by the
 * 1s pruneTyping sweep in SocketProvider, so the selector stays pure here.
 */
export function useTyping(topicId?: string): string[] {
  const map = useRealtime((s) => (topicId ? s.typing[topicId] : undefined));
  return useMemo(
    () => (map ? Object.values(map).map((p) => p.name) : []),
    [map],
  );
}

/** Returns an emitter to call as the user types (throttled), matching native. */
export function useEmitTyping(topicId?: string) {
  const socket = useRealtime((s) => s.socket);
  const lastEmit = useRef(0);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  return useCallback(
    (isTyping: boolean) => {
      if (!socket || !topicId) return;
      if (stopTimer.current) clearTimeout(stopTimer.current);
      if (isTyping) {
        const now = Date.now();
        if (now - lastEmit.current > 500) {
          socket.emit("typing", { channel: topicId, event: "typing" });
          lastEmit.current = now;
        }
        stopTimer.current = setTimeout(() => {
          socket.emit("typing", { channel: topicId, event: "stop-typing" });
          lastEmit.current = 0;
        }, 2000);
      } else {
        socket.emit("typing", { channel: topicId, event: "stop-typing" });
        lastEmit.current = 0;
      }
    },
    [socket, topicId],
  );
}
