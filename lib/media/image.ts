import { encode } from "blurhash";

/*
  Client-side image processing for chat/email attachments. Before upload we:
    1. honor EXIF orientation + downscale to a sane max dimension (WhatsApp-ish),
    2. re-encode (JPEG for photos, PNG kept for transparency),
    3. compute a standard blurhash placeholder + an orientation hint,
  so the AttachmentDto carries the same `placeholder`/`orientation` the mobile
  app sends. This is what lets a web-sent photo render correctly (and with a
  progressive blur) on the native client — the native image cache keys on the
  attachment `id` and shows the blurhash from `placeholder`.

  All of this runs in the browser (createImageBitmap + <canvas>).
*/

/** Longest-edge cap for uploaded photos (balanced quality, ~WhatsApp). */
const MAX_DIM = 1600;
const JPEG_QUALITY = 0.75;

export type Orientation = "portrait" | "landscape" | "box";

export interface ProcessedImage {
  blob: Blob;
  /** Filename with an extension matching the re-encoded type. */
  filename: string;
  /** Output MIME type ("image/jpeg" or "image/png"). */
  type: string;
  width: number;
  height: number;
  orientation: Orientation;
  /** Standard blurhash string (placeholder), if it could be computed. */
  blurhash?: string;
}

// Animated GIFs (would lose animation) and SVGs (vector / sanitization concerns)
// are uploaded as-is. Everything else raster we can safely re-encode.
const PROCESSABLE = /^image\/(jpeg|jpg|png|webp|bmp|heic|heif|avif)$/i;

export function isProcessableImage(type?: string): boolean {
  return !!type && PROCESSABLE.test(type);
}

function orientationOf(w: number, h: number): Orientation {
  if (w > h * 1.05) return "landscape";
  if (h > w * 1.05) return "portrait";
  return "box";
}

function blurhashFromCanvas(source: HTMLCanvasElement): string | undefined {
  try {
    // Encode from a tiny downscale — blurhash on full-res is needlessly slow.
    const ratio = source.height / source.width || 1;
    const bw = 32;
    const bh = Math.max(1, Math.round(bw * ratio));
    const small = document.createElement("canvas");
    small.width = bw;
    small.height = bh;
    const sctx = small.getContext("2d");
    if (!sctx) return undefined;
    sctx.drawImage(source, 0, 0, bw, bh);
    const data = sctx.getImageData(0, 0, bw, bh);
    return encode(data.data, bw, bh, 4, 3);
  } catch {
    return undefined;
  }
}

function stripExt(name: string): string {
  return name.replace(/\.[^./\\]+$/, "");
}

/**
 * Resize + re-encode an image File and compute its blurhash/orientation.
 * Throws if the browser can't decode the file (caller should fall back to
 * uploading the original bytes).
 */
export async function processImageFile(file: File): Promise<ProcessedImage> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  const ow = bitmap.width;
  const oh = bitmap.height;
  const scale = Math.min(1, MAX_DIM / Math.max(ow, oh));
  const w = Math.max(1, Math.round(ow * scale));
  const h = Math.max(1, Math.round(oh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    throw new Error("Canvas unavailable");
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  // Keep PNG so transparency survives; everything else becomes JPEG.
  const keepPng = file.type === "image/png";
  const outType = keepPng ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Image encoding failed"))),
      outType,
      keepPng ? undefined : JPEG_QUALITY,
    ),
  );

  const blurhash = blurhashFromCanvas(canvas);
  const base = stripExt(file.name || "image") || "image";
  const ext = keepPng ? "png" : "jpg";

  return {
    blob,
    filename: `${base}.${ext}`,
    type: outType,
    width: w,
    height: h,
    orientation: orientationOf(w, h),
    blurhash,
  };
}
