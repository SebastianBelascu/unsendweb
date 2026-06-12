"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, SendHorizontal, X } from "lucide-react";
import {
  AttachPill,
  InputAttachments,
  VoiceRecorder,
  type ComposerAttachments,
} from "./attachments";
import { RecipientInput, type Recipient } from "./RecipientInput";
import { MentionPicker } from "./MentionPicker";
import { LinkPreviewBar } from "./LinkPreview";
import { GifPicker } from "./GifPicker";
import {
  activeMentionToken,
  filterMentionParticipants,
  insertMention,
  showEveryoneRow,
  type MentionParticipant,
} from "@/lib/mentions";
import { firstUrl } from "@/lib/api/link-preview";
import {
  clearDraft,
  clearDraftMeta,
  flushDraftToRow,
  hideDraftRow,
  loadDraft,
  loadDraftMeta,
  saveDraft,
  saveDraftMeta,
} from "@/lib/drafts";
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
  mentionParticipants = [],
  supportsEveryone = false,
  compose = false,
  onToggleType,
  onSubmit,
  onCancelEdit,
  onCancelReply,
  emitTyping,
}: {
  threadId: string;
  isEmail: boolean;
  att: ComposerAttachments;
  editing: { id: string; text: string; date?: string } | null;
  replyingTo: MailMessage | null;
  initialTo: Recipient[];
  initialCc?: Recipient[];
  initialBcc?: Recipient[];
  initialSubject?: string;
  mentionParticipants?: MentionParticipant[];
  supportsEveryone?: boolean;
  /** Compose-new mode (empty window): the recipient panel opens by default and
   *  a Chat/Email type toggle is shown. Mirrors native's ComposeView. */
  compose?: boolean;
  /** Shown only in compose mode — switches between chat and email. */
  onToggleType?: (isEmail: boolean) => void;
  onSubmit: (
    text: string,
    recipients?: ComposerRecipients,
    withUrlPreview?: boolean,
  ) => void;
  onCancelEdit: () => void;
  onCancelReply: () => void;
  emitTyping: (typing: boolean) => void;
}) {
  const [draft, setDraft] = useState("");
  // Compose-new opens with the recipient panel already expanded (native parity).
  const [infoOpen, setInfoOpen] = useState(compose);
  const [gifOpen, setGifOpen] = useState(false);
  // Bumped on the Chat/Email toggle to pull focus back to "To" (the toggle
  // button would otherwise hold it, forcing a second click to keep typing).
  const [toFocusToken, setToFocusToken] = useState(0);
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
  // @mention picker state (token being typed + the active row for kbd nav).
  const [mention, setMention] = useState<{ token: string; start: number } | null>(
    null,
  );
  const [mentionIndex, setMentionIndex] = useState(0);
  const pendingCaret = useRef<number | null>(null);
  // URL the user dismissed the preview for (so re-typing a new URL shows again).
  const [linkDismissed, setLinkDismissed] = useState<string | null>(null);
  const previewUrl = editing ? null : firstUrl(draft);
  const showLinkPreview = Boolean(previewUrl) && previewUrl !== linkDismissed;

  const mentionRows = mention
    ? filterMentionParticipants(mention.token, mentionParticipants)
    : [];
  const mentionEveryone = mention
    ? showEveryoneRow(mention.token, supportsEveryone)
    : false;
  const mentionCount = (mentionEveryone ? 1 : 0) + mentionRows.length;
  const mentionOpen = mention !== null && mentionCount > 0 && !editing;

  const toR = toOverride ?? initialTo;
  const ccR = ccOverride ?? initialCc;
  const bccR = bccOverride ?? initialBcc;
  const subj = subjOverride ?? initialSubject;

  // Load the saved draft on thread change; load the message text when entering
  // edit mode, and restore the saved draft when leaving it. Also rehydrate the
  // saved cc/bcc/subject overrides (native DraftEmailMeta).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(editing ? editing.text : loadDraft(threadId));
    if (!editing) {
      const meta = loadDraftMeta(threadId);
      setCcOverride(meta?.cc ?? null);
      setBccOverride(meta?.bcc ?? null);
      setSubjOverride(meta?.subject ?? null);
    }
  }, [threadId, editing]);

  // Persist the cc/bcc/subject overrides as they change (cleared on send/empty).
  useEffect(() => {
    if (editing) return;
    saveDraftMeta(threadId, {
      subject: subjOverride ?? undefined,
      cc: ccOverride ?? undefined,
      bcc: bccOverride ?? undefined,
    });
  }, [threadId, editing, subjOverride, ccOverride, bccOverride]);

  // WhatsApp draft-row behavior: opening the conversation hides its "Draft" badge
  // (the open chat shows its last message); leaving re-surfaces it. Never updates
  // live while typing — saveDraft keeps localStorage current per keystroke.
  useEffect(() => {
    // Compose has no inbox row to surface a "Draft" badge on — skip it.
    if (compose) return;
    hideDraftRow(threadId);
    return () => flushDraftToRow(threadId);
  }, [threadId, compose]);

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

  // Opening a conversation focuses the composer so you can type right away
  // (WhatsApp-web). Desktop only — popping the keyboard on every open is jarring
  // on touch. Runs per thread open (the composer remounts via key={id}).
  useEffect(() => {
    // Compose focuses the "To" field instead (the message comes after picking
    // a recipient), so don't steal focus to the body here.
    if (compose) return;
    if (
      typeof window === "undefined" ||
      !window.matchMedia("(min-width: 1024px)").matches
    )
      return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, [compose]);

  // After inserting a mention we set the caret on the next paint (the textarea
  // is controlled, so we can't move the caret synchronously).
  useEffect(() => {
    if (pendingCaret.current == null || !textareaRef.current) return;
    const c = pendingCaret.current;
    pendingCaret.current = null;
    textareaRef.current.focus();
    textareaRef.current.setSelectionRange(c, c);
  }, [draft]);

  function syncMention(text: string, caret: number) {
    setMention(activeMentionToken(text, caret));
    setMentionIndex(0);
  }

  function applyMention(handle: string) {
    if (!mention) return;
    const caret = textareaRef.current?.selectionStart ?? draft.length;
    const res = insertMention(draft, mention.start, caret, handle);
    setDraft(res.text);
    if (!editing) saveDraft(threadId, res.text);
    pendingCaret.current = res.caret;
    setMention(null);
  }

  function commitActiveMention() {
    if (mentionEveryone && mentionIndex === 0) {
      applyMention("everyone");
      return;
    }
    const p = mentionRows[mentionIndex - (mentionEveryone ? 1 : 0)];
    if (p) applyMention(p.username);
  }

  const attachments = att.readyDtos();
  const canSend = editing
    ? draft.trim().length > 0
    : (draft.trim().length > 0 || attachments.length > 0) &&
      !att.uploading &&
      // Compose-new can't send until at least one recipient is chosen.
      (!compose || toR.length > 0);

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
    onSubmit(
      text,
      { toList: toR, ccList: ccR, bccList: bccR, subject: subj },
      showLinkPreview,
    );
    setDraft("");
    clearDraft(threadId);
    clearDraftMeta(threadId);
    setCcOverride(null);
    setBccOverride(null);
    setSubjOverride(null);
    emitTyping(false);
    setInfoOpen(false);
    setLinkDismissed(null);
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
        <div className="slide-up border-b border-line">
          {/* Compose-new: Chat/Email toggle (native ChatInfoInputs typeToggle). */}
          {compose && onToggleType && (
            <div className="flex items-center gap-1.5 px-6 pb-1 pt-3">
              <button
                type="button"
                onClick={() => {
                  onToggleType(false);
                  setToFocusToken((t) => t + 1);
                }}
                className={cn(
                  "rounded-full px-3 py-1 text-footnote font-semibold transition-colors",
                  !isEmail ? "bg-chat text-white" : "text-muted hover:text-ink",
                )}
              >
                Chat
              </button>
              <button
                type="button"
                onClick={() => {
                  onToggleType(true);
                  setToFocusToken((t) => t + 1);
                }}
                className={cn(
                  "rounded-full px-3 py-1 text-footnote font-semibold transition-colors",
                  isEmail ? "bg-email text-black" : "text-muted hover:text-ink",
                )}
              >
                Email
              </button>
            </div>
          )}
          <RecipientInput
            label="To"
            value={toR}
            onChange={setToOverride}
            allowFreeText={isEmail}
            autoFocus={compose}
            focusToken={compose ? toFocusToken : undefined}
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
          {/* Email → Subject. Compose chat with 2+ recipients → Group name
              (native ChatInfoInputs: "group name:" row). Shares the subject
              field, so the value survives the Chat/Email toggle. */}
          {(isEmail || (compose && toR.length > 1)) && (
            <label className="flex items-center gap-3 border-b border-line px-6 py-2.5">
              <span className="w-12 shrink-0 text-footnote text-faint">
                {isEmail ? "Subject" : "Group"}
              </span>
              <input
                value={subj}
                onChange={(e) => setSubjOverride(e.target.value)}
                placeholder={isEmail ? "Subject" : "Group name (optional)"}
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

      {showLinkPreview && previewUrl && (
        <LinkPreviewBar
          url={previewUrl}
          onDismiss={() => setLinkDismissed(previewUrl)}
        />
      )}

      {mentionOpen && mention && (
        <MentionPicker
          query={mention.token}
          rows={mentionRows}
          showEveryone={mentionEveryone}
          activeIndex={mentionIndex}
          onPick={(p) => applyMention(p.username)}
          onPickEveryone={() => applyMention("everyone")}
        />
      )}

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
        {!editing && (
          <button
            type="button"
            onClick={() => setGifOpen(true)}
            aria-label="Send a GIF"
            title="GIF"
            className="flex h-[42px] w-[34px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-faint transition-colors hover:bg-surface-2 hover:text-ink"
          >
            GIF
          </button>
        )}
        {/* The rounded input field — pending attachments preview as thumbnails
            INSIDE it, above the text you're typing (iMessage-style). */}
        <div className="flex min-w-0 flex-1 flex-col rounded-3xl border border-line-strong bg-surface-2 transition-colors focus-within:border-muted">
          {!editing && (
            <InputAttachments items={att.pending} onRemove={att.remove} />
          )}
          <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => {
            onChange(e.target.value);
            syncMention(
              e.target.value,
              e.target.selectionStart ?? e.target.value.length,
            );
          }}
          onSelect={(e) =>
            syncMention(
              e.currentTarget.value,
              e.currentTarget.selectionStart ?? 0,
            )
          }
          onPaste={onPaste}
          onKeyDown={(e) => {
            if (mentionOpen) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setMentionIndex((i) => Math.min(i + 1, mentionCount - 1));
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setMentionIndex((i) => Math.max(i - 1, 0));
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                commitActiveMention();
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setMention(null);
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={1}
          placeholder={isEmail ? "Reply…" : "Message"}
          className="max-h-[140px] min-h-[42px] w-full resize-none overflow-y-hidden [scrollbar-width:thin] bg-transparent px-4 py-2.5 text-body leading-snug text-ink-strong outline-none placeholder:text-faint"
        />
        </div>
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

      {gifOpen && (
        <GifPicker
          onPick={(file) => att.addFiles([file])}
          onClose={() => setGifOpen(false)}
        />
      )}
    </div>
  );
}
