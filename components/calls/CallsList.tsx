"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Video,
} from "lucide-react";
import { getCallHistory, type CallRecord } from "@/lib/api/calls";
import { useSession } from "@/lib/api/account";
import { useCall } from "@/lib/calls/store";
import { placeCall } from "@/lib/calls/controller";
import { UserAvatar } from "@/components/mail/UserAvatar";
import { threadTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Recent calls (history). Tapping a 1:1 entry calls that person back. */
export function CallsList() {
  const { data: me } = useSession();
  const status = useCall((s) => s.status);
  const busy = status !== "idle";
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["calls", "history"],
    queryFn: () => getCallHistory(100),
    refetchInterval: 15_000,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="border-b border-line px-4 py-2 text-caption text-faint">
        Calls ring on the web only while Unsend is open in a tab.
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading || !me ? (
          // Wait for the session too: direction/other-party depend on our id.
          <div className="flex items-center justify-center p-10 text-faint">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-center text-subhead text-muted">
            <p>Couldn&apos;t load your calls.</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="rounded-pill bg-surface-2 px-4 py-2 font-semibold text-ink hover:bg-surface-3"
            >
              Retry
            </button>
          </div>
        ) : !data || data.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center text-subhead text-muted">
            <Phone className="h-8 w-8 text-faint" />
            <p>No recent calls yet.</p>
          </div>
        ) : (
          <ul className="flex flex-col">
            {data.map((c) => (
              <CallRow
                key={c.uuid}
                call={c}
                myUserId={me?.userId}
                myUsername={me?.username}
                disabled={busy || !me?.userId}
                onCallBack={(peerName, peerAddress) => {
                  if (!me?.userId) return;
                  void placeCall({
                    topicId: c.topicId,
                    isVideo: c.type === "video",
                    peerName,
                    peerAddress,
                    callerId: me.userId,
                  });
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CallRow({
  call,
  myUserId,
  myUsername,
  disabled,
  onCallBack,
}: {
  call: CallRecord;
  myUserId?: string;
  myUsername?: string;
  disabled: boolean;
  onCallBack: (peerName: string, peerAddress?: string) => void;
}) {
  const other =
    call.participants.find(
      (p) =>
        (myUserId && p.userId !== myUserId) ||
        (myUsername &&
          (p.username ?? "").toLowerCase() !== myUsername.toLowerCase()),
    ) ?? call.participants[0];
  const name =
    call.isGroup && call.subject
      ? call.subject
      : other?.name || other?.username || "Unknown";
  const address = other?.address;

  const outgoing = Boolean(myUserId && call.callerId === myUserId);
  const missed =
    call.status === "missed" ||
    call.status === "declined" ||
    call.status === "failed";

  const DirIcon = missed
    ? PhoneMissed
    : outgoing
      ? PhoneOutgoing
      : PhoneIncoming;
  const dirLabel = missed
    ? call.status === "declined"
      ? "Declined"
      : "Missed"
    : outgoing
      ? "Outgoing"
      : "Incoming";
  const TypeIcon = call.type === "video" ? Video : Phone;
  const when = call.updatedAt || call.startedAt || call.createdAt;

  return (
    <li>
      <button
        type="button"
        disabled={disabled || call.isGroup}
        onClick={() => onCallBack(name, address)}
        className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left transition-colors hover:bg-surface disabled:cursor-default disabled:hover:bg-transparent"
      >
        <UserAvatar
          name={name}
          address={address}
          isEmail={false}
          size={48}
          showBadge={false}
        />
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "truncate text-callout font-medium",
              missed ? "text-[#ef4444]" : "text-ink",
            )}
          >
            {name}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-subhead text-faint">
            <DirIcon
              className={cn("h-3.5 w-3.5", missed ? "text-[#ef4444]" : "")}
            />
            <span>{dirLabel}</span>
            {when && <span>· {threadTime(when)}</span>}
          </div>
        </div>
        <TypeIcon className="h-5 w-5 shrink-0 text-faint" />
      </button>
    </li>
  );
}
