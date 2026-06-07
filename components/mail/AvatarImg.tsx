"use client";

import { useState } from "react";

/**
 * The avatar <img> with a graceful fallback: if the image 404s/errors (e.g. a
 * stale version, or the object isn't there), we render the gradient `fallback`
 * instead of a broken image. Client-only so it can hold the error state.
 */
export function AvatarImg({
  src,
  alt,
  size,
  fallback,
}: {
  src: string;
  alt: string;
  size: number;
  fallback: React.ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className="h-full w-full rounded-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}
