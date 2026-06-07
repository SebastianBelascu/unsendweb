"use client";

import { Phone, PhoneOff, Video } from "lucide-react";
import { useCall } from "@/lib/calls/store";
import { acceptCall, declineIncoming } from "@/lib/calls/controller";
import { UserAvatar } from "@/components/mail/UserAvatar";

/**
 * Incoming-call ring (in-tab only — web has no background VoIP push). Accepting
 * creates mic/cam inside the click (required user gesture for getUserMedia).
 */
export function IncomingCallModal({ callerId }: { callerId?: string }) {
  const incoming = useCall((s) => s.incoming);
  if (!incoming) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 rounded-card border border-line-strong bg-surface-2 px-6 py-8 shadow-2xl">
        <UserAvatar
          name={incoming.callerName}
          address={incoming.callerAddress}
          isEmail={false}
          size={88}
          showBadge={false}
        />
        <div className="text-center">
          <div className="text-headline font-bold text-ink-strong">
            {incoming.callerName}
          </div>
          <div className="mt-0.5 flex items-center justify-center gap-1.5 text-subhead text-faint">
            {incoming.isVideo ? (
              <Video className="h-4 w-4" />
            ) : (
              <Phone className="h-4 w-4" />
            )}
            Incoming {incoming.isVideo ? "video" : "voice"} call…
          </div>
        </div>

        <div className="mt-2 flex items-center gap-10">
          <button
            type="button"
            onClick={() => declineIncoming()}
            className="flex flex-col items-center gap-1.5"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#ef4444] text-white shadow-lg transition-transform hover:scale-105">
              <PhoneOff className="h-7 w-7" />
            </span>
            <span className="text-caption text-faint">Decline</span>
          </button>
          <button
            type="button"
            onClick={() => callerId && acceptCall(callerId)}
            disabled={!callerId}
            className="flex flex-col items-center gap-1.5 disabled:opacity-50"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-email text-white shadow-lg transition-transform hover:scale-105">
              {incoming.isVideo ? (
                <Video className="h-7 w-7" />
              ) : (
                <Phone className="h-7 w-7" />
              )}
            </span>
            <span className="text-caption text-faint">Accept</span>
          </button>
        </div>
      </div>
    </div>
  );
}
