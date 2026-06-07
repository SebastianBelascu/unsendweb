"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/api/account";
import { useRealtime } from "@/lib/realtime/store";
import { useCall } from "@/lib/calls/store";
import { agora } from "@/lib/calls/AgoraService";
import { teardown } from "@/lib/calls/controller";
import { IncomingCallModal } from "./IncomingCallModal";
import { CallScreen } from "./CallScreen";

/**
 * Single orchestrator for calls (mounted once in the app layout). Owns the Agora
 * media handlers + the call signaling on the shared socket, and renders the
 * incoming-call ring + the in-call screen from the call store.
 */
export function CallHost() {
  const { data: me } = useSession();
  const callerId = me?.userId;
  const socket = useRealtime((s) => s.socket);
  const incoming = useCall((s) => s.incoming);
  const status = useCall((s) => s.status);
  const qc = useQueryClient();

  // When a call finishes (status → idle), refresh the call history.
  const prevStatus = useRef(status);
  useEffect(() => {
    if (prevStatus.current !== "idle" && status === "idle") {
      qc.invalidateQueries({ queryKey: ["calls", "history"] });
    }
    prevStatus.current = status;
  }, [status, qc]);

  // Call signaling on the shared socket, re-bound when it reconnects. (The Agora
  // media handlers are bound per-call inside the controller, not here.)
  useEffect(() => {
    if (!socket) return;

    const onCreate = (msg: {
      callUUID?: string;
      channelName?: string;
      topicId?: string;
      text?: string;
      from?: { name?: string; address?: string };
    }) => {
      if (!msg?.callUUID || !msg?.channelName) return;
      const st = useCall.getState();
      if (st.status !== "idle" || st.incoming) return; // already busy
      const topicId =
        msg.topicId || msg.channelName.replace(/^call_/, "");
      st.setIncoming({
        uuid: msg.callUUID,
        channelName: msg.channelName,
        topicId,
        isVideo: String(msg.text ?? "").toLowerCase().includes("video"),
        callerName: msg.from?.name || "Unknown",
        callerAddress: msg.from?.address,
      });
      // Tell the caller our device received the invite (caller → ringing).
      socket.emit("call-received", {
        callUUID: msg.callUUID,
        channelName: msg.channelName,
      });
    };

    const onReceived = (d: { callUUID?: string }) => {
      const st = useCall.getState();
      if (st.call && st.call.uuid === d?.callUUID && st.status === "calling") {
        st.setStatus("ringing");
      }
    };

    const onEnded = (d: { callUUID?: string; channelName?: string }) => {
      const st = useCall.getState();
      if (
        st.call &&
        (st.call.uuid === d?.callUUID || st.call.channelName === d?.channelName)
      ) {
        void teardown();
      }
      if (
        st.incoming &&
        (st.incoming.uuid === d?.callUUID ||
          st.incoming.channelName === d?.channelName)
      ) {
        st.setIncoming(null); // caller cancelled before we answered
      }
    };

    socket.on("create", onCreate);
    socket.on("call-received", onReceived);
    socket.on("call-ended", onEnded);
    return () => {
      socket.off("create", onCreate);
      socket.off("call-received", onReceived);
      socket.off("call-ended", onEnded);
    };
  }, [socket, callerId]);

  // Closing the tab ends the call (best-effort, fire-and-forget).
  useEffect(() => {
    const onUnload = () => {
      const { call } = useCall.getState();
      if (call) {
        socket?.emit("end-call", {
          channelName: call.channelName,
          callUUID: call.uuid,
        });
        void agora.leave();
      }
    };
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
  }, [socket]);

  return (
    <>
      {incoming && status === "idle" && (
        <IncomingCallModal callerId={callerId} />
      )}
      {status !== "idle" && <CallScreen />}
    </>
  );
}
