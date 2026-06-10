"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/api/account";
import { useRealtime } from "@/lib/realtime/store";
import { useCall } from "@/lib/calls/store";
import { agora } from "@/lib/calls/AgoraService";
import { teardown } from "@/lib/calls/controller";
import { generateAgoraUid } from "@/lib/calls/agoraUid";
import { playRingtone, stopRingtone } from "@/lib/calls/ringtone";
import { IncomingCallModal } from "./IncomingCallModal";
import { CallScreen } from "./CallScreen";
import { FloatingCallWidget } from "./FloatingCallWidget";
import { CameraInvitationSheet } from "./CameraInvitationSheet";

/**
 * Single orchestrator for calls (mounted once in the app layout). Owns the Agora
 * media handlers + the call signaling on the shared socket, and renders the
 * incoming-call ring + the in-call screen from the call store.
 */
export function CallHost() {
  const { data: me } = useSession();
  const callerId = me?.userId;
  const myUsername = me?.username;
  const socket = useRealtime((s) => s.socket);
  const incoming = useCall((s) => s.incoming);
  const status = useCall((s) => s.status);
  const minimized = useCall((s) => s.minimized);
  const cameraInvite = useCall((s) => s.cameraInvite);
  const localVideoOn = useCall((s) => s.localVideoOn);
  const qc = useQueryClient();

  // Ring tones: incoming ring while the invite is showing, outgoing ringback
  // while dialing/ringing, silence once connected/ended. A ref avoids restarting
  // the cadence on the calling→ringing transition.
  const ringKind = useRef<"incoming" | "outgoing" | null>(null);
  useEffect(() => {
    const want: "incoming" | "outgoing" | null =
      incoming && status === "idle"
        ? "incoming"
        : status === "calling" || status === "ringing"
          ? "outgoing"
          : null;
    if (want === ringKind.current) return;
    ringKind.current = want;
    if (want) playRingtone(want);
    else stopRingtone();
  }, [incoming, status]);
  useEffect(() => () => stopRingtone(), []);

  // Camera-invitation prompt auto-dismisses after 30 s (native parity).
  useEffect(() => {
    if (!cameraInvite) return;
    const id = setTimeout(() => useCall.getState().setCameraInvite(false), 30_000);
    return () => clearTimeout(id);
  }, [cameraInvite]);

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
      to?: unknown[];
    }) => {
      if (!msg?.callUUID || !msg?.channelName) return;
      const st = useCall.getState();
      if (st.status !== "idle" || st.incoming) return; // already busy
      const topicId =
        msg.topicId || msg.channelName.replace(/^call_/, "");
      // The call message's `to` is the full participant list — 2 for a 1:1 chat,
      // ≥3 for a group. The authoritative isGroup/groupName arrive from
      // /calls/start when we answer; this just labels the ring.
      const isGroup = Array.isArray(msg.to) && msg.to.length >= 3;
      st.setIncoming({
        uuid: msg.callUUID,
        channelName: msg.channelName,
        topicId,
        isVideo: String(msg.text ?? "").toLowerCase().includes("video"),
        callerName: msg.from?.name || "Unknown",
        callerAddress: msg.from?.address,
        isGroup,
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

    // Our own screen uid — ignore echoes of our own share (the main client
    // already filters it at the media layer; this avoids a store phantom).
    const myScreenUid = myUsername
      ? generateAgoraUid(`${myUsername}#screen`)
      : null;

    const isForCall = (d: { callUUID?: string; channelName?: string }) => {
      const st = useCall.getState();
      return Boolean(
        st.call &&
          (st.call.uuid === d?.callUUID ||
            st.call.channelName === d?.channelName),
      );
    };

    const onScreenStarted = (d: {
      callUUID?: string;
      channelName?: string;
      screenUid?: number;
    }) => {
      if (!d?.screenUid || d.screenUid === myScreenUid || !isForCall(d)) return;
      // Reinforce classification; the actual stream arrives via Agora publish.
      useCall.getState().upsertPeer(d.screenUid, { isScreen: true });
    };

    const onScreenStopped = (d: {
      callUUID?: string;
      channelName?: string;
      screenUid?: number;
    }) => {
      if (!d?.screenUid || d.screenUid === myScreenUid || !isForCall(d)) return;
      // Snappy hide; the screen connection's `user-left` also cleans this up.
      useCall.getState().removePeer(d.screenUid);
    };

    // A peer turned their camera on mid-call and invites us to do the same.
    const onCameraInvite = (d: { callUUID?: string; channelName?: string }) => {
      const st = useCall.getState();
      if (!isForCall(d) || st.localVideoOn) return;
      st.setCameraInvite(true);
    };

    socket.on("create", onCreate);
    socket.on("call-received", onReceived);
    socket.on("call-ended", onEnded);
    socket.on("screen-share-started", onScreenStarted);
    socket.on("screen-share-stopped", onScreenStopped);
    socket.on("camera-on-invitation", onCameraInvite);
    return () => {
      socket.off("create", onCreate);
      socket.off("call-received", onReceived);
      socket.off("call-ended", onEnded);
      socket.off("screen-share-started", onScreenStarted);
      socket.off("screen-share-stopped", onScreenStopped);
      socket.off("camera-on-invitation", onCameraInvite);
    };
  }, [socket, callerId, myUsername]);

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
      {status !== "idle" &&
        (minimized ? <FloatingCallWidget /> : <CallScreen />)}
      {status !== "idle" && cameraInvite && !localVideoOn && (
        <CameraInvitationSheet />
      )}
    </>
  );
}
