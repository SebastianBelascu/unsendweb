"use client";

import { useEffect, useRef, useState } from "react";
import {
  Mic,
  MicOff,
  PhoneOff,
  SwitchCamera,
  Video,
  VideoOff,
} from "lucide-react";
import { useCall } from "@/lib/calls/store";
import { agora } from "@/lib/calls/AgoraService";
import {
  endCall,
  switchCamera,
  toggleMute,
  toggleVideo,
} from "@/lib/calls/controller";
import { UserAvatar } from "@/components/mail/UserAvatar";
import { cn } from "@/lib/utils";

function CallTimer() {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return (
    <>
      {mm}:{ss}
    </>
  );
}

/** Full-screen in-call overlay: remote video / avatar + local preview + controls. */
export function CallScreen() {
  const call = useCall((s) => s.call);
  const status = useCall((s) => s.status);
  const peers = useCall((s) => s.peers);
  const localMuted = useCall((s) => s.localMuted);
  const localVideoOn = useCall((s) => s.localVideoOn);
  const error = useCall((s) => s.error);

  const localRef = useRef<HTMLDivElement>(null);
  const remoteRef = useRef<HTMLDivElement>(null);

  const peerUids = Object.keys(peers).map(Number);
  const firstPeer = peerUids.length ? peerUids[0] : null;
  const remoteHasVideo = firstPeer != null && peers[firstPeer]?.hasVideo;

  useEffect(() => {
    if (remoteHasVideo && firstPeer != null && remoteRef.current) {
      agora.playRemoteVideo(firstPeer, remoteRef.current);
    }
  }, [remoteHasVideo, firstPeer]);

  useEffect(() => {
    if (localVideoOn && localRef.current) agora.playLocalVideo(localRef.current);
  }, [localVideoOn, status]);

  if (!call) return null;

  const statusLabel =
    status === "joined" ? (
      <CallTimer />
    ) : status === "ringing" ? (
      "Ringing…"
    ) : status === "connecting" ? (
      "Connecting…"
    ) : status === "calling" ? (
      "Calling…"
    ) : (
      "…"
    );

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-[#0b0b0d] text-white">
      {/* Stage */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        {/* Remote video fills the stage when present; otherwise the avatar. */}
        {remoteHasVideo ? (
          <div ref={remoteRef} className="absolute inset-0 bg-black" />
        ) : (
          <div className="flex flex-col items-center gap-4">
            <UserAvatar
              name={call.peerName}
              address={call.peerAddress}
              isEmail={false}
              size={120}
              showBadge={false}
            />
            <div className="text-center">
              <div className="text-title font-bold">{call.peerName}</div>
              <div className="mt-1 text-subhead text-white/60">{statusLabel}</div>
            </div>
          </div>
        )}

        {/* Header overlay (name + timer) when remote video is showing. */}
        {remoteHasVideo && (
          <div className="absolute left-0 right-0 top-0 flex items-center justify-center gap-2 bg-gradient-to-b from-black/60 to-transparent p-4">
            <span className="text-callout font-semibold">{call.peerName}</span>
            <span className="text-subhead text-white/70">{statusLabel}</span>
          </div>
        )}

        {/* Local preview (PiP) when our camera is on. */}
        {localVideoOn && (
          <div
            ref={localRef}
            className="absolute bottom-4 right-4 h-40 w-28 overflow-hidden rounded-xl border border-white/20 bg-black shadow-xl"
          />
        )}

        {error && (
          <div className="absolute bottom-28 left-1/2 -translate-x-1/2 rounded-full bg-[#ef4444]/90 px-4 py-1.5 text-caption">
            {error}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-5 pb-8 pt-4">
        <CtrlBtn
          label={localMuted ? "Unmute" : "Mute"}
          active={localMuted}
          onClick={() => void toggleMute()}
        >
          {localMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
        </CtrlBtn>

        <CtrlBtn
          label={localVideoOn ? "Camera off" : "Camera on"}
          active={!localVideoOn}
          onClick={() => void toggleVideo()}
        >
          {localVideoOn ? (
            <Video className="h-6 w-6" />
          ) : (
            <VideoOff className="h-6 w-6" />
          )}
        </CtrlBtn>

        {localVideoOn && (
          <CtrlBtn label="Switch camera" onClick={() => void switchCamera()}>
            <SwitchCamera className="h-6 w-6" />
          </CtrlBtn>
        )}

        <button
          type="button"
          aria-label="End call"
          onClick={() => void endCall()}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-[#ef4444] text-white shadow-lg transition-transform hover:scale-105"
        >
          <PhoneOff className="h-7 w-7" />
        </button>
      </div>
    </div>
  );
}

function CtrlBtn({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex h-14 w-14 items-center justify-center rounded-full transition-colors",
        active ? "bg-white text-[#0b0b0d]" : "bg-white/15 text-white hover:bg-white/25",
      )}
    >
      {children}
    </button>
  );
}
