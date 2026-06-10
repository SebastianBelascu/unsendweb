"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { useGifs, gifToFile, type GifItem } from "@/lib/api/gifs";

/**
 * Tenor GIF picker. Search (trending when empty); tapping a GIF downloads it via
 * the BFF proxy and hands a File back to the composer, which uploads it through
 * the normal attachment pipeline (GIFs aren't re-encoded, so animation survives).
 */
export function GifPicker({
  onPick,
  onClose,
}: {
  onPick: (file: File) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [picking, setPicking] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q), 350);
    return () => clearTimeout(id);
  }, [q]);

  const { data: gifs, isLoading } = useGifs(debounced);

  async function pick(g: GifItem) {
    if (picking) return;
    setPicking(g.id);
    try {
      onPick(await gifToFile(g));
      onClose();
    } catch {
      setPicking(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[72vh] w-full max-w-md flex-col rounded-t-2xl border border-line-strong bg-surface-2 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
          <div className="flex flex-1 items-center gap-2 rounded-full bg-surface-3 px-3 py-1.5">
            <Search className="h-4 w-4 shrink-0 text-faint" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search GIFs"
              className="min-w-0 flex-1 bg-transparent text-subhead text-ink outline-none placeholder:text-faint"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-faint hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-subhead text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : !gifs?.length ? (
            <div className="px-6 py-12 text-center text-subhead text-muted">
              {debounced ? "No GIFs found." : "Search for a GIF."}
            </div>
          ) : (
            <div className="columns-2 gap-2 sm:columns-3 [&>button]:mb-2">
              {gifs.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => pick(g)}
                  className="relative block w-full break-inside-avoid overflow-hidden rounded-lg bg-surface-3 transition-opacity hover:opacity-90"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={g.preview}
                    alt={g.description}
                    loading="lazy"
                    className="w-full"
                    style={
                      g.width && g.height
                        ? { aspectRatio: `${g.width} / ${g.height}` }
                        : undefined
                    }
                  />
                  {picking === g.id && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <Loader2 className="h-5 w-5 animate-spin text-white" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-line px-3 py-1.5 text-center text-micro text-faint">
          Powered by Tenor
        </div>
      </div>
    </div>
  );
}
