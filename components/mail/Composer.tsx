"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Send, X } from "lucide-react";
import { RecipientInput, type Recipient } from "./RecipientInput";
import { localPart } from "@/lib/identity";
import {
  AttachButton,
  AttachmentTray,
  VoiceRecorder,
  useComposerAttachments,
} from "./attachments";
import { cn } from "@/lib/utils";
import { clearDraft, loadDraft, saveDraft } from "@/lib/drafts";
import { useForwardMessages, useSendMessage } from "@/lib/api/messages";

export interface ComposerInitial {
  mode: "new" | "reply" | "replyAll" | "forward";
  to: string;
  cc: string;
  subject: string;
  body: string;
  isEmail: boolean;
  threadId?: string;
  topicId?: string;
  /** Message ids to forward (forward mode). */
  forwardMessageIds?: string[];
  /** Snapshots of the forwarded messages, shown as a preview in the modal. */
  forwardPreviews?: { id: string; author: string; text: string }[];
}

const TITLES: Record<ComposerInitial["mode"], string> = {
  new: "New message",
  reply: "Reply",
  replyAll: "Reply all",
  forward: "Forward",
};

function parseRecipients(value: string): Recipient[] {
  return value
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((address) => ({ address }));
}

interface SendResult {
  threadId?: string;
  _id?: string;
  topicId?: string;
  isEmail?: boolean;
  isGroup?: boolean;
  chatName?: string;
  subject?: string;
}

/**
 * Build the conversation URL to land in after a successful send (mirrors the
 * href ThreadCard builds: route segment = the sender's threadId, topicId + the
 * header bits go in the query). Returns null if the response lacks the ids.
 */
function threadUrlFromResponse(data: unknown, toR: Recipient[]): string | null {
  const r = (data ?? {}) as SendResult;
  const threadId = r.threadId ?? r._id;
  const topicId = r.topicId;
  if (!threadId || !topicId) return null;
  const params = new URLSearchParams();
  if (r.isEmail) {
    if (r.subject) params.set("s", r.subject);
    params.set("tid", topicId);
    return `/mail/thread/${threadId}?${params.toString()}`;
  }
  const first = toR[0];
  const name = r.isGroup
    ? r.chatName || r.subject || "Group"
    : first?.name || (first?.address ? localPart(first.address) : "Chat");
  params.set("n", name);
  params.set("t", topicId);
  if (!r.isGroup && first?.address) params.set("a", first.address);
  if (r.isGroup) params.set("g", "1");
  return `/chat/${threadId}?${params.toString()}`;
}

