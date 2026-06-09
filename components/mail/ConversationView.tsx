"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { format, isToday, isYesterday } from "date-fns";
import {
  ArrowDown,
  ArrowLeft,
  Ban,
  Check,
  CheckCheck,
  Copy,
  FileText,
  Forward,
  ImagePlus,
  Info,
  Loader2,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Reply,
  SmilePlus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Avatar } from "./Avatar";
import { UserAvatar } from "./UserAvatar";
import { AttachmentGrid } from "./AttachmentGrid";
import { SwipeToReply } from "./SwipeToReply";
import { VoiceMessage } from "./VoiceMessage";
import { CallButtons } from "@/components/calls/CallButtons";
import { EmailBody } from "./EmailBody";
import { MessageComposer } from "./MessageComposer";
import {
  dtosToMailAttachments,
  useComposerAttachments,
} from "./attachments";
import { cn } from "@/lib/utils";
import { isOwnMessage, localPart, MAIL_DOMAIN } from "@/lib/identity";
import { useSession } from "@/lib/api/account";
import {
  useEmitTyping,
  useLastSeen,
  useOnline,
  usePresenceFor,
  useTyping,
} from "@/lib/realtime/hooks";
import {
  fetchMessageHtml,
  markThreadSeen,
  markVoiceListened,
  useMessageActions,
  useReactToMessage,
  useRemoveReaction,
  useSendMessage,
  useThreadMessages,
  type SendMessageInput,
} from "@/lib/api/messages";
import { ApiError } from "@/lib/api/http";
import { useThreadParticipants } from "@/lib/api/threads";
import { markThreadReadInCache } from "@/lib/realtime/threadCache";
import { useComposeModal } from "@/lib/compose-modal";
import { ConfirmDialog } from "./ConfirmDialog";
import { EmojiPicker } from "./EmojiPicker";
import { GroupPanel } from "./GroupPanel";
import { ProfilePanel } from "./ProfilePanel";
import { MessageInfoSheet } from "./MessageInfoSheet";
import { ReactorSheet } from "./ReactorSheet";
import type {
  MailAttachment,
  MailMessage,
  MailReaction,
  ThreadParticipant,
} from "@/lib/types";

const ME = { name: "You" };
const QUICK_EMOJIS = ["❤️", "😂", "😮", "😢", "😠", "👍"];
const URL_RE = /(https?:\/\/[^\s]+)/g;
const IMG_RE = /\.(jpg|jpeg|png|gif|bmp|webp|heic|heif|tiff|tif)$/i;
const VID_RE = /\.(mp4|mov|avi|mkv|wmv|flv|3gp|m4v)$/i;

function stripRe(subject: string): string {
  return subject.replace(/^\s*(re|fwd|fw)\s*:\s*/i, "").trim();
}

function lastSeenLabel(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const days = Math.floor(s / 86400);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return format(new Date(iso), "MMM d");
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

const Attachments = memo(function Attachments({
  attachments,
  messageId,
  isOwn,
}: {
  attachments: MailAttachment[];
  messageId?: string;
  isOwn?: boolean;
}) {
  const listened = useRef(false);
  const media = attachments.filter((a) => {
    const k = fileKind(a);
    return (k === "image" || k === "video") && a.url;
  });
  const rest = attachments.filter((a) => {
    const k = fileKind(a);
    return k !== "image" && k !== "video";
  });

  function onVoicePlay() {
    // Mark inbound voice notes as listened once (the backend dedupes per user).
    if (isOwn || !messageId || listened.current) return;
    listened.current = true;
    markVoiceListened(messageId).catch(() => {});
  }
  return (
    <div className="flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
      {media.length > 0 && <AttachmentGrid media={media} />}
      {rest.map((a) => {
        const k = fileKind(a);
        if (k === "voice")
          return (
            <VoiceMessage
              key={a.id}
              url={a.url}
              durationSec={a.durationSec}
              isOwn={isOwn}
              onPlay={onVoicePlay}
            />
          );
        return (
          <a
            key={a.id}
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg bg-black/20 px-3 py-2 text-footnote hover:bg-black/30"
          >
            <Paperclip className="h-4 w-4 shrink-0" />
            <span className="max-w-[200px] truncate">{a.filename}</span>
            {a.sizeLabel && <span className="opacity-70">· {a.sizeLabel}</span>}
          </a>
        );
      })}
    </div>
  );
});

function ReactionChips({
  message,
  isOwn,
  myUserId,
  onOpen,
}: {
  message: MailMessage;
  isOwn: boolean;
  myUserId?: string;
  onOpen: () => void;
}) {
  const reactions = message.reactions ?? [];
  if (reactions.length === 0) return null;
  const unique: string[] = [];
  for (const r of reactions) if (!unique.includes(r.emoji)) unique.push(r.emoji);
  const mine = new Set(
    reactions.filter((r) => r.byUserId && r.byUserId === myUserId).map((r) => r.emoji),
  );
  const shown = unique.slice(0, 3);
  const extra = unique.length - shown.length;
  return (
    <div className={cn("mt-0.5 flex flex-wrap gap-1", isOwn ? "justify-end" : "justify-start")}>
      {shown.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className={cn(
            "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-caption",
            mine.has(emoji)
              ? "border-link/50 bg-link/15"
              : "border-line-strong bg-surface-2",
          )}
        >
          <span>{emoji}</span>
          {reactions.filter((r) => r.emoji === emoji).length > 1 && (
            <span className="text-micro text-faint">
              {reactions.filter((r) => r.emoji === emoji).length}
            </span>
          )}
        </button>
      ))}
      {extra > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="flex items-center rounded-full border border-line-strong bg-surface-2 px-1.5 py-0.5 text-micro text-faint"
        >
          +{extra}
        </button>
      )}
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
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-subhead font-semibold text-muted hover:bg-surface hover:text-ink"
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

