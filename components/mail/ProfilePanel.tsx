"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AtSign, Mail, Phone, Smartphone, Video, X } from "lucide-react";
import { UserAvatar } from "./UserAvatar";
import { getUserProfile } from "@/lib/api/users";
import { useSession } from "@/lib/api/account";
import { useLastSeen, useOnline, usePresenceFor } from "@/lib/realtime/hooks";
import { useCall } from "@/lib/calls/store";
import { placeCall } from "@/lib/calls/controller";
import { cn } from "@/lib/utils";

function lastSeenLabel(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const days = Math.floor(s / 86400);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return format(new Date(iso), "MMM d");
}

/**
 * 1:1 contact details — same right-drawer modal as GroupPanel, for consistency.
 * Shows avatar, name, presence, username/phone/address, and quick call actions.
 */
export function ProfilePanel({
  username,
  name,
  address,
  topicId,
  onClose,
}: {
  username: string;
  name: string;
  address?: string;
  topicId?: string;
  onClose: () => void;
}) {
  usePresenceFor(username ? [username] : []);
  const online = useOnline(username);
  const lastSeen = useLastSeen(username);
  const { data: me } = useSession();
  const callStatus = useCall((s) => s.status);
  const busy = callStatus !== "idle";

  const { data: profile } = useQuery({
    queryKey: ["userProfile", username],
    queryFn: () => getUserProfile(username),
    enabled: Boolean(username),
    staleTime: 5 * 60_000,
  });

  function call(isVideo: boolean) {
    if (!me?.userId || busy) return;
    void placeCall({
      topicId,
      isVideo,
      peerName: name,
      peerAddress: address,
      callerId: me.userId,
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/50"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-md flex-col bg-canvas shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-line px-5 py-4">
          <h2 className="text-callout font-bold text-ink-strong">Contact info</h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-lg p-1.5 text-muted hover:bg-surface hover:text-ink"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col items-center gap-3 border-b border-line px-5 py-8">
            <UserAvatar
              name={name}
              address={address}
              isEmail={false}
              size={112}
              showBadge={false}
            />
            <div className="text-center">
              <div className="text-title font-bold text-ink-strong">{name}</div>
              <div className="mt-0.5 text-subhead text-faint">
                {online ? (
                  <span className="text-email">online</span>
                ) : lastSeen ? (
                  `last seen ${lastSeenLabel(lastSeen)}`
                ) : (
                  `@${username}`
                )}
              </div>
            </div>

            <div className="mt-3 flex items-center gap-4">
              <ActionBtn
                icon={Phone}
                label="Voice"
                disabled={busy || !me?.userId}
                onClick={() => call(false)}
              />
              <ActionBtn
                icon={Video}
                label="Video"
                disabled={busy || !me?.userId}
                onClick={() => call(true)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1 px-5 py-4">
            <InfoRow icon={AtSign} label="Username" value={`@${username}`} />
            {profile?.phone && (
              <InfoRow icon={Smartphone} label="Phone" value={profile.phone} />
            )}
            {address && (
              <InfoRow icon={Mail} label="Unsend address" value={address} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: typeof Phone;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 disabled:opacity-40"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-ink transition-colors hover:bg-surface-3">
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-caption text-faint">{label}</span>
    </button>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Phone;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <Icon className="h-5 w-5 shrink-0 text-faint" />
      <div className="min-w-0">
        <div className="text-caption text-faint">{label}</div>
        <div className={cn("truncate text-subhead text-ink")}>{value}</div>
      </div>
    </div>
  );
}
