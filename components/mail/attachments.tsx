"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Loader2, Mic, Paperclip, Plus, Send, Trash2, X } from "lucide-react";
import { uploadAttachment, type AttachmentDto } from "@/lib/api/attachments";
import { isProcessableImage, processImageFile } from "@/lib/media/image";
import { generateVideoPoster } from "@/lib/media/video";
import type { MailAttachment } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Hard cap for raw uploads (images are compressed first, so this guards
 *  videos/files). Oversized files are rejected with an error chip. */
const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;

export interface PendingAttachment {
  localId: string;
  /** Stable attachment id sent to the backend (native keys its image cache on this). */
  id: string;
  name: string;
  type: string;
  size: number;
  /** Object URL for instant local preview (images/videos). Revoked on remove. */
  previewUrl?: string;
  durationSec?: number;
  isVoice?: boolean;
  /** Blurhash (images) for progressive load; duration string is sent separately. */
  placeholder?: string;
  orientation?: string;
  progress: number;
  status: "uploading" | "done" | "error";
  /** Human-readable failure reason for the tray. */
  error?: string;
  dto?: AttachmentDto;
}

let _seq = 0;
const newLocalId = () => `pa-${_seq++}-${Date.now()}`;
const newAttachmentId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `att-${_seq++}-${Date.now()}`;

