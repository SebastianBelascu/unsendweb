"use client";

import { useMemo } from "react";
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
import type { CallFilter } from "@/lib/inbox-view";
import { cn } from "@/lib/utils";

function isMissed(c: CallRecord): boolean {
  return (
    c.status === "missed" || c.status === "declined" || c.status === "failed"
  );
}

/** Partition matching the row labels (missed wins over the direction). */
function matchesFilter(
  c: CallRecord,
  myUserId: string | undefined,
  filter: CallFilter,
): boolean {
  if (filter === "all") return true;
  const missed = isMissed(c);
  const outgoing = Boolean(myUserId && c.callerId === myUserId);
  if (filter === "missed") return missed;
  if (filter === "outgoing") return !missed && outgoing;
  return !missed && !outgoing; // incoming
}

/** Free-text match across the call's people (name/username/address) + subject. */
function matchesQuery(c: CallRecord, q: string): boolean {
  if (!q) return true;
  const hay = [
    c.subject,
    ...c.participants.flatMap((p) => [p.name, p.username, p.address]),
  ];
  return hay.some((s) => (s ?? "").toLowerCase().includes(q));
}

/** Recent calls (history). Tapping a 1:1 entry calls that person back. */
export function CallsList({
  filter = "all",
  query = "",
}: {
  filter?: CallFilter;
  query?: string;
}) {
  const { data: me } = useSession();
  const status = useCall((s) => s.status);
  const busy = status !== "idle";
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["calls", "history"],
    queryFn: () => getCallHistory(100),
    refetchInterval: 15_000,
  });

  const calls = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter(
      (c) => matchesFilter(c, me?.userId, filter) && matchesQuery(c, q),
    );
  }, [data, me?.userId, filter, query]);

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
        ) : calls.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center text-subhead text-muted">
            <Phone className="h-8 w-8 text-faint" />
            <p>
              {filter === "all" && !query.trim()
                ? "No recent calls yet."
                : "No calls here."}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col">
            {calls.map((c) => (
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
        className="flex h-[120px] w-full items-center gap-4 border-b border-line px-4 text-left transition-colors hover:bg-surface disabled:cursor-default disabled:hover:bg-transparent"
      >
        <UserAvatar
          name={name}
          address={address}
          isEmail={false}
          size={64}
          showBadge={false}
        />
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "truncate text-headline font-medium",
              missed ? "text-[#ef4444]" : "text-ink",
            )}
          >
            {name}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-body text-faint">
            <DirIcon className={cn("h-4 w-4", missed ? "text-[#ef4444]" : "")} />
            <span>{dirLabel}</span>
            {when && <span>· {threadTime(when)}</span>}
          </div>
        </div>
        <TypeIcon className="h-5 w-5 shrink-0 text-faint" />
      </button>
    </li>
  );
}