type MsgAction =
  | "reply"
  | "copy"
  | "edit"
  | "forward"
  | "info"
  | "deleteForMe"
  | "deleteForAll";

interface MenuPos {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

function BubbleMenu({
  message,
  isOwn,
  hasText,
  pos,
  onAction,
  onClose,
}: {
  message: MailMessage;
  isOwn: boolean;
  hasText: boolean;
  pos: MenuPos;
  onAction: (a: MsgAction) => void;
  onClose: () => void;
}) {
  const deleted = message.isDeleted;
  const items: { key: MsgAction; label: string; Icon: typeof Reply; danger?: boolean }[] =
    [];
  if (!deleted) {
    // "Message info" first (WhatsApp-style): chat shows seen/delivered rosters,
    // email shows the full From/To/Cc/Bcc headers.
    items.push({ key: "info", label: "Message info", Icon: Info });
    items.push({ key: "reply", label: "Reply", Icon: Reply });
    if (hasText) items.push({ key: "copy", label: "Copy", Icon: Copy });
    items.push({ key: "forward", label: "Forward", Icon: Forward });
    if (isOwn && hasText) items.push({ key: "edit", label: "Edit", Icon: Pencil });
  }
  items.push({ key: "deleteForMe", label: "Delete for me", Icon: Trash2, danger: true });
  if (isOwn && !deleted)
    items.push({ key: "deleteForAll", label: "Unsend for everyone", Icon: Ban, danger: true });

  // Portal + fixed positioning so the menu is never clipped by the scroll
  // container and can flip up/down based on available space (computed by Bubble).
  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[60]"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />
      <div
        style={pos}
        className="fixed z-[61] max-h-[70vh] w-52 overflow-y-auto rounded-2xl border border-line-strong bg-surface-2 py-1.5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            onClick={() => {
              onAction(it.key);
              onClose();
            }}
            className={cn(
              "flex w-full items-center gap-2.5 px-3 py-2 text-left text-footnote hover:bg-surface-3",
              it.danger ? "text-accent" : "text-ink",
            )}
          >
            <it.Icon className="h-4 w-4 shrink-0" />
            {it.label}
          </button>
        ))}
      </div>
    </>,
    document.body,
  );
}

/** WhatsApp-style delivery ticks for an outbound message. */
function StatusTicks({ message }: { message: MailMessage }) {
  if (message.status === "sending")
    return (
      <Loader2 className="h-3 w-3 animate-spin" aria-label="Sending" />
    );
  if (message.isRead)
    return <CheckCheck className="h-3.5 w-3.5 text-link" aria-label="Read" />;
  if (message.isDelivered)
    return <CheckCheck className="h-3.5 w-3.5" aria-label="Delivered" />;
  return <Check className="h-3.5 w-3.5" aria-label="Sent" />;
}

