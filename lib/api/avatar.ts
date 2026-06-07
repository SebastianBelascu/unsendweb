import { apiSend } from "./http";
import { uploadViaBff } from "./attachments";
import { useRealtime } from "../realtime/store";

/*
  Avatar upload: compress to a square JPEG, upload via the BFF (/api/upload →
  presigned PUT server-side, avoiding the browser→S3 CORS block), then POST
  /users/update-avatar to bump the cache-busting version.
*/

interface AvatarVersion {
  username: string;
  version: number;
  updatedAt: string;
}

async function commitAvatar(username: string): Promise<AvatarVersion> {
  return apiSend<AvatarVersion>("/users/update-avatar", "POST", { username });
}

const STORAGE_PREFIX = "unsend.web.avatar.";

/** Last-known avatar URL for a username (persisted across reloads, this device). */
export function getStoredAvatar(username?: string): string | undefined {
  if (!username || typeof localStorage === "undefined") return undefined;
  return localStorage.getItem(STORAGE_PREFIX + username.toLowerCase()) ?? undefined;
}

export function setStoredAvatar(username: string, url: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_PREFIX + username.toLowerCase(), url);
  // Let same-tab listeners (e.g. the avatar in the header) react immediately.
  window.dispatchEvent(
    new CustomEvent("unsend:avatar", { detail: { username, url } }),
  );
}

/** Center-crop + downscale to a square JPEG, honoring EXIF orientation. */
async function compressSquareJpeg(
  file: File,
  size = 512,
  quality = 0.85,
): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const min = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - min) / 2;
  const sy = (bitmap.height - min) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bitmap, sx, sy, min, min, 0, 0, size, size);
  bitmap.close?.();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Image compression failed"))),
      "image/jpeg",
      quality,
    ),
  );
}

/**
 * Compress, upload to S3, commit the new version, persist + return the public
 * (cache-busted) URL.
 */
const MAX_AVATAR_BYTES = 10 * 1024 * 1024;

export async function uploadAvatar(
  file: File,
  username: string,
): Promise<{ url: string; version: number }> {
  if (!file.type.startsWith("image/"))
    throw new Error("Please choose an image file.");
  if (file.size > MAX_AVATAR_BYTES)
    throw new Error("Image must be under 10MB.");
  const blob = await compressSquareJpeg(file);
  const { url } = await uploadViaBff(blob, "avatar", `${username}.jpeg`, "image/jpeg");
  // Must commit to get the authoritative server version. If this fails we let
  // the error propagate (caller shows a retry) rather than inventing a
  // client-clock version that the backend never recorded — that would poison
  // this device's cache (a `?v=` no other device agrees on).
  const { version } = await commitAvatar(username);
  const publicUrl = `${url}?v=${version}`;
  setStoredAvatar(username, publicUrl);
  // Reflect our own new photo everywhere it's resolved via UserAvatar.
  useRealtime.getState().setAvatarVersion(username, version);
  return { url: publicUrl, version };
}
