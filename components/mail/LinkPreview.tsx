"use client";

import { Loader2, X } from "lucide-react";
import { useLinkPreview } from "@/lib/api/link-preview";
import { cn } from "@/lib/utils";

/*
  URL link previews — OG metadata fetched via the BFF (the backend stores only a
  withUrlPreview flag, so the client fetches like native). Two surfaces:
  - LinkPreviewCard: the bubble card (image + domain + title), tappable.
  - LinkPreviewBar: the composer preview strip (thumbnail + domain + title + ✕).
*/

/** Bubble-side card: image (if any) + domain + title. Mirrors native BubbleLinkPreviewCard. */
export function LinkPreviewCard({
  url,
  isOwn,
}: {
  url: string;
  isOwn?: boolean;
}) {
  const { data } = useLinkPreview(url);
  if (!data || (!data.title && !data.image)) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="mt-1.5 block w-[250px] max-w-full"
    >
      {data.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={data.image}
          alt=""
          loading="lazy"
          className="h-[150px] w-full rounded-lg object-cover"
        />
      )}
      <div className="pt-1">
        <div
          className={cn(
            "truncate text-micro",
            isOwn ? "text-white/70" : "text-faint",
          )}
        >
          {data.domain}
        </div>
        {data.title && (
          <div
            className={cn(
              "line-clamp-2 text-caption font-semibold",
              isOwn ? "text-white" : "text-ink",
            )}
          >
            {data.title}
          </div>
        )}
      </div>
    </a>
  );
}

/** Composer-side strip: small thumbnail + domain + title, dismissible. */
export function LinkPreviewBar({
  url,
  onDismiss,
}: {
  url: string;
  onDismiss: () => void;
}) {
  const { data, isLoading } = useLinkPreview(url);
  if (!isLoading && (!data || (!data.title && !data.image))) return null;
  return (
    <div className="mx-3 mb-2 flex items-center gap-3 rounded-xl border border-line-strong bg-surface-2 p-2">
      {isLoading ? (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-3">
          <Loader2 className="h-4 w-4 animate-spin text-faint" />
        </div>
      ) : data?.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={data.image}
          alt=""
          className="h-10 w-10 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="h-10 w-10 shrink-0 rounded-lg bg-surface-3" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-micro text-faint">
          {data?.domain ?? "Loading preview…"}
        </div>
        {data?.title && (
          <div className="truncate text-footnote font-semibold text-ink">
            {data.title}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss preview"
        className="shrink-0 rounded-full p-1 text-faint hover:bg-surface-3 hover:text-ink"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
