"use client";

import { useState, type CSSProperties } from "react";
import { Play } from "lucide-react";
import type { MailAttachment } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BlurImage } from "./BlurImage";
import { MediaLightbox } from "./MediaLightbox";

/*
  WhatsApp-style media album for a single chat/email message. Images and videos
  share the grid: 1 keeps its orientation; 2/3/4+ pack into a tidy layout with a
  "+N" overflow tile. Videos render their poster with a ▶ badge. Tapping any tile
  opens the MediaLightbox at that item. Voice/file attachments are rendered
  separately by the caller.
*/

const MAX_W = "max-w-[320px]";

const isVideo = (a: MailAttachment) =>
  (a.type || "").toLowerCase().startsWith("video");

function aspectFor(o?: string): string {
  if (o === "portrait") return "3 / 4";
  if (o === "landscape") return "4 / 3";
  return "1 / 1";
}

function Tile({
  a,
  onOpen,
  className,
  style,
  overlay,
}: {
  a: MailAttachment;
  onOpen: () => void;
  className?: string;
  style?: CSSProperties;
  overlay?: string;
}) {
  const video = isVideo(a);
  return (
    <div className={cn("relative cursor-pointer", className)} style={style}>
      <BlurImage
        url={video ? a.posterUrl : a.url}
        blurhash={video ? undefined : a.placeholder}
        alt={a.filename}
        className="h-full w-full rounded-lg"
        onClick={onOpen}
      />
      {video && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55">
            <Play className="h-6 w-6 translate-x-0.5 text-white" fill="currentColor" />
          </span>
        </div>
      )}
      {overlay && (
        <div
          onClick={onOpen}
          className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/55 text-title font-semibold text-white"
        >
          {overlay}
        </div>
      )}
    </div>
  );
}

export function AttachmentGrid({ media }: { media: MailAttachment[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const count = media.length;
  if (count === 0) return null;

  const lightbox =
    open != null ? (
      <MediaLightbox media={media} index={open} onClose={() => setOpen(null)} />
    ) : null;

  // Single item — keep its natural-ish orientation.
  if (count === 1) {
    const a = media[0];
    return (
      <>
        <div className={cn("w-full", MAX_W)}>
          <Tile
            a={a}
            onOpen={() => setOpen(0)}
            style={{ aspectRatio: aspectFor(a.orientation) }}
          />
        </div>
        {lightbox}
      </>
    );
  }

  // Two — side by side.
  if (count === 2) {
    return (
      <>
        <div className={cn("grid grid-cols-2 gap-1", MAX_W)}>
          {media.map((a, i) => (
            <Tile
              key={a.id}
              a={a}
              onOpen={() => setOpen(i)}
              style={{ aspectRatio: "1 / 1" }}
            />
          ))}
        </div>
        {lightbox}
      </>
    );
  }

  // Three — one wide banner on top, two below.
  if (count === 3) {
    return (
      <>
        <div className={cn("grid grid-cols-2 gap-1", MAX_W)}>
          <Tile
            a={media[0]}
            onOpen={() => setOpen(0)}
            className="col-span-2"
            style={{ aspectRatio: "2 / 1" }}
          />
          {media.slice(1, 3).map((a, i) => (
            <Tile
              key={a.id}
              a={a}
              onOpen={() => setOpen(i + 1)}
              style={{ aspectRatio: "1 / 1" }}
            />
          ))}
        </div>
        {lightbox}
      </>
    );
  }

  // Four or more — 2×2, with a "+N" overlay on the last visible tile.
  const visible = media.slice(0, 4);
  const extra = count - 4;
  return (
    <>
      <div className={cn("grid grid-cols-2 gap-1", MAX_W)}>
        {visible.map((a, i) => (
          <Tile
            key={a.id}
            a={a}
            onOpen={() => setOpen(i)}
            style={{ aspectRatio: "1 / 1" }}
            overlay={i === 3 && extra > 0 ? `+${extra}` : undefined}
          />
        ))}
      </div>
      {lightbox}
    </>
  );
}
