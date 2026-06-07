"use client";

import { Phone, Video } from "lucide-react";
import { useSession } from "@/lib/api/account";
import { useCall } from "@/lib/calls/store";
import { placeCall } from "@/lib/calls/controller";
import { localPart } from "@/lib/identity";

/**
 * Voice/video call buttons for a 1:1 chat header. Starting a call inside the
 * click handler satisfies the browser's getUserMedia gesture requirement.
 */
export function CallButtons({
  topicId,
  recipientName,
  recipientAddress,
}: {
  topicId?: string;
  recipientName: string;
  recipientAddress?: string;
}) {
  const { data: me } = useSession();
  const status = useCall((s) => s.status);
  const busy = status !== "idle";
  const disabled = busy || !me?.userId;

  function start(isVideo: boolean) {
    if (!me?.userId || busy) return;
    void placeCall({
      topicId,
      recipientUsername: topicId ? undefined : localPart(recipientAddress),
      isVideo,
      peerName: recipientName,
      peerAddress: recipientAddress,
      callerId: me.userId,
    });
  }

  return (
    <div className="ml-auto flex items-center gap-1">
      <button
        type="button"
        aria-label="Voice call"
        title="Voice call"
        disabled={disabled}
        onClick={() => start(false)}
        className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface hover:text-ink disabled:opacity-40"
      >
        <Phone className="h-5 w-5" />
      </button>
      <button
        type="button"
        aria-label="Video call"
        title="Video call"
        disabled={disabled}
        onClick={() => start(true)}
        className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface hover:text-ink disabled:opacity-40"
      >
        <Video className="h-5 w-5" />
      </button>
    </div>
  );
}
