import { useQuery } from '@tanstack/react-query';

export interface LinkPreview {
  url: string;
  domain: string;
  title?: string;
  description?: string;
  image?: string;
  /** Intrinsic image dimensions (when the page declares them) — used to paint
   *  the bubble card at the image's natural aspect ratio without a load jump. */
  imageWidth?: number;
  imageHeight?: number;
}

const URL_RE = /https?:\/\/[^\s<>"']+/i;

// Hosts that render a useless preview (login walls / anti-bot) — mirrors the
// native LinkParser blacklist so these never show a card on either surface.
const PREVIEW_BLACKLIST = /(?:^|\.)(?:linkedin|twitter|x)\.com$/i;

/** True for URLs we deliberately skip previewing (native parity). */
export function isBlacklistedUrl(url?: string | null): boolean {
  if (!url) return false;
  try {
    return PREVIEW_BLACKLIST.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** First previewable http(s) URL in a string, or null (skips blacklisted hosts). */
export function firstUrl(text?: string | null): string | null {
  if (!text) return null;
  const m = text.match(URL_RE);
  if (!m) return null;
  // Trim common trailing punctuation that isn't part of the URL.
  const url = m[0].replace(/[.,;:!?)\]]+$/, '');
  return isBlacklistedUrl(url) ? null : url;
}

/** OG metadata for a URL, fetched via the BFF (/api/link-preview). Cached. */
export function useLinkPreview(url: string | null) {
  return useQuery({
    queryKey: ['linkPreview', url],
    queryFn: async (): Promise<LinkPreview | null> => {
      const res = await fetch(
        `/api/link-preview?url=${encodeURIComponent(url as string)}`,
      );
      if (!res.ok) return null;
      return (await res.json()) as LinkPreview;
    },
    enabled: Boolean(url),
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
    retry: false,
  });
}