function Bubble({
  message,
  replied,
  isOwn,
  isEmail,
  showAvatar,
  showName,
  isGroup,
  isLastOutbound,
  showTime,
  myUserId,
  reactOpen,
  menuOpen,
  selectMode,
  selected,
  onToggleSelect,
  onToggleTime,
  onSeeOriginal,
  onOpenReact,
  onToggleMenu,
  onAction,
  onPickEmoji,
  onOpenPicker,
  onOpenReactors,
  onRetry,
}: {
  message: MailMessage;
  replied?: MailMessage;
  isOwn: boolean;
  isEmail: boolean;
  showAvatar: boolean;
  showName: boolean;
  isGroup: boolean;
  isLastOutbound: boolean;
  showTime: boolean;
  myUserId?: string;
  reactOpen: boolean;
  menuOpen: boolean;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onToggleTime: () => void;
  onSeeOriginal: (m: MailMessage) => void;
  onOpenReact: () => void;
  onToggleMenu: () => void;
  onAction: (a: MsgAction) => void;
  onPickEmoji: (emoji: string) => void;
  onOpenPicker: () => void;
  onOpenReactors: () => void;
  onRetry: () => void;
}) {
  const actionable = Boolean(message.headerId); // real (sent) message, not in-flight
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPress = () => {
    if (message.isDeleted || !actionable) return;
    pressTimer.current = setTimeout(() => onOpenReact(), 400);
  };
  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };
  useEffect(() => {
    return () => {
      if (pressTimer.current) clearTimeout(pressTimer.current);
    };
  }, []);

  // Position the actions menu: anchored to the bubble, opening toward whichever
  // side has more room (down near the top, up near the bottom). Fixed-positioned
  // via a portal so it's never clipped by the scroll container.
  const bubbleRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  useLayoutEffect(() => {
    if (!menuOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMenuPos(null);
      return;
    }
    // Anchor the menu to the ⋮ button (WhatsApp-style), falling back to the
    // bubble if the trigger isn't the hover button (e.g. opened from the
    // quick-react bar on touch).
    const el = menuBtnRef.current ?? bubbleRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const horizontal = isOwn
      ? { right: Math.max(8, window.innerWidth - r.right) }
      : { left: Math.max(8, r.left) };
    const openDown = window.innerHeight - r.bottom >= r.top;
    setMenuPos(
      openDown
        ? { top: r.bottom + 4, ...horizontal }
        : { bottom: window.innerHeight - r.top + 4, ...horizontal },
    );
  }, [menuOpen, isOwn]);
  // The menu is fixed-positioned; close it if the view scrolls or resizes.
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => onToggleMenu();
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menuOpen, onToggleMenu]);

  const ownColor = isEmail ? "bg-email text-white" : "bg-chat text-white";
  const text = message.text?.trim();
  const atts = message.attachments ?? [];
  const deleted = Boolean(message.isDeleted);
  const canSeeOriginal = isEmail && !isOwn && message.hasHtml && !deleted;
  // Delivery ticks: on the latest sent chat message by default, on any own
  // message you tap (showTime), and whenever a send is in flight/failed.
  const showStatus =
    isOwn &&
    !isEmail &&
    !deleted &&
    (Boolean(message.status) || isLastOutbound || showTime);
  // Only real (sent, non-deleted) messages can be selected for forwarding.
  const selectable = actionable && !deleted;

  return (
    <div
      onClick={selectMode && selectable ? onToggleSelect : undefined}
      className={cn(
        "group flex flex-col rounded-lg",
        selectMode && selectable && "cursor-pointer",
        selected && "bg-accent/10",
      )}
    >
      <SwipeToReply
        enabled={actionable && !deleted && !selectMode}
        isOwn={isOwn}
        onReply={() => onAction("reply")}
      >
      <div
        className={cn(
          "flex items-end gap-2",
          isOwn ? "flex-row-reverse" : "flex-row",
        )}
      >
      {selectMode && (
        <span
          className={cn(
            "mb-1 flex h-5 w-5 shrink-0 items-center justify-center self-end rounded-full border transition-colors",
            !selectable
              ? "border-transparent"
              : selected
                ? "border-accent bg-accent text-white"
                : "border-line-strong text-transparent",
          )}
        >
          <Check className="h-3 w-3" />
        </span>
      )}
      {!isOwn &&
        (showAvatar ? (
          <UserAvatar
            name={message.from.name}
            address={message.from.address}
            isEmail={isEmail}
            size={28}
            showBadge={false}
          />
        ) : (
          <span className="w-7 shrink-0" />
        ))}

      <div className={cn("flex max-w-[75%] flex-col", isOwn ? "items-end" : "items-start")}>
        {!isOwn && (isGroup || isEmail) && showName && (
          <span className="mb-0.5 ml-1 block text-footnote text-muted">
            {message.from.name}
          </span>
        )}

        {replied && !deleted && (
          <div
            className={cn(
              "mb-0.5 flex max-w-[220px] items-stretch gap-1.5 overflow-hidden rounded-[10px] py-1.5 pr-2.5",
              isOwn ? "self-end bg-white/15" : "self-start bg-surface-2",
            )}
          >
            <span
              className={cn(
                "w-[3px] shrink-0 rounded-full",
                isOwn ? "bg-white/70" : "bg-line-strong",
              )}
            />
            <div className="min-w-0 py-px">
              <div
                className={cn(
                  "truncate text-micro font-semibold leading-tight",
                  isOwn ? "text-white" : "text-faint",
                )}
              >
                {replied.from.name}
              </div>
              <div
                className={cn(
                  "truncate text-caption leading-tight",
                  isOwn ? "text-white/70" : "text-muted",
                )}
              >
                {replied.text?.trim() ||
                  (replied.attachments?.length ? "📎 attachment" : "…")}
              </div>
            </div>
          </div>
        )}

        <div className="relative flex items-center gap-1">
          {/* Hover controls — only for real (sent) messages, hidden in select mode. */}
          {actionable && !selectMode && (
            <div
              className={cn(
                "flex items-center gap-0.5 self-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100",
                menuOpen && "opacity-100",
                isOwn ? "order-first" : "order-last",
              )}
            >
              {!deleted && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenReact();
                  }}
                  className="rounded-full p-1 text-faint hover:text-ink"
                  aria-label="React"
                >
                  <SmilePlus className="h-4 w-4" />
                </button>
              )}
              <button
                ref={menuBtnRef}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleMenu();
                }}
                className="rounded-full p-1 text-faint hover:text-ink"
                aria-label="Message actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>
          )}

          <div
            ref={bubbleRef}
            role="button"
            tabIndex={0}
            onClick={selectMode ? undefined : onToggleTime}
            onContextMenu={(e) => {
              if (!actionable || selectMode) return;
              e.preventDefault();
              if (!menuOpen) onToggleMenu();
            }}
            onTouchStart={selectMode ? undefined : startPress}
            onTouchEnd={cancelPress}
            onTouchMove={cancelPress}
            className={cn(
              "relative cursor-pointer rounded-bubble px-3.5 py-2.5 text-body leading-snug",
              deleted
                ? "bg-surface-2 text-faint"
                : isOwn
                  ? ownColor
                  : "bg-surface-3 text-ink",
            )}
          >
            {deleted ? (
              <span className="flex items-center gap-1.5 italic">
                <Ban className="h-3.5 w-3.5 shrink-0" />
                {text || "This message was deleted"}
              </span>
            ) : (
              <>
                {atts.length > 0 && (
                  <div className={cn(text ? "mb-2" : "")}>
                    <Attachments attachments={atts} messageId={message.id} isOwn={isOwn} />
                  </div>
                )}
                {text ? <Linkified text={text} /> : null}
                {!text && atts.length === 0 && (
                  <span className="opacity-70">{isEmail ? "📧" : "—"}</span>
                )}
                {message.edited && (
                  <span className="ml-1.5 align-baseline text-micro opacity-60">
                    (edited)
                  </span>
                )}

                {reactOpen && (
                  <div
                    className={cn(
                      "absolute bottom-full z-20 mb-1 flex items-center gap-1 rounded-full border border-line-strong bg-surface-2 px-2 py-1 shadow-lg",
                      isOwn ? "right-0" : "left-0",
                    )}
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
                    <button
                      type="button"
                      onClick={onOpenPicker}
                      className="ml-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-surface-3 text-faint hover:text-ink"
                      aria-label="More emoji"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    {/* Reach the actions menu (Reply/Forward/…) on touch, where
                        there's no hover affordance for the ⋮ button. */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleMenu();
                      }}
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-3 text-faint hover:text-ink"
                      aria-label="Message actions"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Action menu (fixed-positioned portal, flips up/down by space). */}
          {menuOpen && menuPos && (
            <BubbleMenu
              message={message}
              isOwn={isOwn}
              hasText={Boolean(text)}
              pos={menuPos}
              onAction={onAction}
              onClose={onToggleMenu}
            />
          )}
        </div>
        </div>
      </div>
      </SwipeToReply>

      {/* Meta (reactions / See original / time) BELOW the bubble, aligned under
          it — so the avatar sits next to the bubble, not next to "See original". */}
      <div
        className={cn(
          "flex flex-col",
          isOwn
            ? "items-end"
            : selectMode
              ? "items-start pl-16"
              : "items-start pl-9",
        )}
      >
        {!deleted && (
          <ReactionChips
            message={message}
            isOwn={isOwn}
            myUserId={myUserId}
            onOpen={onOpenReactors}
          />
        )}

        {canSeeOriginal && (
          <button
            type="button"
            onClick={() => onSeeOriginal(message)}
            className="mt-0.5 flex items-center gap-1 px-1 text-micro font-semibold text-link hover:underline"
          >
            <FileText className="h-3 w-3" /> See original
          </button>
        )}

        {!deleted && (message.forwarded || message.isPrivate) && (
          <div className="mt-0.5 flex gap-2 px-1 text-micro text-faint">
            {message.forwarded && <span>↪ Forwarded</span>}
            {message.isPrivate && <span>🔒 Private</span>}
          </div>
        )}

        {(showTime || showStatus) && (
          <span className="mt-0.5 flex items-center gap-1 px-1 text-micro text-faint">
            {showTime && <span>{format(new Date(message.date), "h:mm a")}</span>}
            {showStatus &&
              (message.status === "failed" ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="font-semibold text-accent hover:underline"
                >
                  Failed — tap to retry
                </button>
              ) : (
                <StatusTicks message={message} />
              ))}
          </span>
        )}
      </div>
    </div>
  );
}

