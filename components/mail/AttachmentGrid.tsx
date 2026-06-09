"use client";

import { useState, type CSSProperties } from "react";
import type { MailAttachment } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BlurImage } from "./BlurImage";
import { MediaLightbox } from "./MediaLightbox";

/*
  WhatsApp-style image album for a single chat/email message. 1 image keeps its
  orientation; 2/3/4+ pack into a tidy grid with a "+N" overflow tile. Tapping
  any tile opens the MediaLightbox at that image. Non-image attachments
  (video/voice/file) are rendered separately by the caller.
*/

const MAX_W = "max-w-[320px]";

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
  return (
    <div className={cn("relative cursor-pointer", className)} style={style}>
      <BlurImage
        url={a.url}
        blurhash={a.placeholder}
        alt={a.filename}
        className="h-full w-full rounded-lg"
        onClick={onOpen}
      />
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

export function AttachmentGrid({ images }: { images: MailAttachment[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const count = images.length;
  if (count === 0) return null;

  const lightbox =
    open != null ? (
      <MediaLightbox images={images} index={open} onClose={() => setOpen(null)} />
    ) : null;

  // Single image — keep its natural-ish orientation.
  if (count === 1) {
    const a = images[0];
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

  // Two images — side by side.
  if (count === 2) {
    return (
      <>
        <div className={cn("grid grid-cols-2 gap-1", MAX_W)}>
          {images.map((a, i) => (
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
            a={images[0]}
            onOpen={() => setOpen(0)}
            className="col-span-2"
            style={{ aspectRatio: "2 / 1" }}
          />
          {images.slice(1, 3).map((a, i) => (
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
  const visible = images.slice(0, 4);
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
