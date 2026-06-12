'use client';

import { Loader2, X } from 'lucide-react';
import { useLinkPreview } from '@/lib/api/link-preview';
import { cn } from '@/lib/utils';

/*
  URL link previews — OG metadata fetched via the BFF (the backend stores only a
  withUrlPreview flag, so the client fetches like native). Two surfaces:
  - LinkPreviewCard: the bubble card (image + domain + title), tappable.
  - LinkPreviewBar: the composer preview strip (thumbnail + domain + title + ✕).
*/

// Card geometry — matches native BubbleLinkPreviewCard so YouTube/OG thumbnails
// render at their natural aspect (no crop, no letterbox) and never resize.
const CARD_WIDTH = 250;
const DEFAULT_IMAGE_H = 140;
const MIN_IMAGE_H = 60;
const MAX_IMAGE_H = 280;

/** Image height at the card width from intrinsic dims, clamped. Falls back to
 *  the default height (cover-cropped) when the page didn't declare a size. */
function previewImageHeight(w?: number, h?: number): number {
  if (!w || !h || w <= 0 || h <= 0) return DEFAULT_IMAGE_H;
  const scaled = Math.round(CARD_WIDTH / (w / h));
  return Math.max(MIN_IMAGE_H, Math.min(MAX_IMAGE_H, scaled));
}

/** Bubble-side card: image (if any) + domain + title. Mirrors native BubbleLinkPreviewCard. */
export function LinkPreviewCard({
  url,
  isOwn,
  standalone = false,
}: {
  url: string;
  isOwn?: boolean;
  /** True when this card IS the whole bubble (the message was just the URL).
   *  If no rich preview resolves, fall back to the URL as a plain link so the
   *  bubble is never left blank. */
  standalone?: boolean;
}) {
  const { data, isLoading } = useLinkPreview(url);
  const hasPreview = !!data && (!!data.title || !!data.image);

  if (!hasPreview) {
    // Inline URLs (the link text is already in the bubble) render nothing.
    if (!standalone) return null;
    // Standalone URL: reserve the card footprint while fetching so the bubble
    // never flashes empty, then fall back to the bare link if nothing resolves.
    const skel = isOwn ? 'bg-white/15' : 'bg-surface-2';
    if (isLoading) {
      return (
        <div className="mt-1.5 w-[250px] max-w-full animate-pulse">
          <div
            className={cn('w-full rounded-lg', skel)}
            style={{ height: DEFAULT_IMAGE_H }}
          />
          <div className={cn('mt-2 h-3 w-2/3 rounded', skel)} />
        </div>
      );
    }
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'block break-all underline underline-offset-2',
          isOwn ? 'text-white' : 'text-accent',
        )}
      >
        {url}
      </a>
    );
  }

  const imgH = previewImageHeight(data!.imageWidth, data!.imageHeight);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="mt-1.5 block w-[250px] max-w-full"
    >
      {data!.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={data!.image}
          alt=""
          loading="lazy"
          width={CARD_WIDTH}
          height={imgH}
          style={{ height: imgH }}
          className="w-full rounded-lg object-cover"
        />
      )}
      <div className="pt-1">
        <div
          className={cn(
            'truncate text-micro',
            isOwn ? 'text-white/70' : 'text-faint',
          )}
        >
          {data!.domain}
        </div>
        {data!.title && (
          <div
            className={cn(
              'line-clamp-2 text-caption font-semibold',
              isOwn ? 'text-white' : 'text-ink',
            )}
          >
            {data!.title}
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
          {data?.domain ?? 'Loading preview…'}
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
