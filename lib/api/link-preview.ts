import { useQuery } from "@tanstack/react-query";

export interface LinkPreview {
  url: string;
  domain: string;
  title?: string;
  description?: string;
  image?: string;
}

const URL_RE = /https?:\/\/[^\s<>"']+/i;

/** First http(s) URL in a string, or null. */
export function firstUrl(text?: string | null): string | null {
  if (!text) return null;
  const m = text.match(URL_RE);
  if (!m) return null;
  // Trim common trailing punctuation that isn't part of the URL.
  return m[0].replace(/[.,;:!?)\]]+$/, "");
}

/** OG metadata for a URL, fetched via the BFF (/api/link-preview). Cached. */
export function useLinkPreview(url: string | null) {
  return useQuery({
    queryKey: ["linkPreview", url],
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
