"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, SendHorizontal, X } from "lucide-react";
import {
  AttachPill,
  AttachmentTray,
  VoiceRecorder,
  type ComposerAttachments,
} from "./attachments";
import { RecipientInput, type Recipient } from "./RecipientInput";
import { clearDraft, loadDraft, saveDraft } from "@/lib/drafts";
import { cn } from "@/lib/utils";
import type { MailMessage } from "@/lib/types";

export interface ComposerRecipients {
  toList: Recipient[];
  ccList: Recipient[];
  bccList: Recipient[];
  subject: string;
}

/**
 * Isolated message composer. Owns the `draft` locally so typing NEVER
 * re-renders the message list (WhatsApp-smooth). The "+" button toggles the
 * native-style info panel — recipients (To / Cc / Bcc), subject, and the
 * attachment pills — so you can edit who you're sending to without leaving the
 * thread. Recipient edits are overrides on top of the thread's defaults; until
 * you touch a field it tracks the live default. Mount with a `key={threadId}`
 * so the overrides reset per conversation.
 */
export function MessageComposer({
  threadId,
  isEmail,
  att,
  editing,
  replyingTo,
  initialTo,
  initialCc = [],
  initialBcc = [],
  initialSubject = "",
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
  initialTo: Recipient[];
  initialCc?: Recipient[];
  initialBcc?: Recipient[];
  initialSubject?: string;
  onSubmit: (text: string, recipients?: ComposerRecipients) => void;
  onCancelEdit: () => void;
  onCancelReply: () => void;
  emitTyping: (typing: boolean) => void;
}) {
  const [draft, setDraft] = useState("");
  const [infoOpen, setInfoOpen] = useState(false);
  // Recipient/subject overrides — null means "track the thread default".
  const [toOverride, setToOverride] = useState<Recipient[] | null>(null);
  const [ccOverride, setCcOverride] = useState<Recipient[] | null>(null);
  const [bccOverride, setBccOverride] = useState<Recipient[] | null>(null);
  const [subjOverride, setSubjOverride] = useState<string | null>(null);
  const [showCcBcc, setShowCcBcc] = useState(
    initialCc.length > 0 || initialBcc.length > 0,
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const photosRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);

  const toR = toOverride ?? initialTo;
  const ccR = ccOverride ?? initialCc;
  const bccR = bccOverride ?? initialBcc;
  const subj = subjOverride ?? initialSubject;

  // Load the saved draft on thread change; load the message text when entering
  // edit mode, and restore the saved draft when leaving it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(editing ? editing.text : loadDraft(threadId));
  }, [threadId, editing]);

  // Auto-grow the textarea to fit its content up to a max height.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const full = el.scrollHeight;
    el.style.height = `${Math.min(full, 140)}px`;
    el.style.overflowY = full > 140 ? "auto" : "hidden";
  }, [draft]);

  // Entering reply/edit → focus the input immediately (caret at the end).
  useEffect(() => {
    if (!replyingTo && !editing) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, [replyingTo, editing]);

  const attachments = att.readyDtos();
  const canSend = editing
    ? draft.trim().length > 0
    : (draft.trim().length > 0 || attachments.length > 0) && !att.uploading;

  function onChange(v: string) {
    setDraft(v);
    if (!editing) saveDraft(threadId, v);
    emitTyping(v.trim().length > 0);
  }

  // Paste an image/file straight from the clipboard → attach it.
  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (editing) return;
    const dt = e.clipboardData;
    if (!dt) return;
    const files: File[] = [];
    for (const item of Array.from(dt.items)) {
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length === 0 && dt.files?.length) {
      files.push(...Array.from(dt.files));
    }
    if (files.length) {
      e.preventDefault();
      att.addFiles(files);
    }
  }

  function pickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length) att.addFiles(files);
    e.target.value = "";
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
    onSubmit(text, { toList: toR, ccList: ccR, bccList: bccR, subject: subj });
    setDraft("");
    clearDraft(threadId);
    emitTyping(false);
    setInfoOpen(false);
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

      {/* "+" info panel: recipients + cc/bcc + subject + attachment pills. */}
      {infoOpen && !editing && (
        <div className="border-b border-line">
          <RecipientInput
            label="To"
            value={toR}
            onChange={setToOverride}
            allowFreeText={isEmail}
          />
          {isEmail && !showCcBcc && (
            <button
              type="button"
              onClick={() => setShowCcBcc(true)}
              className="px-6 py-1.5 text-footnote text-link hover:underline"
            >
              Add Cc / Bcc
            </button>
          )}
          {isEmail && showCcBcc && (
            <>
              <RecipientInput
                label="Cc"
                value={ccR}
                onChange={setCcOverride}
                allowFreeText
              />
              <RecipientInput
                label="Bcc"
                value={bccR}
                onChange={setBccOverride}
                allowFreeText
              />
            </>
          )}
          {isEmail && (
            <label className="flex items-center gap-3 border-b border-line px-6 py-2.5">
              <span className="w-12 shrink-0 text-footnote text-faint">
                Subject
              </span>
              <input
                value={subj}
                onChange={(e) => setSubjOverride(e.target.value)}
                placeholder="Subject"
                className="w-full bg-transparent text-body text-ink-strong outline-none placeholder:text-faint"
              />
            </label>
          )}
          {/* Align the pills with the recipient input column (same w-12 label
              gutter + gap as RecipientInput) so they start where "To"'s value
              starts, not at the far-left edge. */}
          <div className="flex items-center gap-3 px-6 pb-3 pt-2">
            <span className="w-12 shrink-0" aria-hidden />
            <div className="flex gap-2">
              <AttachPill
                label="Photos"
                onClick={() => photosRef.current?.click()}
              />
              <AttachPill label="Files" onClick={() => filesRef.current?.click()} />
            </div>
          </div>
        </div>
      )}

      <AttachmentTray items={att.pending} onRemove={att.remove} />

      <footer className="relative flex items-end gap-1 px-3 py-3">
        <button
          type="button"
          onClick={() => setInfoOpen((v) => !v)}
          aria-label="Recipients and attachments"
          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-faint transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <Plus
            className={cn(
              "h-[22px] w-[22px] transition-transform duration-200",
              infoOpen && "rotate-45 text-accent",
            )}
          />
        </button>
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => onChange(e.target.value)}
          onPaste={onPaste}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={1}
          placeholder={isEmail ? "Reply…" : "Message"}
          className="max-h-[140px] min-h-[42px] flex-1 resize-none overflow-y-hidden [scrollbar-width:thin] rounded-3xl border border-line-strong bg-surface-2 px-4 py-2.5 text-body leading-snug text-ink-strong outline-none transition-colors placeholder:text-faint focus:border-muted"
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
        <input
          ref={photosRef}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={pickFiles}
        />
        <input ref={filesRef} type="file" multiple hidden onChange={pickFiles} />
      </footer>
    </div>
  );
}
