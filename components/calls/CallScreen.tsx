"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Mic,
  MicOff,
  PhoneOff,
  ScreenShare,
  ScreenShareOff,
  SwitchCamera,
  Video,
  VideoOff,
} from "lucide-react";
import { useCall, type RemotePeer } from "@/lib/calls/store";
import { agora } from "@/lib/calls/AgoraService";
import {
  endCall,
  switchCamera,
  toggleMute,
  toggleScreenShare,
  toggleVideo,
} from "@/lib/calls/controller";
import { UserAvatar } from "@/components/mail/UserAvatar";
import { buildUidMap } from "@/lib/calls/uidMap";
import { useMediaQuery } from "@/lib/use-media-query";
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

/** How many columns to use for N tiles, adapting to viewport width. */
function gridColumns(n: number, narrow: boolean): number {
  if (narrow) return n <= 1 ? 1 : 2;
  if (n <= 1) return 1;
  if (n <= 4) return 2;
  if (n <= 9) return 3;
  if (n <= 16) return 4;
  return 5;
}

/** Screen capture is only available in a secure context with the API present. */
function canScreenShare(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getDisplayMedia === "function"
  );
}

/** One remote participant tile in the group grid: their video or avatar + name. */
function PeerTile({
  peer,
  name,
  address,
}: {
  peer: RemotePeer;
  name: string;
  address?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (peer.hasVideo && ref.current) agora.playRemoteVideo(peer.uid, ref.current);
  }, [peer.hasVideo, peer.uid]);
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl bg-white/[0.06]">
      {peer.hasVideo ? (
        <div ref={ref} className="absolute inset-0 bg-black" />
      ) : (
        <UserAvatar
          name={name}
          address={address}
          isEmail={false}
          size={64}
          showBadge={false}
        />
      )}
      <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-caption">
        {peer.muted && <MicOff className="h-3 w-3 text-white/70" />}
        <span className="max-w-[8rem] truncate">{name}</span>
      </div>
    </div>
  );
}

/** The local camera tile in the group grid. */
function LocalTile({ on, name }: { on: boolean; name: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (on && ref.current) agora.playLocalVideo(ref.current);
  }, [on]);
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl bg-white/[0.06]">
      {on ? (
        <div ref={ref} className="absolute inset-0 bg-black" />
      ) : (
        <UserAvatar name={name} isEmail={false} size={64} showBadge={false} />
      )}
      <div className="absolute bottom-1.5 left-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-caption">
        You
      </div>
    </div>
  );
}

/** The big stage showing a remote participant's screen-share stream. */
function ScreenStage({ uid, presenter }: { uid: number; presenter: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // "contain" → letterbox, never stretch the shared screen (preserve aspect).
    if (ref.current) agora.playRemoteVideo(uid, ref.current, "contain");
  }, [uid]);
  return (
    <div className="relative min-h-0 flex-1 bg-black">
      <div ref={ref} className="absolute inset-0" />
      <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 text-caption">
        <ScreenShare className="h-3.5 w-3.5" />
        {presenter} is presenting
      </div>
    </div>
  );
}

