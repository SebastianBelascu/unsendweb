"use client";

import { useRealtime } from "@/lib/realtime/store";
import { localPart } from "@/lib/identity";
import { avatarUrl } from "@/lib/avatar-url";
import { Avatar, type AvatarPerson } from "./Avatar";

/**
 * Avatar for a single Unsend user: resolves the username from their address,
 * looks up their avatar version in the realtime store, and shows their photo
 * only when a version is known (so we never fire 404s for users without one) —
 * everyone else falls back to the gradient. Use for 1:1 rows/bubbles; keep the
 * raw `Avatar` for stacked group avatars.
 */
export function UserAvatar({
  name,
  address,
  seed,
  isEmail,
  size,
  showBadge,
  online,
  people,
  className,
}: {
  name: string;
  address?: string;
  seed?: string;
  isEmail?: boolean;
  size?: number;
  showBadge?: boolean;
  online?: boolean;
  people?: AvatarPerson[];
  className?: string;
}) {
  // Whole version map so we can resolve photos for a single user OR a group
  // stack (each member's photo). Re-renders on any avatar change — infrequent.
  const versions = useRealtime((s) => s.avatarVersions);

  if (people && people.length >= 2) {
    const enriched = people.map((p) => {
      const u = localPart(p.address);
      return { ...p, imageUrl: avatarUrl(u, u ? versions[u] : undefined) };
    });
    return (
      <Avatar
        name={name}
        seed={seed ?? address}
        isEmail={isEmail}
        size={size}
        showBadge={showBadge}
        online={online}
        people={enriched}
        className={className}
      />
    );
  }

  const username = localPart(address);
  const imageUrl = avatarUrl(username, username ? versions[username] : undefined);
  return (
    <Avatar
      name={name}
      seed={seed ?? address}
      imageUrl={imageUrl}
      isEmail={isEmail}
      size={size}
      showBadge={showBadge}
      online={online}
      className={className}
    />
  );
}
