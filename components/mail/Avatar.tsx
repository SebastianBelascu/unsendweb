import { Mail, MessageCircle } from "lucide-react";
import { avatarForeground, avatarGradient, initials } from "@/lib/avatar";
import { cn } from "@/lib/utils";
import { AvatarImg } from "./AvatarImg";

export interface AvatarPerson {
  name?: string;
  address?: string;
  /** Resolved photo URL (UserAvatar fills this in for group stacks). */
  imageUrl?: string;
}

interface AvatarProps {
  name: string;
  /** Stable seed for the color (the contact's address). Defaults to `name`. */
  seed?: string;
  favicon?: string;
  /** Uploaded avatar image (takes precedence over the gradient). */
  imageUrl?: string;
  isEmail?: boolean;
  size?: number;
  showBadge?: boolean;
  /** Green online dot (presence). */
  online?: boolean;
  /** 2+ people (and no favicon) → stacked group avatar. */
  people?: AvatarPerson[];
  className?: string;
}

function OnlineDot({ size }: { size: number }) {
  const d = Math.max(8, Math.round(size * 0.26));
  return (
    <span
      className="absolute -right-0.5 -top-0.5 rounded-full border-2 border-canvas bg-email"
      style={{ width: d, height: d }}
    />
  );
}

function TypeBadge({ isEmail, badge }: { isEmail: boolean; badge: number }) {
  return (
    <span
      className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full border-2 border-canvas bg-[#3a3836]"
      style={{ width: badge, height: badge }}
    >
      {isEmail ? (
        <Mail
          style={{ width: badge * 0.55, height: badge * 0.55 }}
          className="text-email"
        />
      ) : (
        <MessageCircle
          style={{ width: badge * 0.55, height: badge * 0.55 }}
          className="text-chat-light"
        />
      )}
    </span>
  );
}

function Circle({
  seed,
  label,
  size,
  imageUrl,
}: {
  seed: string;
  label: string;
  size: number;
  imageUrl?: string;
}) {
  const gradient = (
    <div
      className="flex h-full w-full items-center justify-center rounded-full font-bold"
      style={{
        background: avatarGradient(seed),
        color: avatarForeground(seed),
        fontSize: size * 0.4,
      }}
    >
      {label}
    </div>
  );
  return (
    <div
      className="overflow-hidden rounded-full ring-2 ring-canvas"
      style={{ width: size, height: size }}
    >
      {imageUrl ? (
        <AvatarImg src={imageUrl} alt={label} size={size} fallback={gradient} />
      ) : (
        gradient
      )}
    </div>
  );
}

export function Avatar({
  name,
  seed,
  favicon,
  imageUrl,
  isEmail = true,
  size = 56,
  showBadge = true,
  online = false,
  people,
  className,
}: AvatarProps) {
  const badge = Math.round(size * 0.42);
  const stacked = !favicon && !imageUrl && people && people.length >= 2;

  if (stacked) {
    const s = Math.round(size * 0.66);
    const a = people![0];
    const b = people![1];
    return (
      <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
        <div className="absolute bottom-0 right-0">
          {people!.length > 2 ? (
            <div
              className="flex items-center justify-center rounded-full bg-surface-3 font-bold text-ink ring-2 ring-canvas"
              style={{ width: s, height: s, fontSize: s * 0.34 }}
            >
              +{people!.length - 1}
            </div>
          ) : (
            <Circle
              seed={b.address || b.name || "?"}
              label={initials(b.name || b.address || "?")}
              size={s}
              imageUrl={b.imageUrl}
            />
          )}
        </div>
        <div className="absolute left-0 top-0">
          <Circle
            seed={a.address || a.name || "?"}
            label={initials(a.name || a.address || "?")}
            size={s}
            imageUrl={a.imageUrl}
          />
        </div>
        {showBadge && <TypeBadge isEmail={isEmail} badge={badge} />}
        {online ? <OnlineDot size={size} /> : null}
      </div>
    );
  }

  const key = seed || name;
  const gradient = (
    <div
      className="flex h-full w-full items-center justify-center rounded-full font-bold"
      style={{
        background: avatarGradient(key),
        color: avatarForeground(key),
        fontSize: size * 0.38,
      }}
    >
      {initials(name)}
    </div>
  );

  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      {imageUrl ? (
        <AvatarImg src={imageUrl} alt={name} size={size} fallback={gradient} />
      ) : favicon ? (
        <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={favicon}
            alt=""
            style={{ width: size * 0.58, height: size * 0.58 }}
            className="rounded"
          />
        </div>
      ) : (
        gradient
      )}
      {showBadge && <TypeBadge isEmail={isEmail} badge={badge} />}
        {online ? <OnlineDot size={size} /> : null}
    </div>
  );
}