/** Full-screen in-call overlay: remote video / avatar + local preview + controls. */
export function CallScreen() {
  const call = useCall((s) => s.call);
  const status = useCall((s) => s.status);
  const peers = useCall((s) => s.peers);
  const localMuted = useCall((s) => s.localMuted);
  const localVideoOn = useCall((s) => s.localVideoOn);
  const localScreenOn = useCall((s) => s.localScreenOn);
  const error = useCall((s) => s.error);

  const localRef = useRef<HTMLDivElement>(null);
  const remoteRef = useRef<HTMLDivElement>(null);
  const narrow = useMediaQuery("(max-width: 640px)");

  const uidMap = useMemo(() => buildUidMap(call?.roster), [call?.roster]);
  const isGroup = Boolean(call?.isGroup);

  const peerUids = Object.keys(peers).map(Number);
  // A uid is a screen stream if the deterministic roster hash says so, or the
  // screen-share socket event flagged it. Either way it skips the camera grid.
  const isScreenUid = (u: number) =>
    Boolean(uidMap.get(u)?.isScreen || peers[u]?.isScreen);
  const cameraUids = peerUids.filter((u) => !isScreenUid(u));
  const screenUid =
    peerUids.find((u) => isScreenUid(u) && peers[u]?.hasVideo) ?? null;

  const firstPeer = cameraUids.length ? cameraUids[0] : null;
  const remoteHasVideo = firstPeer != null && peers[firstPeer]?.hasVideo;

  // 1:1 stage: play the single remote peer's video (unless a screen has the stage).
  useEffect(() => {
    if (
      !isGroup &&
      screenUid == null &&
      remoteHasVideo &&
      firstPeer != null &&
      remoteRef.current
    ) {
      agora.playRemoteVideo(firstPeer, remoteRef.current);
    }
  }, [isGroup, screenUid, remoteHasVideo, firstPeer]);

  // 1:1 local PiP.
  useEffect(() => {
    if (!isGroup && screenUid == null && localVideoOn && localRef.current) {
      agora.playLocalVideo(localRef.current);
    }
  }, [isGroup, screenUid, localVideoOn, status]);

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

  const headerName = call.groupName ?? call.peerName;
  const joinedCount = cameraUids.length + 1; // remote cameras + me
  const canShare = canScreenShare();
  const presenter =
    screenUid != null ? (uidMap.get(screenUid)?.name ?? "Someone") : "Someone";

  const errorToast = error ? (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-[#ef4444]/90 px-4 py-1.5 text-caption">
      {error}
    </div>
  ) : null;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-[#0b0b0d] text-white">
      {screenUid != null ? (
        /* ---- Someone is presenting: big screen stage + camera filmstrip ---- */
        <div className="relative flex min-h-0 flex-1 flex-col">
          <ScreenStage uid={screenUid} presenter={presenter} />
          <div className="shrink-0 overflow-x-auto p-2">
            <div className="flex gap-2">
              <div className="aspect-video w-28 shrink-0 sm:w-40">
                <LocalTile on={localVideoOn} name="You" />
              </div>
              {cameraUids.map((uid) => {
                const peer = peers[uid];
                if (!peer) return null;
                const info = uidMap.get(uid);
                return (
                  <div key={uid} className="aspect-video w-28 shrink-0 sm:w-40">
                    <PeerTile
                      peer={peer}
                      name={info?.name ?? "Participant"}
                      address={info?.address}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          {errorToast}
        </div>
      ) : isGroup ? (
        /* ---- Group: adaptive grid of all participants ---- */
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-center gap-2 border-b border-white/10 px-4 py-3">
            <span className="text-callout font-semibold">{headerName}</span>
            <span className="text-subhead text-white/60">
              {status === "joined" ? `${joinedCount} in call` : statusLabel}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <div
              className="grid min-h-full gap-2"
              style={{
                gridTemplateColumns: `repeat(${gridColumns(joinedCount, narrow)}, minmax(0, 1fr))`,
                gridAutoRows: "minmax(120px, 1fr)",
              }}
            >
              <LocalTile on={localVideoOn} name="You" />
              {cameraUids.map((uid) => {
                const peer = peers[uid];
                if (!peer) return null;
                const info = uidMap.get(uid);
                return (
                  <PeerTile
                    key={uid}
                    peer={peer}
                    name={info?.name ?? "Participant"}
                    address={info?.address}
                  />
                );
              })}
            </div>
          </div>
          {errorToast}
        </div>
      ) : (
        /* ---- 1:1: remote full stage + local PiP ---- */
        <div className="relative flex min-h-0 flex-1 items-center justify-center">
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

          {remoteHasVideo && (
            <div className="absolute left-0 right-0 top-0 flex items-center justify-center gap-2 bg-gradient-to-b from-black/60 to-transparent p-4">
              <span className="text-callout font-semibold">{call.peerName}</span>
              <span className="text-subhead text-white/70">{statusLabel}</span>
            </div>
          )}

          {localVideoOn && (
            <div
              ref={localRef}
              className="absolute bottom-4 right-4 h-40 w-28 overflow-hidden rounded-xl border border-white/20 bg-black shadow-xl"
            />
          )}

          {errorToast}
        </div>
      )}

      {/* "You're sharing" banner. */}
      {localScreenOn && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full bg-email/90 px-4 py-1.5 text-caption font-medium shadow-lg">
          You&rsquo;re sharing your screen
        </div>
      )}

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

        {canShare && (
          <CtrlBtn
            label={localScreenOn ? "Stop sharing" : "Share screen"}
            active={localScreenOn}
            onClick={() => void toggleScreenShare()}
          >
            {localScreenOn ? (
              <ScreenShareOff className="h-6 w-6" />
            ) : (
              <ScreenShare className="h-6 w-6" />
            )}
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
