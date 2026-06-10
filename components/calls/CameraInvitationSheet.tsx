"use client";

import { Video } from "lucide-react";
import { useCall } from "@/lib/calls/store";
import { toggleVideo } from "@/lib/calls/controller";

/**
 * Receiver-side prompt (native CameraInvitationSheet) shown when a peer turns
 * their camera on mid-call and invites us to do the same. Accept turns our
 * camera on; Decline dismisses. Auto-dismiss (30 s) is owned by CallHost.
 */
export function CameraInvitationSheet() {
  const call = useCall((s) => s.call);
  const setCameraInvite = useCall((s) => s.setCameraInvite);
  const setMinimized = useCall((s) => s.setMinimized);

  if (!call) return null;
  const who = call.groupName ?? call.peerName ?? "Caller";

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 sm:items-center">
      <div className="slide-up m-4 w-full max-w-sm rounded-3xl border border-white/10 bg-[#1c1b18] p-6 text-center text-white shadow-2xl">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white/10">
          <Video className="h-9 w-9" />
        </div>
        <h2 className="mt-5 text-body font-semibold">
          {who} wants to turn on video
        </h2>
        <p className="mt-1.5 text-subhead text-white/60">
          Accepting will turn your camera on too.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => setCameraInvite(false)}
            className="h-12 flex-1 rounded-2xl bg-white/10 text-callout font-semibold text-white transition-colors hover:bg-white/15"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => {
              setCameraInvite(false);
              setMinimized(false);
              void toggleVideo();
            }}
            className="h-12 flex-1 rounded-2xl bg-email text-callout font-semibold text-white transition-opacity hover:opacity-90"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
