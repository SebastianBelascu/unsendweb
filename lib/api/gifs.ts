import { useQuery } from "@tanstack/react-query";

export interface GifItem {
  id: string;
  description: string;
  /** Small animated preview (tinygif) for the grid. */
  preview: string;
  /** Send-quality animated GIF (mediumgif/gif). */
  gif: string;
  width?: number;
  height?: number;
}

async function fetchGifs(q: string): Promise<GifItem[]> {
  const res = await fetch(`/api/gifs?q=${encodeURIComponent(q)}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: GifItem[] };
  return data.results ?? [];
}

/** Tenor search (trending when the query is empty). */
export function useGifs(query: string) {
  return useQuery({
    queryKey: ["gifs", query.trim()],
    queryFn: () => fetchGifs(query.trim()),
    staleTime: 5 * 60_000,
  });
}

/** Download the chosen GIF (via the BFF proxy) as a File for the upload pipeline. */
export async function gifToFile(item: GifItem): Promise<File> {
  const res = await fetch(`/api/gifs?media=${encodeURIComponent(item.gif)}`);
  if (!res.ok) throw new Error("Couldn't fetch the GIF");
  const blob = await res.blob();
  const base =
    (item.description || "gif").replace(/[^a-z0-9]+/gi, "-").slice(0, 30) ||
    "gif";
  return new File([blob], `${base}.gif`, { type: blob.type || "image/gif" });
}