function TypingIndicator({ names }: { names: string[] }) {
  const label =
    names.length === 1
      ? `${names[0]} is typing`
      : names.length === 2
        ? `${names[0]} and ${names[1]} are typing`
        : "Several people are typing";
  return (
    <div className="flex items-center gap-2 px-6 pb-1 text-caption text-faint">
      <span className="flex gap-0.5">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-faint [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-faint [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-faint" />
      </span>
      <span className="truncate">{label}</span>
    </div>
  );
}

function InfoRow({ message }: { message: MailMessage }) {
  const text = (message.text ?? "").replace(/^GROUP-PLACEHOLDER:/, "").trim();
  return <div className="my-1 text-center text-caption text-faint">{text || "—"}</div>;
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
  const { data: fetched = [], isLoading, isError, error } = useThreadMessages(id);
  const { data: me } = useSession();
  const username = me?.username;
  const myUserId = me?.userId;

  // Presence (1:1 chat only) + typing.
  const recipientUsername =
    !isEmail && !isGroup && recipientAddress
      ? localPart(recipientAddress)
      : undefined;
  usePresenceFor(recipientUsername ? [recipientUsername] : []);
  const online = useOnline(recipientUsername);
  const lastSeen = useLastSeen(recipientUsername);
  const typingNames = useTyping(topicId);
  const emitTyping = useEmitTyping(topicId);
  const sendMsg = useSendMessage();
  const react = useReactToMessage(id);
  const unreact = useRemoveReaction(id);
  const msgActions = useMessageActions(id);
  const att = useComposerAttachments();
  const qc = useQueryClient();
  const openCompose = useComposeModal((s) => s.open);
  const [sent, setSent] = useState<MailMessage[]>([]);
  const [original, setOriginal] = useState<MailMessage | null>(null);
  const [shownTimeId, setShownTimeId] = useState<string | null>(null);
  const [reactOpenId, setReactOpenId] = useState<string | null>(null);
  const [pickerForId, setPickerForId] = useState<string | null>(null);
  const [reactorsForId, setReactorsForId] = useState<string | null>(null);
  const [infoForId, setInfoForId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [replyingTo, setReplyingTo] = useState<MailMessage | null>(null);
  // Multi-select mode for forwarding several messages at once.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Drag-and-drop file/image attach.
  const [dragging, setDragging] = useState(false);
  const [confirm, setConfirm] = useState<
    { kind: "forMe" | "forAll"; message: MailMessage } | null
  >(null);
  const [groupPanelOpen, setGroupPanelOpen] = useState(false);
  const [profilePanelOpen, setProfilePanelOpen] = useState(false);
  // Email header → tap to reveal the participant list ("& N others" → who).
  const [emailPartsOpen, setEmailPartsOpen] = useState(false);
  // Group name shown in the header. The `title` prop comes from the static nav
  // URL, so an in-place rename wouldn't reflect — track an override that the
  // GroupPanel sets on a successful rename, reset when navigating threads.
  const [renamedTitle, setRenamedTitle] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setRenamedTitle(null), [id]);
  const liveTitle = renamedTitle ?? title;
  // Retry payloads for optimistic messages that failed to send.
  const pendingPayloads = useRef<Map<string, SendMessageInput>>(new Map());
  const localSeq = useRef(0);

  // --- Scroll anchoring (WhatsApp-style: stick to bottom) ---
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const didInitRef = useRef(false);
  const [showJump, setShowJump] = useState(false);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    atBottomRef.current = true;
    setShowJump(false);
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    atBottomRef.current = atBottom;
    setShowJump((cur) => (cur === !atBottom ? cur : !atBottom));
  }, []);

  // New thread → reset anchoring so we jump to the latest message on open.
  useEffect(() => {
    didInitRef.current = false;
    atBottomRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowJump(false);
    setSelectMode(false);
    setSelectedIds(new Set());
  }, [id]);

  // Async content growth (images loading, receipt labels) → re-pin if at bottom.
  useEffect(() => {
    const inner = contentRef.current;
    if (!inner || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const el = scrollRef.current;
      if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!id) return;
    // Clear the unread/bold styling INSTANTLY (the server `seen` write lags, so
    // a refetch would keep it bold for seconds). Fire-and-forget the network.
    markThreadReadInCache(qc, { threadId: id, topicId });
    markThreadSeen(id).catch(() => {});
  }, [id, topicId, qc]);

  // Merge optimistic sends with server data, dropping any optimistic message
  // the server has echoed back — matched EXACTLY by refId (idempotency key) so
  // the optimistic bubble becomes the real one instantly with no duplicate flash.
  const messages = useMemo(() => {
    // Drop reaction reply-messages (isHidden) — they attach to the bubble as a
    // chip, never as their own line (matches iOS/Android native).
    const base = fetched.filter((f) => !f.isHidden);
    if (!sent.length) return base;
    const echoedRefs = new Set(
      base.filter((f) => f.refId).map((f) => f.refId as string),
    );
    const pending = sent.filter((s) => !s.refId || !echoedRefs.has(s.refId));
    return pending.length ? [...base, ...pending] : base;
  }, [fetched, sent]);

  // On first load jump instantly to the latest; afterwards keep pinned to the
  // bottom when the user is already there (runs before paint → no flicker).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!didInitRef.current) {
      if (messages.length) {
        el.scrollTop = el.scrollHeight;
        didInitRef.current = true;
      }
      return;
    }
    if (atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, id]);

  const byHeaderId = useMemo(() => {
    const m = new Map<string, MailMessage>();
    for (const x of messages) if (x.headerId) m.set(x.headerId, x);
    return m;
  }, [messages]);

  const rows = useMemo(() => {
    const senderKey = (m: MailMessage) => m.from.address || m.from.name;
    const base = messages.map((m, i) => {
      const prev = messages[i - 1];
      const isOwn = isOwnMessage(m, username);
      const senderChanged = !prev || senderKey(prev) !== senderKey(m);
      // Collapse consecutive messages from the same sender within 60s into a run.
      const gap = prev ? +new Date(m.date) - +new Date(prev.date) : Infinity;
      const startsRun = senderChanged || gap > 60_000;
      const dayChanged =
        !prev ||
        new Date(prev.date).toDateString() !== new Date(m.date).toDateString();
      return { m, isOwn, startsRun, dayChanged };
    });
    return base.map((r) => ({
      ...r,
      showAvatar: r.startsRun,
      showName: r.startsRun,
    }));
  }, [messages, username]);

  const lastOutboundId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (!m.isInfoMessage && isOwnMessage(m, username)) return m.id;
    }
    return null;
  }, [messages, username]);

  const lastInbound = useMemo(
    () => [...fetched].reverse().find((m) => !isOwnMessage(m, username)),
    [fetched, username],
  );
  const recipient =
    recipientAddress || lastInbound?.from.address || lastInbound?.from.name;

  const currentUserAddress = username ? `${username}${MAIL_DOMAIN}` : undefined;

  // Email header (mirrors native EmailHeader): the "other" participants — the
  // union of every loaded message's from/to/cc/bcc minus me — drive the title
  // and the stacked avatar. Title = the single name, or "<First> & N others";
  // the subject goes on row 2.
  const emailParticipants = useMemo<ThreadParticipant[]>(() => {
    if (!isEmail) return [];
    const me = (currentUserAddress ?? "").toLowerCase();
    const seen = new Set<string>();
    const out: ThreadParticipant[] = [];
    const add = (p?: ThreadParticipant) => {
      const a = p?.address?.toLowerCase();
      if (!p || !a || a === me || seen.has(a)) return;
      seen.add(a);
      out.push(p);
    };
    for (const m of fetched) {
      add(m.from);
      (m.to ?? []).forEach(add);
      (m.cc ?? []).forEach(add);
      (m.bcc ?? []).forEach(add);
    }
    return out;
  }, [isEmail, fetched, currentUserAddress]);

  const emailTitle = useMemo(() => {
    if (!isEmail || emailParticipants.length === 0) return undefined;
    const first = emailParticipants[0];
    const firstName = first.name?.trim() || localPart(first.address ?? "");
    const remaining = emailParticipants.length - 1;
    return remaining === 0 ? firstName : `${firstName} & ${remaining} others`;
  }, [isEmail, emailParticipants]);

  const headerTitle = (isEmail ? emailTitle : undefined) ?? liveTitle;

  // Authoritative group roster from the chat detail (GET /threads/:id). This is
  // what makes externally-created groups (synced from other platforms, with no
  // addressed members in the local message history yet) show their members +
  // avatars — message-derived participants below are only a fallback/supplement.
  const { data: rosterParticipants } = useThreadParticipants(id, isGroup);

  // Group members: the fetched roster, unioned with anyone seen in the
  // conversation (from/to/cc) + self. Addresses drive avatar/photo resolution.
  const groupMembers = useMemo<ThreadParticipant[]>(() => {
    if (!isGroup) return [];
    const map = new Map<string, ThreadParticipant>();
    const add = (p?: ThreadParticipant) => {
      if (!p?.address) return;
      const k = p.address.toLowerCase();
      if (!map.has(k)) map.set(k, { name: p.name, address: p.address });
    };
    rosterParticipants?.forEach(add);
    for (const m of messages) {
      if (m.isInfoMessage) continue;
      add(m.from);
      m.to?.forEach(add);
      m.cc?.forEach(add);
    }
    if (currentUserAddress && !map.has(currentUserAddress.toLowerCase())) {
      const full = [me?.firstName, me?.lastName].filter(Boolean).join(" ").trim();
      map.set(currentUserAddress.toLowerCase(), {
        name: full || username || "You",
        address: currentUserAddress,
      });
    }
    return [...map.values()];
  }, [rosterParticipants, messages, isGroup, currentUserAddress, me, username]);

  function doSend(localId: string, payload: SendMessageInput) {
    pendingPayloads.current.set(localId, payload);
    setSent((cur) =>
      cur.map((m) => (m.id === localId ? { ...m, status: "sending" } : m)),
    );
    sendMsg.mutate(payload, {
      onSuccess: () => {
        pendingPayloads.current.delete(localId);
        // Clear the "sending" tick; the refId dedup drops the optimistic copy
        // the instant the server echo (with the same refId) lands — no flash,
        // no timeout, no duplicate.
        setSent((cur) =>
          cur.map((m) => (m.id === localId ? { ...m, status: undefined } : m)),
        );
      },
      onError: () =>
        setSent((cur) =>
          cur.map((m) => (m.id === localId ? { ...m, status: "failed" } : m)),
        ),
    });
  }

  // Called by MessageComposer with the trimmed text. Edit → PATCH; else send.
  function onSubmit(text: string) {
    if (editing) {
      if (!text) return;
      msgActions.edit.mutate({ messageId: editing.id, text });
      setEditing(null);
      return;
    }

    const dtos = att.readyDtos();
    if (!text && dtos.length === 0) return;
    const replyHeaderId = replyingTo?.headerId;
    const localId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `local-${localSeq.current++}`;
    setSent((cur) => [
      ...cur,
      {
        id: localId,
        refId: localId,
        from: ME,
        to: [],
        date: new Date().toISOString(),
        outbound: true,
        text: text || undefined,
        replyTo: replyHeaderId,
        attachments: dtos.length ? dtosToMailAttachments(dtos) : undefined,
        status: "sending",
      },
    ]);
    att.clear();
    setReplyingTo(null);
    // Groups have no single recipient — address the message to every member
    // (minus me). Without this, the FIRST messages (before anyone has replied,
    // so there's no inbound sender to borrow) go out with an empty toList and the
    // backend rejects them (SendMessageDto.toList is ArrayMinSize(1)) → "Failed".
    const selfAddr = (currentUserAddress ?? "").toLowerCase();
    const groupTo = groupMembers
      .filter((m) => m.address && m.address.toLowerCase() !== selfAddr)
      .map((m) => ({ name: m.name, address: m.address as string }));
    const toList =
      isGroup && groupTo.length
        ? groupTo
        : recipient
          ? [{ address: recipient }]
          : groupTo;
    doSend(localId, {
      refId: localId,
      text,
      attachments: dtos.length ? dtos : undefined,
      isEmail,
      isChat: !isEmail,
      subject: isEmail && subject ? `Re: ${stripRe(subject)}` : undefined,
      topicId,
      threadId: id,
      toList,
      replyTo: replyHeaderId,
    });
  }

  function retryMessage(localId: string) {
    const payload = pendingPayloads.current.get(localId);
    if (payload) doSend(localId, payload);
  }

  function onMessageAction(a: MsgAction, m: MailMessage) {
    switch (a) {
      case "reply":
        setEditing(null);
        setReplyingTo(m);
        break;
      case "copy":
        if (m.text) navigator.clipboard?.writeText(m.text).catch(() => {});
        break;
      case "edit":
        setReplyingTo(null);
        setEditing({ id: m.id, text: m.text ?? "" });
        break;
      case "forward":
        // Enter multi-select with this message picked; the user can add more,
        // then hit Forward in the selection bar.
        setSelectMode(true);
        setSelectedIds(new Set([m.id]));
        break;
      case "info":
        setInfoForId(m.id);
        break;
      case "deleteForMe":
        setConfirm({ kind: "forMe", message: m });
        break;
      case "deleteForAll":
        setConfirm({ kind: "forAll", message: m });
        break;
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function cancelSelect() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  function forwardSelected() {
    // Preserve chronological order; build previews so the modal shows them.
    const picked = messages.filter((m) => selectedIds.has(m.id));
    if (!picked.length) return;
    const fwdSubject =
      isEmail && subject
        ? subject.toLowerCase().startsWith("fwd:")
          ? subject
          : `Fwd: ${subject}`
        : "";
    openCompose({
      mode: "forward",
      forwardMessageIds: picked.map((m) => m.id),
      forwardPreviews: picked.map((m) => ({
        id: m.id,
        author: m.from.name,
        text:
          m.text?.trim() ||
          (m.attachments?.length ? "📎 Attachment" : "…"),
      })),
      topicId,
      isEmail,
      subject: fwdSubject,
    });
    cancelSelect();
  }

  function runDelete() {
    if (!confirm) return;
    const m = confirm.message;
    if (confirm.kind === "forMe") {
      if (m.headerId) msgActions.deleteForMe.mutate([m.headerId]);
      // Local-only optimistic message: just drop it from the unsent list.
      else setSent((cur) => cur.filter((x) => x.id !== m.id));
    } else {
      msgActions.deleteForAll.mutate(m.id);
    }
    setConfirm(null);
  }

  // Optimistically patch one message's reactions in the open thread's cache so
  // the chip appears/disappears instantly (the mutation then reconciles).
  function patchReactions(
    messageId: string,
    update: (rs: MailReaction[]) => MailReaction[],
  ) {
    qc.setQueryData<MailMessage[]>(["messages", id], (list) =>
      list
        ? list.map((msg) =>
            msg.id === messageId
              ? { ...msg, reactions: update(msg.reactions ?? []) }
              : msg,
          )
        : list,
    );
  }

  function toggleReaction(m: MailMessage, emoji: string) {
    // Reactions require a real backend message; skip in-flight optimistic ones.
    if (!m.headerId) return;
    const mine = (m.reactions ?? []).find(
      (r) => r.emoji === emoji && r.byUserId && r.byUserId === myUserId,
    );
    if (mine) {
      patchReactions(m.id, (rs) => rs.filter((r) => r.id !== mine.id));
      unreact.mutate({ headerId: m.headerId, reactionId: mine.id });
    } else {
      patchReactions(m.id, (rs) => [
        ...rs,
        { id: `local-react-${Date.now()}`, emoji, byUserId: myUserId },
      ]);
      react.mutate({ messageId: m.id, emoji });
    }
  }

  const backHref = "/inbox";
  const is1to1 = !isEmail && !isGroup && Boolean(recipientAddress);

  return (
    <div
      className="relative flex h-full flex-col"
      onDragOver={(e) => {
        if (selectMode || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        if (!dragging) setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        if (selectMode) return;
        e.preventDefault();
        setDragging(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) att.addFiles(files);
      }}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-canvas/85 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-accent px-10 py-8 text-accent">
            <ImagePlus className="h-9 w-9" />
            <span className="text-callout font-semibold">Drop to attach</span>
          </div>
        </div>
      )}
      <header className="flex items-center gap-3 border-b border-line px-6 py-3">
        <Link
          href={backHref}
          className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-ink lg:hidden"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        {is1to1 ? (
          <button
            type="button"
            onClick={() => setProfilePanelOpen(true)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
            aria-label="Contact info"
          >
            <UserAvatar
              name={title}
              address={recipientAddress}
              isEmail={isEmail}
              size={36}
              online={Boolean(recipientUsername && online)}
            />
            <div className="min-w-0">
              <div className="truncate text-callout font-bold text-ink-strong">
                {title}
              </div>
              <div className="truncate text-caption text-faint">
                {online ? (
                  <span className="text-email">online</span>
                ) : lastSeen ? (
                  `last seen ${lastSeenLabel(lastSeen)}`
                ) : (
                  `@${recipientUsername}`
                )}
              </div>
            </div>
          </button>
        ) : (
          <>
            {(isGroup && groupMembers.length >= 2) ||
            (isEmail && emailParticipants.length >= 2) ? (
              <UserAvatar
                name={headerTitle}
                people={(isGroup ? groupMembers : emailParticipants).map((m) => ({
                  name: m.name,
                  address: m.address,
                }))}
                isEmail={isEmail}
                size={36}
              />
            ) : isEmail && emailParticipants[0]?.address ? (
              <UserAvatar
                name={headerTitle}
                address={emailParticipants[0].address}
                isEmail
                size={36}
                showBadge={false}
              />
            ) : (
              <Avatar
                name={headerTitle}
                seed={recipientAddress || headerTitle}
                isEmail={isEmail}
                size={36}
                online={Boolean(recipientUsername && online)}
              />
            )}
            <div className="relative min-w-0">
              {isEmail ? (
                <button
                  type="button"
                  onClick={() =>
                    emailParticipants.length && setEmailPartsOpen((v) => !v)
                  }
                  className="block max-w-full text-left"
                  title={emailParticipants
                    .map((p) => p.name || p.address)
                    .join(", ")}
                >
                  <div className="truncate text-callout font-bold text-ink-strong">
                    {headerTitle}
                  </div>
                  <div className="truncate text-caption text-faint">
                    Subject: {subject?.trim() || "(no subject)"}
                  </div>
                </button>
              ) : (
                <>
                  <div className="truncate text-callout font-bold text-ink-strong">
                    {headerTitle}
                  </div>
                  {isGroup ? (
                    <button
                      type="button"
                      onClick={() => setGroupPanelOpen(true)}
                      className="truncate text-left text-caption text-faint hover:text-ink"
                    >
                      {groupMembers.length
                        ? `${groupMembers.length} members · manage`
                        : "Group chat"}
                    </button>
                  ) : null}
                </>
              )}
              {isEmail && emailPartsOpen && emailParticipants.length > 0 && (
                <div className="absolute left-0 top-full z-40 mt-1 max-h-72 w-72 overflow-y-auto rounded-xl border border-line-strong bg-surface-2 p-1 shadow-xl">
                  <div className="px-2 py-1 text-micro font-semibold uppercase tracking-wide text-faint">
                    {emailParticipants.length} participant
                    {emailParticipants.length > 1 ? "s" : ""}
                  </div>
                  {emailParticipants.map((p) => (
                    <div
                      key={p.address}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5"
                    >
                      <UserAvatar
                        name={p.name || localPart(p.address ?? "")}
                        address={p.address}
                        isEmail
                        size={28}
                        showBadge={false}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-footnote text-ink">
                          {p.name || localPart(p.address ?? "")}
                        </div>
                        <div className="truncate text-micro text-faint">
                          {p.address}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
        {(is1to1 || (isGroup && !isEmail && topicId)) && (
          <CallButtons
            topicId={topicId}
            recipientName={title}
            recipientAddress={is1to1 ? recipientAddress : undefined}
            className={is1to1 ? "ml-auto" : "ml-1"}
          />
        )}
        {isGroup && (
          <button
            type="button"
            onClick={() => setGroupPanelOpen(true)}
            className="ml-auto rounded-lg p-1.5 text-muted hover:bg-surface hover:text-ink"
            aria-label="Group info"
          >
            <Users className="h-5 w-5" />
          </button>
        )}
      </header>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
      >
       <div
        ref={contentRef}
        className="flex min-h-full flex-col gap-2 px-6 py-4"
        onClick={() => {
          if (reactOpenId) setReactOpenId(null);
          if (menuOpenId) setMenuOpenId(null);
        }}
      >
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center text-faint">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted">
            {error instanceof ApiError &&
            (error.status === 403 || error.status === 404)
              ? "You don't have access to this conversation."
              : "Couldn't load this conversation."}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-sm text-faint">
            No messages yet.
          </div>
        ) : (
          rows.map(({ m, isOwn, showAvatar, showName, dayChanged }) => (
            // Key by refId when present so the optimistic bubble and its server
            // echo share a key (refId === the local id) — React reuses the DOM
            // node instead of remount→flicker on the sending→delivered swap.
            <div key={m.refId || m.id}>
              {dayChanged && (
                <div className="my-2 text-center text-micro font-semibold uppercase tracking-wide text-faint">
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
                  isLastOutbound={m.id === lastOutboundId}
                  showTime={shownTimeId === m.id}
                  myUserId={myUserId}
                  reactOpen={reactOpenId === m.id}
                  menuOpen={menuOpenId === m.id}
                  selectMode={selectMode}
                  selected={selectedIds.has(m.id)}
                  onToggleSelect={() => toggleSelect(m.id)}
                  onToggleTime={() =>
                    setShownTimeId((cur) => (cur === m.id ? null : m.id))
                  }
                  onSeeOriginal={setOriginal}
                  onOpenReact={() =>
                    setReactOpenId((cur) => (cur === m.id ? null : m.id))
                  }
                  onToggleMenu={() => {
                    setReactOpenId(null); // react bar and actions menu are exclusive
                    setMenuOpenId((cur) => (cur === m.id ? null : m.id));
                  }}
                  onAction={(a) => onMessageAction(a, m)}
                  onPickEmoji={(emoji) => {
                    toggleReaction(m, emoji);
                    setReactOpenId(null);
                  }}
                  onOpenPicker={() => {
                    setReactOpenId(null);
                    setPickerForId(m.id);
                  }}
                  onOpenReactors={() => setReactorsForId(m.id)}
                  onRetry={() => retryMessage(m.id)}
                />
              )}
            </div>
          ))
        )}
       </div>
      </div>

      {typingNames.length > 0 && <TypingIndicator names={typingNames} />}

      <div className="relative">
        {showJump && !selectMode && (
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label="Jump to latest"
            className="absolute -top-14 right-5 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-surface-3 text-ink shadow-lg ring-1 ring-line-strong transition-colors hover:bg-surface-2"
          >
            <ArrowDown className="h-5 w-5" />
          </button>
        )}
        {selectMode ? (
          <div className="flex items-center gap-3 border-t border-line px-4 py-3">
            <button
              type="button"
              onClick={cancelSelect}
              className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-ink"
              aria-label="Cancel selection"
            >
              <X className="h-5 w-5" />
            </button>
            <span className="text-body font-semibold text-ink-strong">
              {selectedIds.size} selected
            </span>
            <button
              type="button"
              disabled={selectedIds.size === 0}
              onClick={forwardSelected}
              className="ml-auto flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-subhead font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Forward className="h-4 w-4" />
              Forward
            </button>
          </div>
        ) : (
          <MessageComposer
            threadId={id}
            isEmail={isEmail}
            att={att}
            editing={editing}
            replyingTo={replyingTo}
            onSubmit={onSubmit}
            onCancelEdit={() => setEditing(null)}
            onCancelReply={() => setReplyingTo(null)}
            emitTyping={emitTyping}
          />
        )}
      </div>

      <ConfirmDialog
        open={confirm !== null}
        danger
        title={
          confirm?.kind === "forAll"
            ? "Unsend for everyone?"
            : confirm?.message.headerId
              ? "Delete for you?"
              : "Discard message?"
        }
        body={
          confirm?.kind === "forAll"
            ? "This message will be removed for everyone in the conversation."
            : confirm?.message.headerId
              ? "This removes the message from your view only."
              : "This unsent message will be discarded."
        }
        confirmLabel={
          confirm?.kind === "forAll"
            ? "Unsend"
            : confirm?.message.headerId
              ? "Delete"
              : "Discard"
        }
        onConfirm={runDelete}
        onCancel={() => setConfirm(null)}
      />

      {original && (
        <OriginalOverlay message={original} onClose={() => setOriginal(null)} />
      )}

      {groupPanelOpen && (
        <GroupPanel
          topicId={topicId ?? id}
          threadId={id}
          name={liveTitle}
          members={groupMembers}
          currentUserAddress={currentUserAddress}
          onRenamed={setRenamedTitle}
          onClose={() => setGroupPanelOpen(false)}
        />
      )}

      {profilePanelOpen && recipientUsername && (
        <ProfilePanel
          username={recipientUsername}
          name={title}
          address={recipientAddress}
          topicId={topicId ?? id}
          onClose={() => setProfilePanelOpen(false)}
        />
      )}

      {pickerForId && (
        <EmojiPicker
          onPick={(emoji) => {
            const m = messages.find((x) => x.id === pickerForId);
            if (m) toggleReaction(m, emoji);
            setPickerForId(null);
          }}
          onClose={() => setPickerForId(null)}
        />
      )}

      {reactorsForId &&
        (() => {
          const m = messages.find((x) => x.id === reactorsForId);
          if (!m) return null;
          return (
            <ReactorSheet
              message={m}
              myUserId={myUserId}
              onRemove={(reactionId) => {
                if (m.headerId)
                  unreact.mutate({ headerId: m.headerId, reactionId });
              }}
              onClose={() => setReactorsForId(null)}
            />
          );
        })()}

      {infoForId &&
        (() => {
          const m = messages.find((x) => x.id === infoForId);
          if (!m) return null;
          return (
            <MessageInfoSheet
              message={m}
              isEmail={isEmail}
              isOwn={isOwnMessage(m, username)}
              onClose={() => setInfoForId(null)}
            />
          );
        })()}
    </div>
  );
}
