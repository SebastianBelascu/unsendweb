import { useEffect, useState } from "react";

/*
  Call-duration helpers. The wall-clock read lives here (not in render) so
  React's purity rule isn't tripped; components consume `useCallSeconds`, which
  ticks once a second from the store's `joinedAt`. Reading from `joinedAt` (not a
  per-mount counter) keeps the timer correct across minimize/restore remounts.
*/

/** Seconds elapsed since `joinedAt` (epoch ms); 0 when the call isn't connected. */
export function elapsedSeconds(joinedAt: number | null): number {
  if (!joinedAt) return 0;
  return Math.max(0, Math.round((Date.now() - joinedAt) / 1000));
}

/** mm:ss, or hh:mm:ss past an hour. */
export function formatCallTime(secs: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Live duration in seconds, ticking each second from `joinedAt`. */
export function useCallSeconds(joinedAt: number | null): number {
  const [secs, setSecs] = useState<number>(() => elapsedSeconds(joinedAt));
  useEffect(() => {
    const id = setInterval(() => setSecs(elapsedSeconds(joinedAt)), 1000);
    return () => clearInterval(id);
  }, [joinedAt]);
  return secs;
}
