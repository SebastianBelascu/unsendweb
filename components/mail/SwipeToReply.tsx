"use client";

import { useRef, type ReactNode } from "react";
import { Reply } from "lucide-react";
import { cn } from "@/lib/utils";

/*
  WhatsApp-style swipe-to-reply. Drag a message horizontally toward its own side
  (incoming → right, your own → left); a reply glyph fades in from the gutter and,
  past the threshold, releasing fires onReply(). Pointer-based so it works with
  touch and mouse; `touch-action: pan-y` keeps vertical scrolling native. The
  drag is applied straight to the DOM via refs (no React re-render per move) so it
  stays buttery, and a horizontal swipe suppresses the bubble's tap.
*/

const THRESHOLD = 56; // px past which release triggers reply
const MAX = 84; // visual travel cap
const SLOP = 8; // px before a move counts as a horizontal swipe

export function SwipeToReply({
  enabled,
  isOwn,
  onReply,
  children,
}: {
  enabled: boolean;
  isOwn: boolean;
  onReply: () => void;
  children: ReactNode;
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const active = useRef(false); // committed to a horizontal swipe
  const swiped = useRef(false); // a swipe happened → suppress the click
  const dx = useRef(0);
  const pid = useRef<number | null>(null);

  // Own messages sit on the right and swipe left; everyone else swipes right.
  const dir = isOwn ? -1 : 1;

  // Suppress text selection while dragging (otherwise the bubble text highlights).
  function setNoSelect(on: boolean) {
    const el = innerRef.current;
    if (!el) return;
    if (on) {
      el.style.setProperty("user-select", "none");
      el.style.setProperty("-webkit-user-select", "none");
    } else {
      el.style.removeProperty("user-select");
      el.style.removeProperty("-webkit-user-select");
    }
  }

  function paint(x: number, withTransition: boolean) {
    const el = innerRef.current;
    if (el) {
      el.style.transition = withTransition
        ? "transform 180ms cubic-bezier(0.22,1,0.36,1)"
        : "none";
      el.style.transform = x ? `translateX(${x}px)` : "";
    }
    const icon = iconRef.current;
    if (icon) {
      const p = Math.min(1, Math.abs(x) / THRESHOLD);
      icon.style.opacity = String(p);
      icon.style.transform = `translateY(-50%) scale(${0.5 + p * 0.5})`;
      icon.classList.toggle("text-accent", p >= 1);
      icon.classList.toggle("text-faint", p < 1);
    }
    dx.current = x;
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!enabled) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    startX.current = e.clientX;
    startY.current = e.clientY;
    active.current = false;
    swiped.current = false;
    pid.current = e.pointerId;
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!enabled || pid.current !== e.pointerId) return;
    const ddx = e.clientX - startX.current;
    const ddy = e.clientY - startY.current;
    if (!active.current) {
      if (
        Math.abs(ddx) > SLOP &&
        Math.abs(ddx) > Math.abs(ddy) &&
        Math.sign(ddx) === dir
      ) {
        active.current = true;
        setNoSelect(true);
        window.getSelection?.()?.removeAllRanges?.();
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          /* capture is best-effort */
        }
      } else if (Math.abs(ddy) > SLOP) {
        pid.current = null; // vertical intent → let the list scroll
        return;
      } else {
        return;
      }
    }
    // Track the finger ONLY in the reply direction. If it comes back past the
    // start point, clamp to 0 so the bubble settles in place instead of
    // mirroring to the other side (the "debounce" that fired reply by accident).
    const along = ddx * dir; // > 0 means pulled toward the reply side
    let mag = along > 0 ? along : 0;
    if (mag > MAX) mag = MAX + (mag - MAX) * 0.2; // resist past MAX
    paint(dir * Math.min(mag, MAX + 16), false);
    swiped.current = true;
    e.preventDefault();
  }

  function finish(e: React.PointerEvent) {
    if (pid.current !== null && pid.current !== e.pointerId) return;
    pid.current = null;
    const fired = active.current && Math.abs(dx.current) >= THRESHOLD;
    active.current = false;
    setNoSelect(false);
    paint(0, true);
    if (fired) onReply();
  }

  return (
    <div
      className="relative"
      style={enabled ? { touchAction: "pan-y" } : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onClickCapture={(e) => {
        if (swiped.current) {
          e.stopPropagation();
          swiped.current = false;
        }
      }}
    >
      {enabled && (
        <div
          ref={iconRef}
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-1/2 flex h-8 w-8 items-center justify-center rounded-full text-faint",
            isOwn ? "right-1" : "left-1",
          )}
          style={{ opacity: 0, transform: "translateY(-50%) scale(0.5)" }}
        >
          <Reply className="h-5 w-5" />
        </div>
      )}
      <div ref={innerRef}>{children}</div>
    </div>
  );
}
