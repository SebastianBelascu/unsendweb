"use client";

import { MicOff, Phone, Video } from "lucide-react";
import { useCall } from "@/lib/calls/store";
import { endCall } from "@/lib/calls/controller";
import { formatCallTime, useCallSeconds } from "@/lib/calls/duration";

/**
 * Compact pill shown while a call is active but minimized (native
 * FloatingActiveCallWidget). Tapping anywhere except "End" restores the full
 * call screen; the duration is read from the store so it stays accurate.
 */
export function FloatingCallWidget() {
  const call = useCall((s) => s.call);
  const status = useCall((s) => s.status);
  const localMuted = useCall((s) => s.localMuted);
  const joinedAt = useCall((s) => s.joinedAt);
  const setMinimized = useCall((s) => s.setMinimized);
  const secs = useCallSeconds(joinedAt);

  if (!call) return null;

  const name = call.groupName ?? call.peerName;
  const statusText =
    status === "joined"
      ? formatCallTime(secs)
      : status === "ringing"
        ? "Ringing…"
        : status === "connecting"
          ? "Connecting…"
          : status === "calling"
            ? "Calling…"
            : "";

  return (
    <button
      type="button"
      onClick={() => setMinimized(false)}
      aria-label={`Return to call: ${name}`}
      className="slide-up fixed left-1/2 top-3 z-[60] flex w-[min(92vw,22rem)] -translate-x-1/2 items-center gap-2.5 rounded-full border border-white/10 bg-[#1c1b18] px-3 py-2 text-left text-white shadow-2xl"
    >
      {call.isVideo ? (
        <Video className="h-[18px] w-[18px] shrink-0 text-white/60" />
      ) : (
        <Phone className="h-[18px] w-[18px] shrink-0 text-white/60" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-subhead font-semibold">{name}</div>
        <div className="truncate text-caption text-white/55">{statusText}</div>
      </div>
      {localMuted && <MicOff className="h-4 w-4 shrink-0 text-white/70" />}
      <span
        role="button"
        tabIndex={0}
        aria-label="End call"
        onClick={(e) => {
          e.stopPropagation();
          void endCall();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.stopPropagation();
            void endCall();
          }
        }}
        className="shrink-0 rounded-full bg-[#ef4444] px-3.5 py-1.5 text-caption font-semibold text-white transition-transform hover:scale-105"
      >
        End
      </span>
    </button>
  );
}
