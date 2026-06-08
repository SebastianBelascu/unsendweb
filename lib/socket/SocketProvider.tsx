"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";
import { useRealtime } from "@/lib/realtime/store";
import { bumpThread } from "@/lib/realtime/threadCache";
import { mapMessage } from "@/lib/api/mappers";
import type { BackendMessage } from "@/lib/api/backend-types";
import type { MailMessage } from "@/lib/types";

type IncomingMessage = BackendMessage & { threadId?: string; topicId?: string };

const WS_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? "";

/*
  Single Socket.IO connection feeding the realtime store:
  - message create/update events → refresh the Query cache (receipts + new msgs)
  - presence:online / presence:offline → online + last-seen state
  - typing / stop-typing → typing state (auto-pruned)
  Requires the backend to read the token from handshake.auth (the fix in
  backend/src/sockets/sockets.service.ts). Until deployed, the socket can't
  authenticate and the app falls back to polling (refetchInterval).
*/
export function SocketProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const setSocket = useRealtime((s) => s.setSocket);
  const setConnected = useRealtime((s) => s.setConnected);
  const setOnline = useRealtime((s) => s.setOnline);
  const addTyping = useRealtime((s) => s.addTyping);
  const removeTyping = useRealtime((s) => s.removeTyping);
  const pruneTyping = useRealtime((s) => s.pruneTyping);
  const setAvatarVersion = useRealtime((s) => s.setAvatarVersion);

  useEffect(() => {
    if (!WS_URL) return;
    let socket: Socket | undefined;
    let cancelled = false;
    let listTimer: ReturnType<typeof setTimeout> | null = null;
    let otherTimer: ReturnType<typeof setTimeout> | null = null;

    // Only for BRAND-NEW threads (not yet in the list). The backend commits the
    // thread's updatedAt *after* emitting the socket event, so this refetch is
    // delayed past that lag to avoid getting stale ordering back.
    const refreshLists = () => {
      if (listTimer) return;
      listTimer = setTimeout(() => {
        listTimer = null;
        qc.invalidateQueries({ queryKey: ["threads"] });
        qc.invalidateQueries({ queryKey: ["chatThreads"] });
      }, 1200);
    };

    // Receipts / reactions / edits → refresh the OPEN thread only. Deliberately
    // does NOT refetch the thread LISTS: a list refetch here would return the
    // backend's not-yet-updated ordering and undo the optimistic bump.
    const refreshOther = () => {
      if (otherTimer) return;
      otherTimer = setTimeout(() => {
        otherTimer = null;
        qc.invalidateQueries({ queryKey: ["messages"] });
      }, 700);
    };

    const previewOf = (msg: IncomingMessage) =>
      msg.reactionText ||
      msg.text ||
      (msg.attachments?.length ? "📎 Attachment" : "");

    // Instant path for the OPEN thread: write the incoming message straight into
    // its cache (zero network) so it appears immediately. The LIST is handled by
    // refreshLists() — a fast, reliable refetch (no fragile optimistic surgery).
    const applyIncoming = (msg: IncomingMessage) => {
      const threadId = msg?.threadId;
      if (!threadId) return;
      let mapped: MailMessage;
      try {
        mapped = mapMessage(msg);
      } catch {
        return;
      }
      qc.setQueryData<MailMessage[]>(["messages", threadId], (old) => {
        if (!old) return old; // only fast-path threads already loaded/open
        if (
          old.some(
            (m) =>
              m.id === mapped.id ||
              (mapped.refId && m.refId === mapped.refId),
          )
        ) {
          return old;
        }
        return [...old, mapped].sort(
          (a, b) => +new Date(a.date) - +new Date(b.date),
        );
      });
    };

    // Receipt / edit on an EXISTING message → patch it in place from the socket
    // payload (mirrors the native app's useMessageUpdates), so read/seen ticks +
    // edits reflect INSTANTLY. The web previously only refetched on these events,
    // which is why "seen" lagged badly while "delivered" (caught by the sender's
    // own post-send refetch) looked fine.
    const applyUpdate = (msg: IncomingMessage) => {
      const threadId = msg?.threadId;
      if (!threadId) return;
      let mapped: MailMessage;
      try {
        mapped = mapMessage(msg);
      } catch {
        return;
      }
      qc.setQueryData<MailMessage[]>(["messages", threadId], (old) => {
        if (!old) return old; // only the open/loaded thread
        let changed = false;
        const next = old.map((m) => {
          const same =
            m.id === mapped.id ||
            (mapped.headerId && m.headerId === mapped.headerId) ||
            (mapped.refId && m.refId === mapped.refId);
          if (!same) return m;
          changed = true;
          // A server update means the message is confirmed — take server truth
          // for receipts/edits and clear any optimistic sending/failed status.
          return { ...m, ...mapped, status: undefined };
        });
        return changed ? next : old;
      });
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
          reconnectionAttempts: Infinity,
          reconnectionDelayMax: 10_000,
        });
        setSocket(socket);

        socket.on("connect", () => setConnected(true));
        socket.on("disconnect", () => setConnected(false));
        socket.on("connect_error", (err: Error) => {
          setConnected(false);
          if (process.env.NODE_ENV !== "production")
            console.debug("[socket] connect_error", err?.message);
        });
        // Another device signed this session out → drop the session locally.
        socket.on("session:invalidate", () => {
          fetch("/api/auth/logout", { method: "POST" })
            .catch(() => {})
            .finally(() => {
              window.location.href = "/login";
            });
        });
        socket.on("presence:online", (d: { username?: string }) => {
          if (d?.username) setOnline(d.username, true);
        });
        socket.on(
          "presence:offline",
          (d: { username?: string; lastSeenAt?: string }) => {
            if (d?.username) setOnline(d.username, false, d.lastSeenAt);
          },
        );
        socket.on(
          "typing",
          (d: { channel?: string; userId?: string; name?: string }) => {
            if (d?.channel && d?.userId && d?.name)
              addTyping(d.channel, d.userId, d.name);
          },
        );
        socket.on(
          "stop-typing",
          (d: { channel?: string; userId?: string }) => {
            if (d?.channel && d?.userId) removeTyping(d.channel, d.userId);
          },
        );
        // A user changed their avatar → bump their cache-busting version.
        socket.on(
          "user-avatar-updated",
          (d: { username?: string; version?: number }) => {
            if (d?.username && d?.version) setAvatarVersion(d.username, d.version);
          },
        );
        // New message → open thread + list reorder instantly (optimistic). Only
        // a brand-new conversation (not in the list) needs the delayed refetch.
        socket.on("create", (msg: IncomingMessage) => {
          // Reaction reply-messages (isHidden) never enter the thread; they only
          // update the list preview (like a native reaction notification). But
          // they DO mean an existing message's reactions changed, so refresh the
          // open thread to land the chip on its bubble.
          if (msg.isHidden) refreshOther();
          else applyIncoming(msg);
          const found = bumpThread(qc, {
            threadId: msg.threadId,
            topicId: msg.topicId,
            preview: previewOf(msg),
            outbound: Boolean(msg.outbound),
          });
          if (!found) refreshLists();
        });
        // Receipts / edits on existing messages → apply the payload instantly
        // (the refetch in onAny stays as a backstop for anything not in cache).
        socket.on("update", applyUpdate);
        // Other server events (receipts, edits, reactions, deletes) → batched.
        socket.onAny((event: string) => {
          if (
            event !== "create" &&
            event !== "typing" &&
            event !== "stop-typing" &&
            event !== "presence:online" &&
            event !== "presence:offline" &&
            event !== "session:invalidate" &&
            event !== "user-avatar-updated" &&
            event !== "pong"
          ) {
            refreshOther();
          }
        });
      } catch {
        // No socket — polling keeps the UI fresh.
      }
    })();

    const prune = setInterval(() => pruneTyping(), 1000);
    // Browsers may suspend a backgrounded socket; reconnect + catch up on focus.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        if (socket && !socket.connected) socket.connect();
        refreshLists();
        refreshOther();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(prune);
      if (listTimer) clearTimeout(listTimer);
      if (otherTimer) clearTimeout(otherTimer);
      document.removeEventListener("visibilitychange", onVisible);
      socket?.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [
    qc,
    setSocket,
    setConnected,
    setOnline,
    addTyping,
    removeTyping,
    pruneTyping,
    setAvatarVersion,
  ]);

  return <>{children}</>;
}