export function Composer({
  initial,
  onClose,
}: {
  initial: ComposerInitial;
  /** When provided, the Composer renders for a modal: an ✕ closes it, and a
   *  successful send closes it too (instead of showing a full success page). */
  onClose?: () => void;
}) {
  const [isEmail, setIsEmail] = useState(initial.isEmail);
  const [toR, setToR] = useState<Recipient[]>(parseRecipients(initial.to));
  const [ccR, setCcR] = useState<Recipient[]>(parseRecipients(initial.cc));
  const [bccR, setBccR] = useState<Recipient[]>([]);
  const [showCcBcc, setShowCcBcc] = useState(ccR.length > 0);
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);

  const draftKey = `compose:${initial.mode}:${
    initial.threadId ?? initial.topicId ?? "new"
  }`;
  // Restore a saved compose body (forward notes aside) once on mount.
  useEffect(() => {
    const saved = loadDraft(draftKey);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setBody(saved);
  }, [draftKey]);

  const router = useRouter();
  const send = useSendMessage();
  const forward = useForwardMessages();
  const att = useComposerAttachments();

  // Best practice: after a successful send, land in the conversation, then close
  // the modal. Falls back to just closing if the response lacks ids.
  function handleSent(data: unknown) {
    const url = threadUrlFromResponse(data, toR);
    if (url) router.push(url);
    onClose?.();
  }

  const fwdIds = initial.forwardMessageIds ?? [];
  const isForward = initial.mode === "forward" && fwdIds.length > 0;
  const canSend = isForward
    ? toR.length > 0 && !att.uploading && !forward.isPending
    : toR.length > 0 &&
      (body.trim().length > 0 || att.readyDtos().length > 0) &&
      !att.uploading &&
      !send.isPending;

  function switchMode(toEmail: boolean) {
    setIsEmail(toEmail);
    if (!toEmail) {
      // Chat has no subject / cc / bcc.
      setCcR([]);
      setBccR([]);
      setSubject("");
      setShowCcBcc(false);
    }
  }

  function onSend() {
    if (!canSend) return;
    const dtos = att.readyDtos();
    clearDraft(draftKey);
    if (isForward) {
      forward.mutate(
        {
          toList: toR,
          ccList: isEmail && ccR.length ? ccR : undefined,
          bccList: isEmail && bccR.length ? bccR : undefined,
          messagesIds: fwdIds,
          subject: isEmail ? subject : undefined,
          text: body.trim() || undefined,
          isEmail,
          isChat: !isEmail,
          isGroup: toR.length > 1,
          topicId: initial.topicId,
          threadId: initial.threadId,
          attachments: dtos.length ? dtos : undefined,
        },
        { onSuccess: handleSent },
      );
      att.clear();
      return;
    }
    send.mutate(
      {
        toList: toR,
        ccList: isEmail && ccR.length ? ccR : undefined,
        bccList: isEmail && bccR.length ? bccR : undefined,
        subject: isEmail ? subject : undefined,
        text: body,
        isEmail,
        isChat: !isEmail,
        isGroup: toR.length > 1,
        threadId: initial.threadId,
        topicId: initial.topicId,
        attachments: dtos.length ? dtos : undefined,
      },
      { onSuccess: handleSent },
    );
    att.clear();
  }

  if (!onClose && (send.isSuccess || forward.isSuccess)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <CheckCircle2 className={cn("h-12 w-12", isEmail ? "text-email" : "text-chat-light")} />
        <p className="text-callout font-semibold text-ink-strong">
          {forward.isSuccess ? "Forwarded" : isEmail ? "Email sent" : "Message sent"}
        </p>
        <Link
          href={isEmail ? "/mail/inbox" : "/chat"}
          className="rounded-full bg-surface-2 px-5 py-2 text-subhead font-semibold text-ink hover:bg-surface-3"
        >
          Back
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-line px-6 py-4">
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-ink"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        ) : (
          <Link
            href={isEmail ? "/mail/inbox" : "/chat"}
            className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-ink"
            aria-label="Discard and go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        )}
        <h1 className="text-headline font-bold text-ink-strong">
          {TITLES[initial.mode]}
        </h1>

        {initial.mode === "new" && (
          <div className="ml-auto flex items-center rounded-full bg-surface-2 p-0.5 text-footnote font-semibold">
            <button
              type="button"
              onClick={() => switchMode(false)}
              className={cn("rounded-full px-3 py-1", !isEmail ? "bg-chat text-white" : "text-muted")}
            >
              Chat
            </button>
            <button
              type="button"
              onClick={() => switchMode(true)}
              className={cn("rounded-full px-3 py-1", isEmail ? "bg-email text-black" : "text-muted")}
            >
              Email
            </button>
          </div>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {isForward && (
          <div className="mx-6 mt-3 rounded-card border border-line-strong bg-surface-card px-3 py-2">
            <div className="text-footnote text-muted">
              Forwarding {fwdIds.length} message{fwdIds.length > 1 ? "s" : ""}. Add
              recipients{isEmail ? "" : " and an optional note"} below.
            </div>
            {initial.forwardPreviews && initial.forwardPreviews.length > 0 && (
              <div className="mt-2 flex max-h-40 flex-col gap-1.5 overflow-y-auto">
                {initial.forwardPreviews.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-lg border-l-2 border-line-strong bg-surface-2 px-2 py-1 text-caption"
                  >
                    <span className="font-semibold text-faint">{p.author}: </span>
                    <span className="text-muted line-clamp-2">{p.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <RecipientInput
          label="To"
          value={toR}
          onChange={setToR}
          allowFreeText={isEmail}
          autoFocus
        />

        {isEmail && !showCcBcc && (
          <button
            type="button"
            onClick={() => setShowCcBcc(true)}
            className="self-start px-6 py-2 text-footnote text-link hover:underline"
          >
            Add Cc / Bcc
          </button>
        )}

        {isEmail && showCcBcc && (
          <>
            <RecipientInput label="Cc" value={ccR} onChange={setCcR} allowFreeText />
            <RecipientInput label="Bcc" value={bccR} onChange={setBccR} allowFreeText />
          </>
        )}

        {isEmail && (
          <label className="flex items-center gap-3 border-b border-line px-6 py-3">
            <span className="w-12 shrink-0 text-footnote text-faint">Subject</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="w-full bg-transparent text-body text-ink-strong outline-none placeholder:text-faint"
            />
          </label>
        )}

        <textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            saveDraft(draftKey, e.target.value);
          }}
          placeholder={isEmail ? "Write your email…" : "Write a message…"}
          className="min-h-[220px] flex-1 resize-none bg-transparent px-6 py-4 text-body leading-relaxed text-ink-strong outline-none placeholder:text-faint"
        />
      </div>

      <div className="border-t border-line">
        <AttachmentTray items={att.pending} onRemove={att.remove} />
        <footer className="relative flex items-center gap-3 px-4 py-3">
          <AttachButton onFiles={att.addFiles} />
          <VoiceRecorder
            onComplete={att.addVoice}
            accent={isEmail ? "email" : "chat"}
          />
          {(send.isError || forward.isError) && (
            <span className="text-footnote text-accent">
              {(() => {
                const d = (
                  (isForward ? forward.error : send.error) as {
                    data?: { message?: string | string[] };
                  }
                )?.data;
                const m = d?.message;
                if (typeof m === "string") return m;
                if (Array.isArray(m) && typeof m[0] === "string") return m[0];
                return "Couldn't send.";
              })()}
            </span>
          )}
          <button
            type="button"
            disabled={!canSend}
            onClick={onSend}
            className={cn(
              "ml-auto flex items-center gap-2 rounded-full px-5 py-2 text-subhead font-semibold text-white transition-colors",
              !canSend
                ? "cursor-not-allowed bg-surface-2 text-faint"
                : isEmail
                  ? "bg-email hover:opacity-90"
                  : "bg-chat hover:opacity-90",
            )}
          >
            {send.isPending || forward.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {send.isPending || forward.isPending
              ? isForward
                ? "Forwarding…"
                : "Sending…"
              : isForward
                ? "Forward"
                : "Send"}
          </button>
        </footer>
      </div>
    </div>
  );
}
