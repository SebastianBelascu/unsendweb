"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Loader2, Mic, Paperclip, Send, Trash2, X } from "lucide-react";
import { uploadAttachment, type AttachmentDto } from "@/lib/api/attachments";
import type { MailAttachment } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface PendingAttachment {
  localId: string;
  name: string;
  type: string;
  size: number;
  /** Object URL for instant local preview (images/videos). Revoked on remove. */
  previewUrl?: string;
  durationSec?: number;
  isVoice?: boolean;
  progress: number;
  status: "uploading" | "done" | "error";
  dto?: AttachmentDto;
}

let _seq = 0;
const newLocalId = () => `pa-${_seq++}-${Date.now()}`;

/** Manages a pending-attachment tray that uploads each file to S3 as it is added. */
export function useComposerAttachments() {
  const [pending, setPending] = useState<PendingAttachment[]>([]);

  const patch = (localId: string, p: Partial<PendingAttachment>) =>
    setPending((cur) =>
      cur.map((x) => (x.localId === localId ? { ...x, ...p } : x)),
    );

  const startUpload = useCallback((entry: PendingAttachment, file: File) => {
    uploadAttachment(file, {
      placeholder:
        entry.durationSec != null ? String(entry.durationSec) : undefined,
      onProgress: (pct) => patch(entry.localId, { progress: pct }),
    })
      .then((dto) => patch(entry.localId, { status: "done", progress: 100, dto }))
      .catch(() => patch(entry.localId, { status: "error" }));
  }, []);

  const addFiles = useCallback(
    (files: File[]) => {
      for (const file of files) {
        const isImg = file.type.startsWith("image");
        const isVid = file.type.startsWith("video");
        const entry: PendingAttachment = {
          localId: newLocalId(),
          name: file.name || "file",
          type: file.type || "application/octet-stream",
          size: file.size,
          previewUrl: isImg || isVid ? URL.createObjectURL(file) : undefined,
          progress: 0,
          status: "uploading",
        };
        setPending((cur) => [...cur, entry]);
        startUpload(entry, file);
      }
    },
    [startUpload],
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
        name: file.name,
        type,
        size: file.size,
        durationSec,
        isVoice: true,
        progress: 0,
        status: "uploading",
      };
      setPending((cur) => [...cur, entry]);
      startUpload(entry, file);
    },
    [startUpload],
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
  return dtos.map((d, i) => ({
    id: d.id || d.url || `att-${i}`,
    filename: d.title,
    url: d.url,
    type: d.type,
    durationSec:
      d.type.startsWith("audio") && d.placeholder
        ? parseInt(d.placeholder, 10)
        : undefined,
  }));
}

function fmtDur(s?: number): string {
  if (!s || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec < 10 ? "0" : ""}${sec}`;
}

/** Horizontal tray of pending attachments above the composer input. */
export function AttachmentTray({
  items,
  onRemove,
}: {
  items: PendingAttachment[];
  onRemove: (localId: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 px-4 pt-3">
      {items.map((a) => (
        <div
          key={a.localId}
          className="relative flex items-center gap-2 overflow-hidden rounded-lg border border-line-strong bg-surface-2 p-1.5 pr-2"
        >
          {a.previewUrl && a.type.startsWith("image") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={a.previewUrl}
              alt={a.name}
              className="h-10 w-10 rounded object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded bg-surface-3 text-faint">
              {a.isVoice ? <Mic className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
            </div>
          )}
          <div className="min-w-0 max-w-[140px]">
            <div className="truncate text-caption text-ink">
              {a.isVoice ? `Voice · ${fmtDur(a.durationSec)}` : a.name}
            </div>
            <div className="text-micro text-faint">
              {a.status === "error"
                ? "Upload failed"
                : a.status === "uploading"
                  ? `${a.progress}%`
                  : "Ready"}
            </div>
          </div>
          {a.status === "uploading" && (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-faint" />
          )}
          <button
            type="button"
            onClick={() => onRemove(a.localId)}
            className="ml-0.5 shrink-0 rounded-full p-0.5 text-faint hover:bg-surface-3 hover:text-ink"
            aria-label={`Remove ${a.name}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
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
