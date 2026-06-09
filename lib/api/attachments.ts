/**
 * Shape the backend expects inside SendMessageDto.attachments (AttachmentDto).
 * `placeholder` is dual-purpose: blurhash for images, OR the duration in
 * seconds (as a string) for voice notes — matching the native client.
 * `id` is REQUIRED in practice: the native image cache keys on it
 * (`${id}-image`), so omitting it makes every web-sent photo collide on
 * `undefined-image` and not render on phones. `orientation` ("portrait" |
 * "landscape" | "box") drives the native/web grid aspect ratio.
 */
export interface AttachmentDto {
  id?: string;
  url: string;
  title: string;
  type: string;
  size: number;
  thumbnail?: string;
  placeholder?: string;
  orientation?: string;
}

/**
 * Upload bytes through our BFF (/api/upload), which fetches a presigned URL and
 * PUTs to S3 server-side — sidestepping the browser→S3 CORS block. XHR is used
 * so we can report upload progress (browser → our server). Returns the stable
 * public object URL.
 */
export function uploadViaBff(
  file: Blob,
  kind: "avatar" | "attachment",
  filename: string,
  contentType: string,
  onProgress?: (pct: number) => void,
): Promise<{ url: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.setRequestHeader("x-kind", kind);
    xhr.setRequestHeader("x-filename", encodeURIComponent(filename));
    xhr.setRequestHeader("x-content-type", contentType);
    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as { url: string });
        } catch {
          reject(new Error("Upload returned a bad response"));
        }
      } else {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(file);
  });
}

/**
 * Upload already-prepared bytes and return the AttachmentDto to embed in
 * SendMessageDto. The caller supplies the metadata (id, filename, type,
 * blurhash/duration placeholder, orientation) — image bytes are resized +
 * re-encoded upstream in the composer (lib/media/image.ts) before reaching here.
 */
export async function uploadAttachment(
  blob: Blob,
  meta: {
    id: string;
    filename: string;
    type: string;
    size: number;
    placeholder?: string;
    orientation?: string;
    onProgress?: (pct: number) => void;
  },
): Promise<AttachmentDto> {
  const { url } = await uploadViaBff(
    blob,
    "attachment",
    meta.filename,
    meta.type,
    meta.onProgress,
  );
  return {
    id: meta.id,
    url,
    title: meta.filename,
    type: meta.type,
    size: meta.size,
    placeholder: meta.placeholder,
    orientation: meta.orientation,
  };
}
