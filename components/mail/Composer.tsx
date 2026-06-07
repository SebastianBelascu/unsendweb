"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Send } from "lucide-react";
import { RecipientInput, type Recipient } from "./RecipientInput";
import { cn } from "@/lib/utils";
import { useSendMessage } from "@/lib/api/messages";

export interface ComposerInitial {
  mode: "new" | "reply" | "replyAll" | "forward";
  to: string;
  cc: string;
  subject: string;
  body: string;
  isEmail: boolean;
  threadId?: string;
  topicId?: string;
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

export function Composer({ initial }: { initial: ComposerInitial }) {
  const [isEmail, setIsEmail] = useState(initial.isEmail);
  const [toR, setToR] = useState<Recipient[]>(parseRecipients(initial.to));
  const [ccR, setCcR] = useState<Recipient[]>(parseRecipients(initial.cc));
  const [bccR, setBccR] = useState<Recipient[]>([]);
  const [showCcBcc, setShowCcBcc] = useState(ccR.length > 0);
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);

  const send = useSendMessage();
  const canSend = toR.length > 0 && body.trim().length > 0 && !send.isPending;

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
    send.mutate({
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
    });
  }

  if (send.isSuccess) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <CheckCircle2 className={cn("h-12 w-12", isEmail ? "text-email" : "text-chat-light")} />
        <p className="text-[16px] font-semibold text-ink-strong">
          {isEmail ? "Email sent" : "Message sent"}
        </p>
        <Link
          href={isEmail ? "/mail/inbox" : "/chat"}
          className="rounded-full bg-surface-2 px-5 py-2 text-[14px] font-semibold text-ink hover:bg-surface-3"
        >
          Back
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-line px-6 py-4">
        <Link
          href={isEmail ? "/mail/inbox" : "/chat"}
          className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-ink"
          aria-label="Discard and go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-[18px] font-bold text-ink-strong">
          {TITLES[initial.mode]}
        </h1>

        {initial.mode === "new" && (
          <div className="ml-auto flex items-center rounded-full bg-surface-2 p-0.5 text-[13px] font-semibold">
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
            className="self-start px-6 py-2 text-[13px] text-link hover:underline"
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
            <span className="w-12 shrink-0 text-[13px] text-faint">Subject</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="w-full bg-transparent text-[15px] text-ink-strong outline-none placeholder:text-faint"
            />
          </label>
        )}

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={isEmail ? "Write your email…" : "Write a message…"}
          className="min-h-[220px] flex-1 resize-none bg-transparent px-6 py-4 text-[15px] leading-relaxed text-ink-strong outline-none placeholder:text-faint"
        />
      </div>

      <footer className="flex items-center gap-3 border-t border-line px-6 py-3">
        {send.isError && (
          <span className="text-[13px] text-accent">
            {(() => {
              const d = (send.error as { data?: { message?: string | string[] } })
                ?.data;
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
            "ml-auto flex items-center gap-2 rounded-full px-5 py-2 text-[14px] font-semibold text-white transition-colors",
            !canSend
              ? "cursor-not-allowed bg-surface-2 text-faint"
              : isEmail
                ? "bg-email hover:opacity-90"
                : "bg-chat hover:opacity-90",
          )}
        >
          {send.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {send.isPending ? "Sending…" : "Send"}
        </button>
      </footer>
    </div>
  );
}
