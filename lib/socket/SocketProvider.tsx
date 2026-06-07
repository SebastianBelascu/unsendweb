"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";

const WS_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? "";

/*
  Connects a single Socket.IO client and refreshes the TanStack Query cache on
  any inbound event. Using onAny() sidesteps the gateway's dynamic-event-name
  quirk (room name == event name) — any server event simply triggers a refetch.
  Requires the backend to read the token from handshake.auth (see the fix in
  backend/src/sockets/sockets.service.ts). Until that is deployed, the socket
  fails to authenticate and the app falls back to polling (refetchInterval).
  See context/03-websocket-events.md + context/10-state-and-realtime.md.
*/
export function SocketProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!WS_URL) return;

    let socket: Socket | undefined;
    let cancelled = false;
    let last = 0;

    const refresh = () => {
      const now = Date.now();
      if (now - last < 1500) return; // light throttle against event storms
      last = now;
      qc.invalidateQueries({ queryKey: ["threads"] });
      qc.invalidateQueries({ queryKey: ["chatThreads"] });
      qc.invalidateQueries({ queryKey: ["messages"] });
    };

    (async () => {
      try {
        const res = await fetch("/api/auth/socket-token");
        if (!res.ok) return;
        const { token } = (await res.json()) as { token?: string };
        if (!token || cancelled) return;

        socket = io(WS_URL, {
          transports: ["websocket"],
          auth: { token },
          reconnectionAttempts: 5,
        });
        socket.onAny(() => refresh());
      } catch {
        // No socket — polling keeps the UI fresh.
      }
    })();

    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, [qc]);

  return <>{children}</>;
}
