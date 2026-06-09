/*
  Client-side video poster generation. We can't reliably transcode video in the
  browser, so the original file is uploaded as-is (size-capped). What we DO is
  grab a representative frame as a JPEG poster — uploaded as the attachment's
  thumbnail so a video renders like a photo (poster + play button) in the album
  grid, the lightbox, and on the native client. Mirrors the mobile app, which
  uploads a thumbnail and stores its URL in the attachment `placeholder`.
*/

export type Orientation = "portrait" | "landscape" | "box";

export interface VideoPoster {
  blob: Blob;
  width: number;
  height: number;
  orientation: Orientation;
}

const MAX_DIM = 1280;
const JPEG_QUALITY = 0.7;

function orientationOf(w: number, h: number): Orientation {
  if (w > h * 1.05) return "landscape";
  if (h > w * 1.05) return "portrait";
  return "box";
}

/**
 * Decode a representative frame from a video File and return it as a JPEG poster
 * (+ dimensions/orientation). Throws if the browser can't decode the codec
 * (caller should fall back to uploading the video with no poster).
 */
export async function generateVideoPoster(file: File): Promise<VideoPoster> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;

    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("Video decode failed"));
    });

    // Seek a touch past the start for a non-black frame, then wait for it.
    const seekTo = Math.min(0.1, (video.duration || 1) / 2);
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      try {
        video.currentTime = seekTo;
      } catch {
        resolve();
      }
      // Safety: don't hang forever if onseeked never fires.
      setTimeout(resolve, 600);
    });

    const vw = video.videoWidth || 1;
    const vh = video.videoHeight || 1;
    const scale = Math.min(1, MAX_DIM / Math.max(vw, vh));
    const w = Math.max(1, Math.round(vw * scale));
    const h = Math.max(1, Math.round(vh * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.drawImage(video, 0, 0, w, h);

    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Poster encoding failed"))),
        "image/jpeg",
        JPEG_QUALITY,
      ),
    );

    return { blob, width: w, height: h, orientation: orientationOf(w, h) };
  } finally {
    URL.revokeObjectURL(url);
  }
}