/** Manages a pending-attachment tray that uploads each file to S3 as it is added. */
export function useComposerAttachments() {
  const [pending, setPending] = useState<PendingAttachment[]>([]);

  const patch = (localId: string, p: Partial<PendingAttachment>) =>
    setPending((cur) =>
      cur.map((x) => (x.localId === localId ? { ...x, ...p } : x)),
    );

  // Process (images only) then upload. Resizing/compression + blurhash happen
  // here so the AttachmentDto carries the same placeholder/orientation the
  // native app sends; if processing fails (e.g. an undecodable format) we fall
  // back to uploading the original bytes so the send still works.
  const prepareAndUpload = useCallback(
    async (entry: PendingAttachment, file: File) => {
      let blob: Blob = file;
      let filename = entry.name;
      let type = entry.type;
      let placeholder =
        entry.durationSec != null ? String(entry.durationSec) : undefined;
      let orientation: string | undefined;
      let thumbnail: string | undefined;
      try {
        if (isProcessableImage(file.type)) {
          const p = await processImageFile(file);
          blob = p.blob;
          filename = p.filename;
          type = p.type;
          placeholder = p.blurhash;
          orientation = p.orientation;
          patch(entry.localId, { type, placeholder, orientation });
        } else if (file.type.startsWith("video")) {
          // Grab + upload a poster frame so the video shows like a photo
          // (poster + ▶) everywhere. Native stores the thumbnail URL in
          // `placeholder`, so we set both placeholder and thumbnail to it.
          try {
            const poster = await generateVideoPoster(file);
            const base = (file.name || "video").replace(/\.[^.]+$/, "");
            const posterDto = await uploadAttachment(poster.blob, {
              id: `${entry.id}-poster`,
              filename: `${base}-poster.jpg`,
              type: "image/jpeg",
              size: poster.blob.size,
            });
            placeholder = posterDto.url;
            thumbnail = posterDto.url;
            orientation = poster.orientation;
            patch(entry.localId, { placeholder, orientation });
          } catch {
            /* undecodable codec → upload the video with no poster */
          }
        }
        const dto = await uploadAttachment(blob, {
          id: entry.id,
          filename,
          type,
          size: blob.size,
          placeholder,
          orientation,
          thumbnail,
          onProgress: (pct) => patch(entry.localId, { progress: pct }),
        });
        patch(entry.localId, { status: "done", progress: 100, dto });
      } catch {
        patch(entry.localId, { status: "error", error: "Upload failed" });
      }
    },
    [],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      for (const file of files) {
        const isImg = file.type.startsWith("image");
        const isVid = file.type.startsWith("video");
        const tooBig = file.size > MAX_ATTACHMENT_BYTES;
        const entry: PendingAttachment = {
          localId: newLocalId(),
          id: newAttachmentId(),
          name: file.name || "file",
          type: file.type || "application/octet-stream",
          size: file.size,
          previewUrl:
            isImg || isVid ? URL.createObjectURL(file) : undefined,
          progress: 0,
          status: tooBig ? "error" : "uploading",
          error: tooBig ? "File too large (max 100MB)" : undefined,
        };
        setPending((cur) => [...cur, entry]);
        if (!tooBig) void prepareAndUpload(entry, file);
      }
    },
    [prepareAndUpload],
  );

  const addVoice = useCallback(
    (blob: Blob, durationSec: number) => {
      const type = blob.type || "audio/webm";
      const ext = type.includes("mp4") || type.includes("mp4a")
        ? "m4a"
        : type.includes("ogg")
          ? "ogg"
          : "webm";
      const file = new File([blob], `voice-${Date.now()}.${ext}`, { type });
      const entry: PendingAttachment = {
        localId: newLocalId(),
        id: newAttachmentId(),
        name: file.name,
        type,
        size: file.size,
        durationSec,
        isVoice: true,
        progress: 0,
        status: "uploading",
      };
      setPending((cur) => [...cur, entry]);
      void prepareAndUpload(entry, file);
    },
    [prepareAndUpload],
  );

  const remove = useCallback((localId: string) => {
    setPending((cur) => {
      const t = cur.find((x) => x.localId === localId);
      if (t?.previewUrl) URL.revokeObjectURL(t.previewUrl);
      return cur.filter((x) => x.localId !== localId);
    });
  }, []);

  const clear = useCallback(() => {
    setPending((cur) => {
      cur.forEach((x) => x.previewUrl && URL.revokeObjectURL(x.previewUrl));
      return [];
    });
  }, []);

  // Revoke any outstanding object URLs if the composer unmounts mid-compose.
  useEffect(() => {
    return () => {
      setPending((cur) => {
        cur.forEach((x) => x.previewUrl && URL.revokeObjectURL(x.previewUrl));
        return [];
      });
    };
  }, []);

  const uploading = pending.some((p) => p.status === "uploading");
  const readyDtos = (): AttachmentDto[] =>
    pending
      .filter((p) => p.status === "done" && p.dto)
      .map((p) => p.dto as AttachmentDto);

  return {
    pending,
    addFiles,
    addVoice,
    remove,
    clear,
    uploading,
    readyDtos,
    hasAny: pending.length > 0,
  };
}

export type ComposerAttachments = ReturnType<typeof useComposerAttachments>;

/** Map the just-uploaded DTOs into view attachments for an optimistic bubble. */
export function dtosToMailAttachments(dtos: AttachmentDto[]): MailAttachment[] {
  return dtos.map((d, i) => {
    const isImage = d.type.startsWith("image");
    const isVideo = d.type.startsWith("video");
    return {
      id: d.id || d.url || `att-${i}`,
      filename: d.title,
      url: d.url,
      type: d.type,
      // For images, `placeholder` is the blurhash (progressive load). For voice
      // it's the duration — read out into durationSec instead.
      placeholder: isImage ? d.placeholder : undefined,
      // For video, the poster/thumbnail URL (native stores it in placeholder).
      posterUrl: isVideo ? d.thumbnail || d.placeholder : undefined,
      orientation: d.orientation,
      durationSec:
        d.type.startsWith("audio") && d.placeholder
          ? parseInt(d.placeholder, 10)
          : undefined,
    };
  });
}

