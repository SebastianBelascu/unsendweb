"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, isToday, isYesterday } from "date-fns";
import {
  ArrowLeft,
  FileText,
  Loader2,
  Paperclip,
  SendHorizontal,
  SmilePlus,
} from "lucide-react";
import { Avatar } from "./Avatar";
import { EmailBody } from "./EmailBody";
import { cn } from "@/lib/utils";
import { isOwnMessage } from "@/lib/identity";
import { useSession } from "@/lib/api/account";
import {
  fetchMessageHtml,
  markThreadSeen,
  useReactToMessage,
  useRemoveReaction,
  useSendMessage,
  useThreadMessages,
} from "@/lib/api/messages";
import type { MailAttachment, MailMessage } from "@/lib/types";

const ME = { name: "You" };
const QUICK_EMOJIS = ["❤️", "😂", "😮", "😢", "😠", "👍"];
const URL_RE = /(https?:\/\/[^\s]+)/g;
const IMG_RE = /\.(jpg|jpeg|png|gif|bmp|webp|heic|heif|tiff|tif)$/i;
const VID_RE = /\.(mp4|mov|avi|mkv|wmv|flv|3gp|m4v)$/i;

function stripRe(subject: string): string {
  return subject.replace(/^\s*(re|fwd|fw)\s*:\s*/i, "").trim();
}

function fileKind(a: MailAttachment): "image" | "video" | "voice" | "file" {
  const fn = (a.filename || "").toLowerCase();
  const t = (a.type || "").toLowerCase();
  if (a.durationSec != null || /\.m4a$/.test(fn) || t.startsWith("audio"))
    return "voice";
  if (t.startsWith("image") || IMG_RE.test(fn)) return "image";
  if (t.startsWith("video") || VID_RE.test(fn)) return "video";
  return "file";
}

