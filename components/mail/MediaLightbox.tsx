"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download, Play, X } from "lucide-react";
import type { MailAttachment } from "@/lib/types";
import { blurhashToDataURL } from "@/lib/media/blurhash";
import { cn } from "@/lib/utils";

/*
  Fullscreen media viewer (the lightbox you get when tapping a photo/video in
  chat). Swipe between the message's media, play videos inline, download, and
  navigate with the keyboard (←/→/Esc). Clicking anywhere that ISN'T the media
  closes it. Rendered in a portal on <body> so it escapes the message-list
  stacking/overflow context.
*/

const isVideo = (a?: MailAttachment) =>
  (a?.type || "").toLowerCase().startsWith("video");

export function MediaLightbox({
  media,
  index,
  onClose,
}: {
  media: MailAttachment[];
  index: number;
  onClose: () => void;
}) {
  const [i, setI] = useState(index);
  const touchX = useRef<number | null>(null);

  const count = media.length;
  const cur = media[i];
  const curVideo = isVideo(cur);
  const blur =
    !curVideo && cur?.placeholder
      ? blurhashToDataURL(cur.placeholder)
      : undefined;

  const go = useCallback(
    (dir: number) => {
      setI((v) => (v + dir + count) % count);
    },
    [count],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, go]);

  // Lock background scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (typeof document === "undefined" || !cur) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-black/95 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-3 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-footnote tabular-nums opacity-80">
          {count > 1 ? `${i + 1} / ${count}` : ""}
        </span>
        <div className="flex items-center gap-1">
          {cur.url && (
            <a
              href={cur.url}
              download={cur.filename}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full p-2 hover:bg-white/10"
              aria-label="Download"
            >
              <Download className="h-5 w-5" />
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 hover:bg-white/10"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Stage — clicking anywhere that ISN'T the media closes the viewer. */}
      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden px-2"
        onClick={onClose}
        onTouchStart={(e) => {
          touchX.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          if (touchX.current == null) return;
          const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX.current;
          touchX.current = null;
          if (Math.abs(dx) > 50 && count > 1) {
            e.preventDefault(); // a swipe navigates — don't also close
            go(dx < 0 ? 1 : -1);
          }
        }}
      >
        {blur && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={blur}
            alt=""
            aria-hidden
            className="absolute h-[60%] max-h-[80vh] w-auto max-w-[92vw] object-contain opacity-40 blur-xl"
          />
        )}
        {curVideo ? (
          <video
            key={cur.id}
            src={cur.url}
            poster={cur.posterUrl}
            controls
            autoPlay
            playsInline
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[82vh] max-w-[92vw] object-contain"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={cur.id}
            src={cur.url}
            alt={cur.filename}
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[82vh] max-w-[92vw] select-none object-contain"
            draggable={false}
          />
        )}

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                go(-1);
              }}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
              aria-label="Previous"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                go(1);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
              aria-label="Next"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}
      </div>

      {/* Thumbnail strip */}
      {count > 1 && (
        <div
          className="flex justify-center gap-1.5 overflow-x-auto px-4 py-3"
          onClick={(e) => e.stopPropagation()}
        >
          {media.map((a, idx) => {
            const vid = isVideo(a);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setI(idx)}
                className={cn(
                  "relative h-12 w-12 shrink-0 overflow-hidden rounded-md border-2 bg-black/40 transition-opacity",
                  idx === i
                    ? "border-white opacity-100"
                    : "border-transparent opacity-50 hover:opacity-80",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={vid ? a.posterUrl : a.url}
                  alt={a.filename}
                  className="h-full w-full object-cover"
                />
                {vid && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <Play className="h-4 w-4 text-white" fill="currentColor" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>,
    document.body,
  );
}