function fmtDur(s?: number): string {
  if (!s || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec < 10 ? "0" : ""}${sec}`;
}

/**
 * Pending attachments previewed as outbound bubbles above the composer input —
 * iMessage-style: a preview of the message about to be sent, right-aligned in
 * the conversation's accent (chat purple / email green). Images ARE the bubble;
 * files/voice show an accent bubble chip. Each carries a corner remove button.
 */
export function AttachmentTray({
  items,
  onRemove,
  isEmail = false,
}: {
  items: PendingAttachment[];
  onRemove: (localId: string) => void;
  isEmail?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap justify-start gap-2 px-4 pt-3">
      {items.map((a) => {
        const isImage = Boolean(a.previewUrl) && a.type.startsWith("image");
        const uploading = a.status === "uploading";
        const failed = a.status === "error";
        return (
          <div key={a.localId} className="relative">
            {isImage ? (
              <div className="relative w-fit overflow-hidden rounded-bubble">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.previewUrl}
                  alt={a.name}
                  className="block h-auto max-h-52 w-auto max-w-[220px] object-cover"
                />
                {(uploading || failed) && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-caption font-semibold text-white">
                    {failed ? (
                      a.error || "Failed"
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {a.progress}%
                      </span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div
                className={cn(
                  "flex max-w-[240px] items-center gap-2.5 rounded-bubble px-3.5 py-2.5 text-white",
                  isEmail ? "bg-email" : "bg-chat",
                )}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15">
                  {a.isVoice ? (
                    <Mic className="h-5 w-5" />
                  ) : (
                    <FileText className="h-5 w-5" />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-subhead font-medium">
                    {a.isVoice ? "Voice message" : a.name}
                  </div>
                  <div className="text-micro text-white/70">
                    {failed
                      ? a.error || "Upload failed"
                      : uploading
                        ? `${a.progress}%`
                        : a.isVoice
                          ? fmtDur(a.durationSec)
                          : "Ready to send"}
                  </div>
                </div>
                {uploading && (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-white/80" />
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => onRemove(a.localId)}
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-surface-3 text-faint shadow ring-2 ring-canvas transition-colors hover:text-ink"
              aria-label={`Remove ${a.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Pending attachments rendered INSIDE the message input field (iMessage-style):
 * small rounded thumbnails sitting above the text you type, each with a corner
 * remove button. Meant to live inside the rounded input container.
 */
export function InputAttachments({
  items,
  onRemove,
}: {
  items: PendingAttachment[];
  onRemove: (localId: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 px-3 pt-2.5">
      {items.map((a) => {
        const isImage = Boolean(a.previewUrl) && a.type.startsWith("image");
        const uploading = a.status === "uploading";
        const failed = a.status === "error";
        return (
          <div key={a.localId} className="relative">
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={a.previewUrl}
                alt={a.name}
                className="h-14 w-14 rounded-xl object-cover"
              />
            ) : (
              <div className="flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-xl bg-surface-3 px-1 text-faint">
                {a.isVoice ? (
                  <Mic className="h-5 w-5" />
                ) : (
                  <FileText className="h-5 w-5" />
                )}
                <span className="w-full truncate text-center text-[9px] leading-tight">
                  {a.isVoice ? fmtDur(a.durationSec) : a.name}
                </span>
              </div>
            )}
            {(uploading || failed) && (
              <div
                className={cn(
                  "absolute inset-0 flex items-center justify-center rounded-xl",
                  failed ? "bg-accent/60" : "bg-black/40",
                )}
              >
                {failed ? (
                  <X className="h-5 w-5 text-white" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => onRemove(a.localId)}
              className="absolute -right-1.5 -top-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-surface-3 text-faint ring-2 ring-surface-2 transition-colors hover:text-ink"
              aria-label={`Remove ${a.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Inline voice recorder. Idle: a mic button. Recording: an overlay bar (timer +
 * cancel + stop) that fills the surrounding `relative` footer. On stop it hands
 * back the recorded Blob + duration so the composer can upload it.
 */
export function VoiceRecorder({
  onComplete,
  accent = "chat",
}: {
  onComplete: (blob: Blob, durationSec: number) => void;
  accent?: "chat" | "email";
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [denied, setDenied] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef(0);
  const cancelledRef = useRef(false);

  // Stop a recording in progress + release the mic/timer if we unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recRef.current && recRef.current.state !== "inactive") {
        cancelledRef.current = true;
        recRef.current.stop();
      }
    };
  }, []);

  async function start() {
    setDenied(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      cancelledRef.current = false;
      mr.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        const dur = Math.max(1, Math.round((Date.now() - startRef.current) / 1000));
        setRecording(false);
        setElapsed(0);
        if (!cancelledRef.current && chunksRef.current.length) {
          onComplete(
            new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" }),
            dur,
          );
        }
      };
      recRef.current = mr;
      startRef.current = Date.now();
      mr.start();
      setRecording(true);
      timerRef.current = setInterval(
        () => setElapsed(Math.round((Date.now() - startRef.current) / 1000)),
        250,
      );
    } catch {
      setDenied(true);
    }
  }

  function stop(cancel: boolean) {
    cancelledRef.current = cancel;
    recRef.current?.stop();
  }

  if (!recording) {
    return (
      <button
        type="button"
        onClick={start}
        title={denied ? "Microphone permission denied" : "Record voice message"}
        className={cn(
          "flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-faint transition-colors hover:bg-surface-2 hover:text-ink",
          denied && "text-accent",
        )}
        aria-label="Record voice message"
      >
        <Mic className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div className="absolute inset-0 z-10 flex items-center gap-3 bg-canvas px-4">
      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent" />
      <span className="text-subhead font-semibold tabular-nums text-ink-strong">
        {fmtDur(elapsed)}
      </span>
      <span className="text-footnote text-faint">Recording…</span>
      <button
        type="button"
        onClick={() => stop(true)}
        className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-faint hover:bg-surface-2 hover:text-accent"
        aria-label="Cancel recording"
      >
        <Trash2 className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={() => stop(false)}
        className={cn(
          "flex h-[42px] w-[42px] items-center justify-center rounded-full text-white",
          accent === "email" ? "bg-email" : "bg-chat",
        )}
        aria-label="Send voice message"
      >
        <Send className="h-5 w-5" />
      </button>
    </div>
  );
}

/**
 * Native-style "+" attach menu: a plus button (rotates to ×) that pops a small
 * tray of capsule pills — Photos and Files — mirroring the iOS compose "+".
 * Both route into the same processing/upload pipeline as drag-drop/paste.
 */
export function AttachMenu({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [open, setOpen] = useState(false);
  const photosRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) onFiles(files);
    e.target.value = "";
    setOpen(false);
  };

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Add attachment"
        className="flex h-[42px] w-[42px] items-center justify-center rounded-full text-faint transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <Plus
          className={cn(
            "h-[22px] w-[22px] transition-transform duration-200",
            open && "rotate-45 text-accent",
          )}
        />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-[calc(100%+8px)] left-0 z-50 flex gap-2">
            <AttachPill label="Photos" onClick={() => photosRef.current?.click()} />
            <AttachPill label="Files" onClick={() => filesRef.current?.click()} />
          </div>
        </>
      )}
      <input
        ref={photosRef}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={pick}
      />
      <input ref={filesRef} type="file" multiple hidden onChange={pick} />
    </div>
  );
}

export function AttachPill({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="whitespace-nowrap rounded-full border border-line-strong bg-surface-2 px-4 py-2 text-footnote font-medium text-ink shadow-lg transition-colors hover:bg-surface-3"
    >
      {label}
    </button>
  );
}

/** A paperclip button that opens a hidden multi-file picker. */
export function AttachButton({
  onFiles,
  accept,
}: {
  onFiles: (files: File[]) => void;
  accept?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-faint transition-colors hover:bg-surface-2 hover:text-ink"
        aria-label="Attach files"
      >
        <Paperclip className="h-5 w-5" />
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
    </>
  );
}