function formatDur(s?: number): string {
  if (!s || s < 0) return "";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec < 10 ? "0" : ""}${sec}`;
}

function dayLabel(d: Date): string {
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMM d, yyyy");
}

function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a
            key={i}
            href={p}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
            onClick={(e) => e.stopPropagation()}
          >
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}

function Attachments({ attachments }: { attachments: MailAttachment[] }) {
  const images = attachments.filter((a) => fileKind(a) === "image" && a.url);
  const rest = attachments.filter((a) => fileKind(a) !== "image");
  return (
    <div className="flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
      {images.length > 0 && (
        <div className={cn("grid gap-1", images.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
          {images.map((a) => (
            <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.url}
                alt={a.filename}
                className="max-h-[280px] w-full rounded-lg object-cover"
              />
            </a>
          ))}
        </div>
      )}
      {rest.map((a) => {
        const k = fileKind(a);
        if (k === "video")
          return (
            <video key={a.id} src={a.url} controls className="max-h-[280px] w-full rounded-lg" />
          );
        if (k === "voice")
          return (
            <div key={a.id} className="flex items-center gap-2">
              <audio src={a.url} controls className="h-9 max-w-[240px]" />
              {a.durationSec ? (
                <span className="text-[11px] opacity-70">{formatDur(a.durationSec)}</span>
              ) : null}
            </div>
          );
        return (
          <a
            key={a.id}
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg bg-black/20 px-3 py-2 text-[13px] hover:bg-black/30"
          >
            <Paperclip className="h-4 w-4 shrink-0" />
            <span className="max-w-[200px] truncate">{a.filename}</span>
            {a.sizeLabel && <span className="opacity-70">· {a.sizeLabel}</span>}
          </a>
        );
      })}
    </div>
  );
}

function ReactionChips({
  message,
  isOwn,
  myUserId,
  onToggle,
}: {
  message: MailMessage;
  isOwn: boolean;
  myUserId?: string;
  onToggle: (emoji: string) => void;
}) {
  const reactions = message.reactions ?? [];
  if (reactions.length === 0) return null;
  const unique: string[] = [];
  for (const r of reactions) if (!unique.includes(r.emoji)) unique.push(r.emoji);
  const mine = new Set(
    reactions.filter((r) => r.byUserId && r.byUserId === myUserId).map((r) => r.emoji),
  );
  return (
    <div className={cn("mt-0.5 flex flex-wrap gap-1", isOwn ? "justify-end" : "justify-start")}>
      {unique.slice(0, 3).map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(emoji);
          }}
          className={cn(
            "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[12px]",
            mine.has(emoji)
              ? "border-link/50 bg-link/15"
              : "border-line-strong bg-surface-2",
          )}
        >
          <span>{emoji}</span>
          {reactions.length > 1 && (
            <span className="text-[10px] text-faint">
              {reactions.filter((r) => r.emoji === emoji).length}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function OriginalOverlay({
  message,
  onClose,
}: {
  message: MailMessage;
  onClose: () => void;
}) {
  const [html, setHtml] = useState<string | null>(message.html ?? null);
  const [loading, setLoading] = useState(!message.html);

  useEffect(() => {
    if (message.html) return;
    let active = true;
    fetchMessageHtml(message.id)
      .then((h) => {
        if (active) {
          setHtml(h);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [message]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[14px] font-semibold text-muted hover:bg-surface hover:text-ink"
        >
          <ArrowLeft className="h-5 w-5" /> View summarized
        </button>
      </header>
      <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex justify-center p-10 text-faint">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : html ? (
          <EmailBody html={html} />
        ) : (
          <div className="p-10 text-center text-sm text-faint">
            Original email is unavailable.
          </div>
        )}
      </div>
    </div>
  );
}

function Bubble({
  message,
  replied,
  isOwn,
  isEmail,
  showAvatar,
  showName,
  isGroup,
  showTime,
  myUserId,
  reactOpen,
  onToggleTime,
  onSeeOriginal,
  onOpenReact,
  onPickEmoji,
  onToggleReaction,
}: {
  message: MailMessage;
  replied?: MailMessage;
  isOwn: boolean;
  isEmail: boolean;
  showAvatar: boolean;
  showName: boolean;
  isGroup: boolean;
  showTime: boolean;
  myUserId?: string;
  reactOpen: boolean;
  onToggleTime: () => void;
  onSeeOriginal: (m: MailMessage) => void;
  onOpenReact: () => void;
  onPickEmoji: (emoji: string) => void;
  onToggleReaction: (emoji: string) => void;
}) {
  const ownColor = isEmail ? "bg-email text-white" : "bg-chat text-white";
  const text = message.text?.trim();
  const atts = message.attachments ?? [];
  const canSeeOriginal = isEmail && !isOwn && message.hasHtml;

  return (
    <div
      className={cn("group flex items-end gap-2", isOwn ? "flex-row-reverse" : "flex-row")}
    >
      {!isOwn &&
        (showAvatar ? (
          <Avatar
            name={message.from.name}
            seed={message.from.address}
            isEmail={isEmail}
            size={28}
            showBadge={false}
          />
        ) : (
          <span className="w-7 shrink-0" />
        ))}

      <div className={cn("flex max-w-[78%] flex-col", isOwn ? "items-end" : "items-start")}>
        {!isOwn && (isGroup || isEmail) && showName && (
          <span className="mb-0.5 ml-1 block text-[13px] text-muted">
            {message.from.name}
          </span>
        )}

        {replied && (
          <div
            className={cn(
              "mb-0.5 max-w-full rounded-lg border-l-2 border-line-strong bg-surface-2 px-2 py-1 text-[12px] text-muted",
              isOwn ? "self-end" : "self-start",
            )}
          >
            <span className="font-semibold text-faint">{replied.from.name}: </span>
            <span className="line-clamp-1">
              {replied.text?.trim() || (replied.attachments?.length ? "📎 attachment" : "…")}
            </span>
          </div>
        )}

        <div className="flex items-center gap-1">
          {/* React button (left of own bubble / right of other) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenReact();
            }}
            className={cn(
              "rounded-full p-1 text-faint opacity-0 transition-opacity hover:text-ink group-hover:opacity-100",
              isOwn ? "order-first" : "order-last",
            )}
            aria-label="React"
          >
            <SmilePlus className="h-4 w-4" />
          </button>

          <div
            role="button"
            tabIndex={0}
            onClick={onToggleTime}
            className={cn(
              "relative cursor-pointer rounded-[18px] px-3 py-2 text-[15px] leading-snug",
              isOwn ? ownColor : "bg-surface-3 text-ink",
            )}
          >
            {atts.length > 0 && (
              <div className={cn(text ? "mb-2" : "")}>
                <Attachments attachments={atts} />
              </div>
            )}
            {text ? <Linkified text={text} /> : null}
            {!text && atts.length === 0 && (
              <span className="opacity-70">{isEmail ? "📧" : "—"}</span>
            )}

            {reactOpen && (
              <div
                className="absolute bottom-full z-20 mb-1 flex gap-1 rounded-full border border-line-strong bg-surface-2 px-2 py-1 shadow-lg"
                onClick={(e) => e.stopPropagation()}
              >
                {QUICK_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onPickEmoji(emoji)}
                    className="text-[18px] hover:scale-125"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <ReactionChips
          message={message}
          isOwn={isOwn}
          myUserId={myUserId}
          onToggle={onToggleReaction}
        />

        {canSeeOriginal && (
          <button
            type="button"
            onClick={() => onSeeOriginal(message)}
            className={cn(
              "mt-0.5 flex items-center gap-1 px-1 text-[11px] font-semibold text-link hover:underline",
              isOwn ? "self-end" : "self-start",
            )}
          >
            <FileText className="h-3 w-3" /> See original
          </button>
        )}

        {showTime && (
          <span className={cn("mt-0.5 block px-1 text-[10px] text-faint", isOwn ? "text-right" : "text-left")}>
            {format(new Date(message.date), "h:mm a")}
          </span>
        )}
      </div>
    </div>
  );
}

function InfoRow({ message }: { message: MailMessage }) {
  const text = (message.text ?? "").replace(/^GROUP-PLACEHOLDER:/, "").trim();
  return <div className="my-1 text-center text-[12px] text-faint">{text || "—"}</div>;
}

export function ConversationView({
  id,
  isEmail,
  title,
  subject,
  topicId,
  recipientAddress,
  isGroup = false,
}: {
  id: string;
  isEmail: boolean;
  title: string;
  subject?: string;
  topicId?: string;
  recipientAddress?: string;
  isGroup?: boolean;
}) {
  const { data: fetched = [], isLoading, isError } = useThreadMessages(id);
  const { data: me } = useSession();
  const username = me?.username;
  const myUserId = me?.userId;
  const sendMsg = useSendMessage();
  const react = useReactToMessage(id);
  const unreact = useRemoveReaction(id);
  const qc = useQueryClient();
  const [sent, setSent] = useState<MailMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [original, setOriginal] = useState<MailMessage | null>(null);
  const [shownTimeId, setShownTimeId] = useState<string | null>(null);
  const [reactOpenId, setReactOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    markThreadSeen(id)
      .then(() => {
        qc.invalidateQueries({ queryKey: ["threads"] });
        qc.invalidateQueries({ queryKey: ["chatThreads"] });
      })
      .catch(() => {});
  }, [id, qc]);

  const messages = useMemo(() => [...fetched, ...sent], [fetched, sent]);

  const byHeaderId = useMemo(() => {
    const m = new Map<string, MailMessage>();
    for (const x of messages) if (x.headerId) m.set(x.headerId, x);
    return m;
  }, [messages]);

  const rows = useMemo(() => {
    const senderKey = (m: MailMessage) => m.from.address || m.from.name;
    return messages.map((m, i) => {
      const prev = messages[i - 1];
      const isOwn = isOwnMessage(m, username);
      const senderChanged = !prev || senderKey(prev) !== senderKey(m);
      const dayChanged =
        !prev ||
        new Date(prev.date).toDateString() !== new Date(m.date).toDateString();
      return { m, isOwn, showAvatar: senderChanged, showName: senderChanged, dayChanged };
    });
  }, [messages, username]);

  const lastInbound = useMemo(
    () => [...fetched].reverse().find((m) => !isOwnMessage(m, username)),
    [fetched, username],
  );
  const recipient =
    recipientAddress || lastInbound?.from.address || lastInbound?.from.name;

  function send() {
    const text = draft.trim();
    if (!text) return;
    setSent((cur) => [
      ...cur,
      {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `local-${cur.length}`,
        from: ME,
        to: [],
        date: new Date().toISOString(),
        outbound: true,
        text,
      },
    ]);
    setDraft("");
    sendMsg.mutate({
      text,
      isEmail,
      isChat: !isEmail,
      subject: isEmail && subject ? `Re: ${stripRe(subject)}` : undefined,
      topicId,
      threadId: id,
      toList: recipient ? [{ address: recipient }] : [],
    });
  }

  function toggleReaction(m: MailMessage, emoji: string) {
    const mine = (m.reactions ?? []).find(
      (r) => r.emoji === emoji && r.byUserId && r.byUserId === myUserId,
    );
    if (mine && m.headerId) {
      unreact.mutate({ headerId: m.headerId, reactionId: mine.id });
    } else {
      react.mutate({ messageId: m.id, emoji });
    }
  }

  const backHref = isEmail ? "/mail/inbox" : "/chat";

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-line px-6 py-3">
        <Link
          href={backHref}
          className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-ink lg:hidden"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Avatar name={title} seed={recipientAddress || title} isEmail={isEmail} size={36} />
        <div className="min-w-0">
          <div className="truncate text-[16px] font-bold text-ink-strong">{title}</div>
          {isEmail ? (
            <div className="truncate text-[12px] text-faint">Email thread</div>
          ) : isGroup ? (
            <div className="truncate text-[12px] text-faint">Group chat</div>
          ) : null}
        </div>
      </header>

      <div
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-6 py-4"
        onClick={() => {
          if (reactOpenId) setReactOpenId(null);
        }}
      >
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center text-faint">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted">
            Couldn&apos;t load this conversation.
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-sm text-faint">
            No messages yet.
          </div>
        ) : (
          rows.map(({ m, isOwn, showAvatar, showName, dayChanged }) => (
            <div key={m.id}>
              {dayChanged && (
                <div className="my-2 text-center text-[11px] font-semibold uppercase tracking-wide text-faint">
                  {dayLabel(new Date(m.date))}
                </div>
              )}
              {m.isInfoMessage ? (
                <InfoRow message={m} />
              ) : (
                <Bubble
                  message={m}
                  replied={m.replyTo ? byHeaderId.get(m.replyTo) : undefined}
                  isOwn={isOwn}
                  isEmail={isEmail}
                  showAvatar={showAvatar}
                  showName={showName}
                  isGroup={isGroup}
                  showTime={shownTimeId === m.id}
                  myUserId={myUserId}
                  reactOpen={reactOpenId === m.id}
                  onToggleTime={() =>
                    setShownTimeId((cur) => (cur === m.id ? null : m.id))
                  }
                  onSeeOriginal={setOriginal}
                  onOpenReact={() =>
                    setReactOpenId((cur) => (cur === m.id ? null : m.id))
                  }
                  onPickEmoji={(emoji) => {
                    toggleReaction(m, emoji);
                    setReactOpenId(null);
                  }}
                  onToggleReaction={(emoji) => toggleReaction(m, emoji)}
                />
              )}
            </div>
          ))
        )}
      </div>

      <footer className="flex items-center gap-2 border-t border-line px-4 py-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={isEmail ? "Reply…" : "Message"}
          className="h-[42px] flex-1 rounded-full border border-line-strong bg-canvas px-4 text-[15px] text-ink-strong outline-none placeholder:text-faint focus:border-muted"
        />
        <button
          type="button"
          onClick={send}
          disabled={!draft.trim()}
          className={cn(
            "flex h-[42px] w-[42px] items-center justify-center rounded-full text-white transition-colors",
            !draft.trim()
              ? "cursor-not-allowed bg-surface-2 text-faint"
              : isEmail
                ? "bg-email hover:opacity-90"
                : "bg-chat hover:opacity-90",
          )}
          aria-label="Send"
        >
          <SendHorizontal className="h-5 w-5" />
        </button>
      </footer>

      {original && (
        <OriginalOverlay message={original} onClose={() => setOriginal(null)} />
      )}
    </div>
  );
}
