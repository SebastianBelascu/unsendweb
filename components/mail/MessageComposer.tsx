"use client";

import { useEffect, useState } from "react";
import { SendHorizontal, X } from "lucide-react";
import {
  AttachButton,
  AttachmentTray,
  VoiceRecorder,
  type ComposerAttachments,
} from "./attachments";
import { clearDraft, loadDraft, saveDraft } from "@/lib/drafts";
import { cn } from "@/lib/utils";
import type { MailMessage } from "@/lib/types";

/**
 * Isolated message composer. Owns the `draft` locally so typing NEVER
 * re-renders the message list (WhatsApp-smooth). The parent keeps attachments,
 * editing + reply state and the actual send logic (via onSubmit).
 */
export function MessageComposer({
  threadId,
  isEmail,
  att,
  editing,
  replyingTo,
  onSubmit,
  onCancelEdit,
  onCancelReply,
  emitTyping,
}: {
  threadId: string;
  isEmail: boolean;
  att: ComposerAttachments;
  editing: { id: string; text: string } | null;
  replyingTo: MailMessage | null;
  onSubmit: (text: string) => void;
  onCancelEdit: () => void;
  onCancelReply: () => void;
  emitTyping: (typing: boolean) => void;
}) {
  const [draft, setDraft] = useState("");

  // Load the saved draft on thread change; load the message text when entering
  // edit mode, and restore the saved draft when leaving it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(editing ? editing.text : loadDraft(threadId));
  }, [threadId, editing]);

  const attachments = att.readyDtos();
  const canSend = editing
    ? draft.trim().length > 0
    : (draft.trim().length > 0 || attachments.length > 0) && !att.uploading;

  function onChange(v: string) {
    setDraft(v);
    if (!editing) saveDraft(threadId, v);
    emitTyping(v.trim().length > 0);
  }

  function handleSend() {
    const text = draft.trim();
    if (editing) {
      if (!text) return;
      onSubmit(text); // parent edits + clears editing → effect restores draft
      emitTyping(false);
      return;
    }
    if (!canSend) return;
    onSubmit(text);
    setDraft("");
    clearDraft(threadId);
    emitTyping(false);
  }

  const accent = isEmail ? "email" : "chat";

  return (
    <div className="border-t border-line">
      {(replyingTo || editing) && (
        <div className="flex items-center gap-2 px-4 pt-2.5 text-caption">
          <div
            className={cn(
              "min-w-0 flex-1 border-l-2 pl-2",
              editing ? "border-email" : "border-chat-light",
            )}
          >
            <div className="font-semibold text-faint">
              {editing ? "Editing message" : `Replying to ${replyingTo?.from.name}`}
            </div>
            <div className="truncate text-faint">
              {editing
                ? editing.text
                : replyingTo?.text?.trim() ||
                  (replyingTo?.attachments?.length ? "📎 attachment" : "…")}
            </div>
          </div>
          <button
            type="button"
            onClick={() => (editing ? onCancelEdit() : onCancelReply())}
            className="shrink-0 rounded-full p-1 text-faint hover:bg-surface-2 hover:text-ink"
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <AttachmentTray items={att.pending} onRemove={att.remove} />

      <footer className="relative flex items-center gap-1 px-3 py-3">
        <AttachButton onFiles={att.addFiles} />
        <input
          value={draft}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={isEmail ? "Reply…" : "Message"}
          className="h-[42px] flex-1 rounded-pill border border-line-strong bg-surface-2 px-4 text-body text-ink-strong outline-none transition-colors placeholder:text-faint focus:border-muted"
        />
        {editing || canSend || draft.trim() ? (
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className={cn(
              "flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-white transition-colors",
              !canSend
                ? "cursor-not-allowed bg-surface-2 text-faint"
                : isEmail
                  ? "bg-email hover:opacity-90"
                  : "bg-chat hover:opacity-90",
            )}
            aria-label="Send"
          >
            <SendHorizontal className="h-5 w-5" />
          </button>
        ) : (
          <VoiceRecorder onComplete={att.addVoice} accent={accent} />
        )}
      </footer>
    </div>
  );
}
