"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { blurhashToDataURL } from "@/lib/media/blurhash";
import { cn } from "@/lib/utils";

/*
  An <img> that shows the decoded blurhash placeholder underneath and fades the
  real image in once it loads — the progressive-load look from the native chat.
  The root element is the sizing box: callers control width/height/aspect/rounding
  via `className` + `style`; the images fill it with object-cover.
*/
export function BlurImage({
  url,
  blurhash,
  alt,
  className,
  style,
  onClick,
  loading = "lazy",
}: {
  url?: string;
  blurhash?: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  loading?: "lazy" | "eager";
}) {
  const [loaded, setLoaded] = useState(false);
  const blur = useMemo(() => blurhashToDataURL(blurhash), [blurhash]);

  return (
    <div
      className={cn("relative overflow-hidden bg-surface-3", className)}
      style={style}
      onClick={onClick}
    >
      {blur && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={blur}
          alt=""
          aria-hidden
          className={cn(
            "absolute inset-0 h-full w-full scale-105 object-cover transition-opacity duration-500",
            loaded ? "opacity-0" : "opacity-100",
          )}
        />
      )}
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          loading={loading}
          onLoad={() => setLoaded(true)}
          className={cn(
            "relative h-full w-full object-cover transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
      )}
    </div>
  );
}
