import { decode } from "blurhash";

/*
  Blurhash helpers (client-only — they touch <canvas>). The mobile app encodes a
  standard blurhash into each image attachment's `placeholder` field via
  react-native-blurhash; we encode the same on upload (see lib/media/image.ts)
  and decode it here to render a progressive blur while the full image loads —
  matching the native chat experience.
*/

const cache = new Map<string, string>();

/**
 * Decode a blurhash string into a tiny PNG data URL (cached). Returns undefined
 * if the hash is missing/invalid or we're not in a browser (no canvas).
 */
export function blurhashToDataURL(
  hash?: string | null,
  width = 32,
  height = 32,
): string | undefined {
  if (!hash || typeof document === "undefined") return undefined;
  const key = `${hash}@${width}x${height}`;
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const pixels = decode(hash, width, height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    const imageData = ctx.createImageData(width, height);
    imageData.data.set(pixels);
    ctx.putImageData(imageData, 0, 0);
    const url = canvas.toDataURL();
    cache.set(key, url);
    return url;
  } catch {
    return undefined;
  }
}
