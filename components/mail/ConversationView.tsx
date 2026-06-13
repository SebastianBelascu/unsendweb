'use client';

import Link from 'next/link';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { format, isToday, isYesterday } from 'date-fns';
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
  Pencil,
  Phone,
  PhoneMissed,
  Plus,
  Reply,
  SmilePlus,
  Trash2,
  Users,
  Video,
  X,
} from 'lucide-react';
import { Avatar } from './Avatar';
import { UserAvatar } from './UserAvatar';
import { AttachmentGrid } from './AttachmentGrid';
import { SwipeToReply } from './SwipeToReply';
import { VoiceMessage } from './VoiceMessage';
import { CallButtons } from '@/components/calls/CallButtons';
import { EmailBody } from './EmailBody';
import { MessageComposer, type ComposerRecipients } from './MessageComposer';
import { MentionText } from './MentionText';
import { LinkPreviewCard } from './LinkPreview';
import { buildMentions, type MentionParticipant } from '@/lib/mentions';
import { firstUrl } from '@/lib/api/link-preview';
import { toast } from '@/lib/toast';
import {
  canEditMessage,
  canUnsendForAll,
  withinEditWindow,
} from '@/lib/message-actions';
import { placeCall } from '@/lib/calls/controller';
import { dtosToMailAttachments, useComposerAttachments } from './attachments';
import { cn } from '@/lib/utils';
import { isOwnMessage, localPart, MAIL_DOMAIN } from '@/lib/identity';
import {
  clearActiveThread,
  setActiveThread,
} from '@/lib/realtime/active-thread';
import { useSession } from '@/lib/api/account';
import {
  useEmitTyping,
  useLastSeen,
  useOnline,
  usePresenceFor,
  useTyping,
} from '@/lib/realtime/hooks';
import {
  fetchMessageHtml,
  fetchOlderMessages,
  markThreadSeen,
  markVoiceListened,
  useMessageActions,
  useReactToMessage,
  useRemoveReaction,
  useSendMessage,
  useThreadMessages,
  type SendMessageInput,
} from '@/lib/api/messages';
import { ApiError } from '@/lib/api/http';
import { useThreadParticipants } from '@/lib/api/threads';
import { markThreadReadInCache } from '@/lib/realtime/threadCache';
import { useComposeModal } from '@/lib/compose-modal';
import { ConfirmDialog } from './ConfirmDialog';
import { EmojiPicker } from './EmojiPicker';
import { quickReactionRow, recordReaction } from '@/lib/recent-reactions';
import { GroupPanel } from './GroupPanel';
import { ProfilePanel } from './ProfilePanel';
import { MessageInfoSheet } from './MessageInfoSheet';
import { ReactorSheet } from './ReactorSheet';
import type {
  MailAttachment,
  MailMessage,
  MailReaction,
  ThreadParticipant,
} from '@/lib/types';

const ME = { name: 'You' };
const QUICK_EMOJIS = ['❤️', '😂', '😮', '😢', '😠', '👍'];
const IMG_RE = /\.(jpg|jpeg|png|gif|bmp|webp|heic|heif|tiff|tif)$/i;
const VID_RE = /\.(mp4|mov|avi|mkv|wmv|flv|3gp|m4v)$/i;

function stripRe(subject: string): string {
  return subject.replace(/^\s*(re|fwd|fw)\s*:\s*/i, '').trim();
}

function lastSeenLabel(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const days = Math.floor(s / 86400);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return format(new Date(iso), 'MMM d');
}

function fileKind(a: MailAttachment): 'image' | 'video' | 'voice' | 'file' {
  const fn = (a.filename || '').toLowerCase();
  const t = (a.type || '').toLowerCase();
  if (a.durationSec != null || /\.m4a$/.test(fn) || t.startsWith('audio'))
    return 'voice';
  if (t.startsWith('image') || IMG_RE.test(fn)) return 'image';
  if (t.startsWith('video') || VID_RE.test(fn)) return 'video';
  return 'file';
}

function dayLabel(d: Date): string {
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMM d, yyyy');
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
    return (k === 'image' || k === 'video') && a.url;
  });
  const rest = attachments.filter((a) => {
    const k = fileKind(a);
    return k !== 'image' && k !== 'video';
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
        if (k === 'voice')
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
            download={a.filename}
            className="flex items-center gap-2.5 rounded-lg bg-black/20 px-2.5 py-2 hover:bg-black/30"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-black/25">
              <FileText className="h-5 w-5" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="max-w-[200px] truncate text-footnote">
                {a.filename}
              </span>
              {a.sizeLabel && (
                <span className="text-micro opacity-70">{a.sizeLabel}</span>
              )}
            </span>
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
  for (const r of reactions)
    if (!unique.includes(r.emoji)) unique.push(r.emoji);
  const mine = new Set(
    reactions
      .filter((r) => r.byUserId && r.byUserId === myUserId)
      .map((r) => r.emoji),
  );
  const shown = unique.slice(0, 3);
  const extra = unique.length - shown.length;
  return (
    <div
      className={cn(
        'mt-0.5 flex flex-wrap gap-1',
        isOwn ? 'justify-end' : 'justify-start',
      )}
    >
      {shown.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className={cn(
            'flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-caption',
            mine.has(emoji)
              ? 'border-link/50 bg-link/15'
              : 'border-line-strong bg-surface-2',
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
  | 'reply'
  | 'copy'
  | 'edit'
  | 'forward'
  | 'info'
  | 'deleteForMe'
  | 'deleteForAll';

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
  // Native gating (ThreadDetailViewModel.canEdit / canDeleteForAll), encapsulated
  // in lib/message-actions so the wall-clock check stays out of render.
  const canEdit = canEditMessage(message, isOwn, hasText);
  const canDeleteForAll = canUnsendForAll(message, isOwn);
  const items: {
    key: MsgAction;
    label: string;
    Icon: typeof Reply;
    danger?: boolean;
  }[] = [];
  if (!deleted) {
    // "Message info" first (WhatsApp-style): chat shows seen/delivered rosters,
    // email shows the full From/To/Cc/Bcc headers.
    items.push({ key: 'info', label: 'Message info', Icon: Info });
    items.push({ key: 'reply', label: 'Reply', Icon: Reply });
    if (hasText) items.push({ key: 'copy', label: 'Copy', Icon: Copy });
    items.push({ key: 'forward', label: 'Forward', Icon: Forward });
    if (canEdit) items.push({ key: 'edit', label: 'Edit', Icon: Pencil });
  }
  items.push({
    key: 'deleteForMe',
    label: 'Delete for me',
    Icon: Trash2,
    danger: true,
  });
  if (canDeleteForAll)
    items.push({
      key: 'deleteForAll',
      label: 'Unsend for everyone',
      Icon: Ban,
      danger: true,
    });

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
        className="pop-in fixed z-[61] max-h-[70vh] w-52 overflow-y-auto rounded-2xl border border-line-strong bg-surface-2 py-1.5 shadow-2xl"
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
              'flex w-full items-center gap-2.5 px-3 py-2 text-left text-footnote hover:bg-surface-3',
              it.danger ? 'text-accent' : 'text-ink',
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
  if (message.status === 'sending')
    return <Loader2 className="h-3 w-3 animate-spin" aria-label="Sending" />;
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
  selfAddress,
  quickEmojis,
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
  onJumpReply,
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
  selfAddress?: string;
  quickEmojis: string[];
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
  onJumpReply?: () => void;
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
  // Reply-connector measurement (the SVG path is computed from the quote pill +
  // bubble rects so the line can bridge two opposite-aligned boxes precisely).
  const replyWrapRef = useRef<HTMLDivElement>(null);
  const quoteRef = useRef<HTMLButtonElement>(null);
  const avatarRef = useRef<HTMLDivElement>(null);
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
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [menuOpen, onToggleMenu]);

  const ownColor = isEmail ? 'bg-email text-white' : 'bg-chat text-white';
  const text = message.text?.trim();
  const atts = message.attachments ?? [];
  const deleted = Boolean(message.isDeleted);
  const canSeeOriginal = isEmail && !isOwn && message.hasHtml && !deleted;
  // Below-bubble status labels, native order (EmailLabelsRow): forwarded · bcc ·
  // edited · private, joined with " • ". Read/delivered is handled separately by
  // StatusTicks; "new"/"before added" need fields the web doesn't carry.
  const me = (selfAddress ?? '').toLowerCase();
  // Native colours the quote pill + connector by the QUOTED author: the reply
  // accent (purple/green) when you're quoting yourself, neutral grey otherwise.
  const repliedOwn =
    Boolean(replied) && (replied?.from.address ?? '').toLowerCase() === me;
  // The quote sits with the reply ONLY when you reply to YOURSELF (same author);
  // replying to someone else puts the quote on the opposite side.
  const sameAuthor =
    Boolean(replied) &&
    (replied?.from.address ?? '').toLowerCase() ===
      (message.from.address ?? '').toLowerCase();
  const quoteRight = sameAuthor ? isOwn : !isOwn;
  // When the quoted message is a photo/video, the reply preview shows its
  // thumbnail (not "📎 attachment" text).
  const repliedImg = replied?.attachments?.find((a) => {
    const k = fileKind(a);
    return (k === 'image' || k === 'video') && (a.url || a.posterUrl);
  });
  // White, subtle — a thin reply tail (hex, not CSS var: SVG stroke attributes
  // don't reliably resolve var()).
  const connStroke = '#ffffff';

  // Measured reply connector: a thin path that STARTS at the reply bubble and
  // runs up to the MIDDLE of the quote in the opposite corner. CSS borders can't
  // bridge two opposite-aligned boxes of unknown size, so we measure both rects
  // (relative to the reply wrapper) and draw the line as an SVG path.
  const [connPath, setConnPath] = useState<{
    w: number;
    h: number;
    d: string;
  } | null>(null);
  useLayoutEffect(() => {
    if (!replied || message.isDeleted) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConnPath(null);
      return;
    }
    const wrap = replyWrapRef.current;
    const quote = quoteRef.current;
    if (!wrap || !quote) return;
    const measure = () => {
      const w = wrap.getBoundingClientRect();
      const q = quote.getBoundingClientRect();
      const r = 14;
      // iMessage "reply thread" hook: a curved tail that HANGS from the quote's
      // bottom-outer corner and curls toward the reply — it comes FROM the
      // quote (the opposite direction). Own reply → quote on the LEFT, curls
      // down-right; inbound reply → quote on the RIGHT, curls down-left.
      // Cross-reply: hook on the quote's OUTER edge, curling toward the centre.
      // Self-reply (quote stacked above the reply on the SAME side): hook on the
      // INNER edge instead, so it sits in open space and isn't cramped against
      // the bubble's outer edge.
      const hookRight = sameAuthor ? !quoteRight : quoteRight;
      const oy = q.bottom - w.top;
      const sweep = hookRight ? -1 : 1;
      const bubEl = bubbleRef.current;
      // Cross-reply: hook on the quote's edge. Self-reply: the reply bubble can
      // be far wider than the quote, so anchor the hook at the bubble's INNER
      // (front) edge — calculated from the bubble — so it sits in front of the
      // bubble, not floating by the narrow quote.
      let ox: number;
      if (sameAuthor && bubEl) {
        const b = bubEl.getBoundingClientRect();
        // Sit one radius OUTSIDE the bubble's front edge so the curl ends right
        // at the edge — never over the text inside.
        ox = (quoteRight ? b.left - r : b.right + r) - w.left;
      } else {
        ox = (hookRight ? q.right : q.left) - w.left;
      }
      const down = 10; // how far it drops before curling (kept short — sits high)
      const d = `M ${ox} ${oy} L ${ox} ${oy + down} Q ${ox} ${oy + down + r} ${ox + sweep * r} ${oy + down + r}`;
      setConnPath({ w: w.width, h: w.height, d });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [replied, message.isDeleted, quoteRight, sameAuthor]);

  const bcc = message.bcc ?? [];
  const bccContext =
    isEmail &&
    !message.forwarded &&
    bcc.length > 0 &&
    (isOwn || bcc.some((p) => p.address?.toLowerCase() === me));
  const statusLabels: string[] = [];
  if (message.forwarded) statusLabels.push('forwarded');
  if (bccContext) statusLabels.push('bcc');
  if (message.edited) statusLabels.push('edited');
  if (isEmail && message.isPrivate) statusLabels.push('private');
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
      data-mid={message.id}
      onClick={selectMode && selectable ? onToggleSelect : undefined}
      className={cn(
        'group flex flex-col rounded-lg',
        selectMode && selectable && 'cursor-pointer',
        selected && 'bg-accent/10',
      )}
    >
      <SwipeToReply
        enabled={actionable && !deleted && !selectMode}
        isOwn={isOwn}
        onReply={() => onAction('reply')}
      >
        <div
          ref={replyWrapRef}
          className={cn(
            'relative flex flex-col',
            // Extra breathing room above a reply so the quote pill doesn't crowd
            // the message above it.
            replied && !deleted && 'mt-3',
          )}
        >
          {/* Reply (iMessage thread style): the quote sits on the OPPOSITE corner
              from the reply bubble; a measured SVG line starts at the bubble and
              runs up to the MIDDLE of the quote. Colour follows the quoted
              author (accent if yours, grey otherwise). */}
          {connPath && (
            <svg
              aria-hidden
              className="pointer-events-none absolute left-0 top-0 z-10"
              width={connPath.w}
              height={connPath.h}
              style={{ overflow: 'visible' }}
            >
              <path
                d={connPath.d}
                fill="none"
                stroke={connStroke}
                strokeOpacity={0.5}
                strokeWidth={2.5}
                strokeLinecap="round"
              />
            </svg>
          )}
          {replied && !deleted && (
            <div
              className={cn(
                'flex',
                // Same author (self-reply) → quote on the reply's side; different
                // author → opposite side.
                quoteRight ? 'justify-end' : 'justify-start',
                // Inbound self-reply: the bubble is pushed right by the avatar,
                // so offset the quote to line up with it.
                !isOwn && !quoteRight && 'pl-9',
              )}
            >
              <button
                ref={quoteRef}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onJumpReply?.();
                }}
                className={cn(
                  'mb-1 flex max-w-[220px] overflow-hidden rounded-2xl border bg-transparent px-2.5 py-1.5 text-left transition-opacity hover:opacity-70',
                  repliedOwn
                    ? isEmail
                      ? 'border-email-light/60'
                      : 'border-chat-light/60'
                    : 'border-[#888888]/60',
                )}
              >
                <div className="flex items-center gap-2">
                  {repliedImg && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={repliedImg.posterUrl || repliedImg.url}
                      alt=""
                      className="h-9 w-9 shrink-0 rounded-md object-cover"
                    />
                  )}
                  {/* For a photo reply, just the thumbnail — no name/text (cleaner).
                      Otherwise the (optional) sender name + the text preview. */}
                  {(!repliedImg || replied.text?.trim()) && (
                    <div className="min-w-0">
                      {(isGroup || isEmail) && !repliedImg && (
                        <div className="truncate text-caption font-bold leading-tight text-white/60">
                          {replied.from.name}
                        </div>
                      )}
                      <div
                        className={cn(
                          'truncate text-subhead leading-tight',
                          isEmail ? 'text-email-light' : 'text-chat-light',
                        )}
                      >
                        {replied.text?.trim() ||
                          (replied.attachments?.length ? '📎 attachment' : '…')}
                      </div>
                    </div>
                  )}
                </div>
              </button>
            </div>
          )}
          <div
            className={cn(
              'flex items-end gap-2',
              isOwn ? 'flex-row-reverse' : 'flex-row',
            )}
          >
            {selectMode && (
              <span
                className={cn(
                  'mb-1 flex h-5 w-5 shrink-0 items-center justify-center self-end rounded-full border transition-colors',
                  !selectable
                    ? 'border-transparent'
                    : selected
                    ? 'border-accent bg-accent text-white'
                    : 'border-line-strong text-transparent',
                )}
              >
                <Check className="h-3 w-3" />
              </span>
            )}
            {!isOwn &&
              (showAvatar ? (
                <div ref={avatarRef} className="shrink-0">
                  <UserAvatar
                    name={message.from.name}
                    address={message.from.address}
                    isEmail={isEmail}
                    size={28}
                    showBadge={false}
                  />
                </div>
              ) : (
                <span className="w-7 shrink-0" />
              ))}

            <div
              className={cn(
                'flex max-w-[75%] flex-col',
                isOwn ? 'items-end' : 'items-start',
              )}
            >
              {!isOwn && (isGroup || isEmail) && showName && (
                <span className="mb-0.5 ml-1 block text-footnote text-muted">
                  {message.from.name}
                </span>
              )}

              <div className="relative flex items-center gap-1">
                {/* Hover controls — only for real (sent) messages, hidden in select mode. */}
                {actionable && !selectMode && (
                  <div
                    className={cn(
                      'flex items-center gap-0.5 self-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100',
                      menuOpen && 'opacity-100',
                      isOwn ? 'order-first' : 'order-last',
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
                    'relative cursor-pointer rounded-bubble px-3.5 py-2.5 text-body leading-snug',
                    deleted
                      ? 'bg-surface-2 text-faint'
                      : isOwn
                      ? ownColor
                      : 'bg-surface-3 text-ink',
                  )}
                >
                  {deleted ? (
                    <span className="flex items-center gap-1.5 italic">
                      <Ban className="h-3.5 w-3.5 shrink-0" />
                      {text || 'This message was deleted'}
                    </span>
                  ) : (
                    <>
                      {atts.length > 0 && (
                        <div className={cn(text ? 'mb-2' : '')}>
                          <Attachments
                            attachments={atts}
                            messageId={message.id}
                            isOwn={isOwn}
                          />
                        </div>
                      )}
                      {(() => {
                        const previewUrl =
                          text && !isEmail && message.withUrlPreview
                            ? firstUrl(text)
                            : null;
                        // Whole message is just the URL → show only the rich card, not
                        // the duplicated link text (native `isSingleURLMessage`).
                        const single =
                          !!previewUrl && text?.trim() === previewUrl;
                        return (
                          <>
                            {text && !single ? (
                              <MentionText
                                text={text}
                                mentions={message.mentions}
                                isOwn={isOwn}
                              />
                            ) : null}
                            {previewUrl ? (
                              <LinkPreviewCard
                                url={previewUrl}
                                isOwn={isOwn}
                                standalone={single}
                              />
                            ) : null}
                          </>
                        );
                      })()}
                      {!text && atts.length === 0 && (
                        <span className="opacity-70">
                          {isEmail ? '📧' : '—'}
                        </span>
                      )}

                      {reactOpen && (
                        <div
                          className={cn(
                            'pop-in absolute bottom-full z-20 mb-1 flex items-center gap-1 rounded-full border border-line-strong bg-surface-2 px-2 py-1 shadow-lg',
                            isOwn ? 'right-0' : 'left-0',
                          )}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {quickEmojis.map((emoji) => (
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
        </div>
      </SwipeToReply>

      {/* Meta (reactions / See original / time) BELOW the bubble, aligned under
          it — so the avatar sits next to the bubble, not next to "See original". */}
      <div
        className={cn(
          'flex flex-col',
          isOwn
            ? 'items-end'
            : selectMode
            ? 'items-start pl-16'
            : 'items-start pl-9',
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

        {!deleted && statusLabels.length > 0 && (
          <div className="mt-0.5 px-1 text-micro text-faint">
            {statusLabels.join(' • ')}
          </div>
        )}

        {(showTime || showStatus) && (
          <span className="mt-0.5 flex items-center gap-1 px-1 text-micro text-faint">
            {showTime && (
              <span>{format(new Date(message.date), 'h:mm a')}</span>
            )}
            {showStatus &&
              (message.status === 'failed' ? (
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
      : 'Several people are typing';
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
  const text = (message.text ?? '').replace(/^GROUP-PLACEHOLDER:/, '').trim();
  return (
    <div className="my-1 text-center text-caption text-faint">
      {text || '—'}
    </div>
  );
}

/** Parse a call info-message's text (literal markers shared across clients). */
function parseCall(text?: string): {
  dir: 'incoming' | 'outgoing' | 'missed' | 'declined' | 'failed';
  video: boolean;
  duration?: string;
} {
  const raw = text ?? '';
  const t = raw.toLowerCase();
  const video = t.includes('video');
  let dir: 'incoming' | 'outgoing' | 'missed' | 'declined' | 'failed' =
    'outgoing';
  if (t.includes('missed')) dir = 'missed';
  else if (t.includes('declined')) dir = 'declined';
  else if (t.includes('failed')) dir = 'failed';
  else if (t.includes('incoming')) dir = 'incoming';
  const sep = raw.indexOf('•');
  const duration = sep >= 0 ? raw.slice(sep + 1).trim() : undefined;
  return { dir, video, duration };
}

/** Call info message → a tappable call bubble (tap to call back). */
function CallBubble({
  message,
  onCallBack,
}: {
  message: MailMessage;
  onCallBack: (video: boolean) => void;
}) {
  const { dir, video, duration } = parseCall(message.text);
  const danger = dir === 'missed' || dir === 'declined' || dir === 'failed';
  const label =
    dir === 'missed'
      ? `Missed ${video ? 'video ' : ''}call`
      : dir === 'declined'
      ? 'Call declined'
      : dir === 'failed'
      ? 'Call failed'
      : dir === 'incoming'
      ? `Incoming ${video ? 'video ' : ''}call`
      : `Outgoing ${video ? 'video ' : ''}call`;
  const Icon = danger ? PhoneMissed : video ? Video : Phone;
  const time = format(new Date(message.date), 'h:mm a');
  return (
    <div className="my-1.5 flex justify-center">
      <button
        type="button"
        onClick={() => onCallBack(video)}
        title="Call back"
        className="flex items-center gap-2.5 rounded-full bg-surface-2 px-3.5 py-1.5 text-footnote transition-colors hover:bg-surface-3"
      >
        <span
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-full',
            danger ? 'bg-accent/15 text-accent' : 'bg-surface-3 text-ink',
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="flex flex-col text-left leading-tight">
          <span
            className={cn('font-semibold', danger ? 'text-accent' : 'text-ink')}
          >
            {label}
          </span>
          <span className="text-micro text-faint">
            {duration ? `${duration} · ${time}` : time}
          </span>
        </span>
      </button>
    </div>
  );
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
  const {
    data: fetched = [],
    isLoading,
    isError,
    error,
  } = useThreadMessages(id);
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
  // Quick-react row, native QuickReactRow: slot 0 reflects your most-recent
  // emoji. The localStorage read is encapsulated in lib/recent-reactions, so it
  // stays out of render per React's purity rule; lazy init avoids an effect.
  const [quickEmojis, setQuickEmojis] = useState<string[]>(() =>
    quickReactionRow(QUICK_EMOJIS),
  );
  const recordReact = useCallback((emoji: string) => {
    recordReaction(emoji);
    setQuickEmojis(quickReactionRow(QUICK_EMOJIS));
  }, []);
  const [infoForId, setInfoForId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    id: string;
    text: string;
    date?: string;
  } | null>(null);
  const [replyingTo, setReplyingTo] = useState<MailMessage | null>(null);
  // Multi-select mode for forwarding several messages at once.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Drag-and-drop file/image attach.
  const [dragging, setDragging] = useState(false);
  const [confirm, setConfirm] = useState<{
    kind: 'forMe' | 'forAll';
    message: MailMessage;
  } | null>(null);
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
  // Older-message back-scroll: lazy-load history when the user scrolls near the
  // top, prepend to the flat cache, and keep the viewport anchored.
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const loadingOlderRef = useRef(false);
  const olderAnchor = useRef<number | null>(null);

  const loadOlder = useCallback(async () => {
    if (loadingOlderRef.current) return;
    const cache = qc.getQueryData<MailMessage[]>(['messages', id]);
    const oldest = cache?.[0];
    if (!oldest?.id) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const res = await fetchOlderMessages(id, oldest.id, 30);
      if (res.messages.length === 0) {
        setHasMoreOlder(false);
        return;
      }
      // Anchor the viewport: record height now so the layout effect can offset
      // scrollTop by exactly the prepended content's height (no jump).
      olderAnchor.current = scrollRef.current?.scrollHeight ?? null;
      qc.setQueryData<MailMessage[]>(['messages', id], (old) => {
        const seen = new Set((old ?? []).map((m) => m.id));
        const merged = [
          ...res.messages.filter((m) => !seen.has(m.id)),
          ...(old ?? []),
        ];
        return merged.sort((a, b) => +new Date(a.date) - +new Date(b.date));
      });
      setHasMoreOlder(res.hasMore);
    } catch {
      /* keep hasMoreOlder so the user can retry by scrolling */
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [id, qc]);

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
    if (el.scrollTop < 240 && hasMoreOlder && !loadingOlderRef.current) {
      void loadOlder();
    }
  }, [hasMoreOlder, loadOlder]);

  // New thread → reset anchoring so we jump to the latest message on open.
  useEffect(() => {
    didInitRef.current = false;
    atBottomRef.current = true;
    olderAnchor.current = null;
    loadingOlderRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowJump(false);
    setHasMoreOlder(true);
    setSelectMode(false);
    setSelectedIds(new Set());
  }, [id]);

  // Async content growth (images loading, receipt labels) → re-pin if at bottom.
  useEffect(() => {
    const inner = contentRef.current;
    if (!inner || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const el = scrollRef.current;
      if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  // Register as the ACTIVE conversation (WhatsApp semantics): the socket layer
  // suppresses unread bolding + acks seen for messages arriving while open.
  useEffect(() => {
    setActiveThread({ threadId: id, topicId });
    return () => clearActiveThread({ threadId: id, topicId });
  }, [id, topicId]);

  useEffect(() => {
    if (!id) return;
    // Clear the unread/bold styling INSTANTLY (the server `seen` write lags, so
    // a refetch would keep it bold for seconds). Fire-and-forget the network.
    markThreadReadInCache(qc, { threadId: id, topicId });
    markThreadSeen(id).catch(() => {});
  }, [id, topicId, qc]);

  // Inbound messages landing while the thread is open (poll or socket) → keep
  // the row read + converge the server. The socket path also acks, throttled —
  // this catches the polling path and is cheap/idempotent.
  const lastInboundId = useMemo(() => {
    for (let i = fetched.length - 1; i >= 0; i--) {
      const m = fetched[i];
      if (!m.outbound && !m.isHidden) return m.id;
    }
    return null;
  }, [fetched]);
  const ackedInboundRef = useRef<string | null>(null);
  useEffect(() => {
    ackedInboundRef.current = null;
  }, [id]);
  useEffect(() => {
    if (!id || !lastInboundId) return;
    if (ackedInboundRef.current === lastInboundId) return;
    const isFirst = ackedInboundRef.current === null;
    ackedInboundRef.current = lastInboundId;
    if (isFirst) return; // the open-thread effect above already handled mount
    if (document.visibilityState !== 'visible') return;
    markThreadReadInCache(qc, { threadId: id, topicId });
    markThreadSeen(id).catch(() => {});
  }, [lastInboundId, id, topicId, qc]);

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

  // After prepending older messages, offset scrollTop by the added height so the
  // viewport stays exactly where the user was (no jump).
  useLayoutEffect(() => {
    if (olderAnchor.current == null || !scrollRef.current) return;
    const el = scrollRef.current;
    el.scrollTop += el.scrollHeight - olderAnchor.current;
    olderAnchor.current = null;
  }, [messages]);

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
    const me = (currentUserAddress ?? '').toLowerCase();
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
    const firstName = first.name?.trim() || localPart(first.address ?? '');
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
      const full = [me?.firstName, me?.lastName]
        .filter(Boolean)
        .join(' ')
        .trim();
      map.set(currentUserAddress.toLowerCase(), {
        name: full || username || 'You',
        address: currentUserAddress,
      });
    }
    return [...map.values()];
  }, [rosterParticipants, messages, isGroup, currentUserAddress, me, username]);

  // Default recipients/subject for the composer "+" panel. The user can edit
  // these (To / Cc / Bcc / Subject) before sending; edits override the defaults.
  const composerInitialTo = useMemo<
    { name?: string; address: string }[]
  >(() => {
    const self = (currentUserAddress ?? '').toLowerCase();
    if (isGroup)
      return groupMembers
        .filter((m) => m.address && m.address.toLowerCase() !== self)
        .map((m) => ({ name: m.name, address: m.address as string }));
    if (isEmail)
      return emailParticipants
        .filter((p) => p.address)
        .map((p) => ({ name: p.name, address: p.address as string }));
    return recipient ? [{ address: recipient }] : [];
  }, [
    isGroup,
    isEmail,
    groupMembers,
    emailParticipants,
    recipient,
    currentUserAddress,
  ]);
  const composerInitialSubject =
    isEmail && subject ? `Re: ${stripRe(subject)}` : '';

  // Participants the @mention picker offers (others, by handle). @everyone is
  // available in groups + email threads (matches native).
  const mentionParticipants = useMemo<MentionParticipant[]>(() => {
    const self = (currentUserAddress ?? '').toLowerCase();
    const src: ThreadParticipant[] = isGroup
      ? groupMembers
      : isEmail
      ? emailParticipants
      : recipient
      ? [{ name: '', address: recipient }]
      : [];
    return src
      .filter((p) => p.address && p.address.toLowerCase() !== self)
      .map((p) => ({
        username: localPart(p.address as string),
        name: p.name || '',
      }));
  }, [
    isGroup,
    isEmail,
    groupMembers,
    emailParticipants,
    recipient,
    currentUserAddress,
  ]);
  const supportsMentionEveryone = isGroup || isEmail;

  function doSend(localId: string, payload: SendMessageInput) {
    pendingPayloads.current.set(localId, payload);
    setSent((cur) =>
      cur.map((m) => (m.id === localId ? { ...m, status: 'sending' } : m)),
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
          cur.map((m) => (m.id === localId ? { ...m, status: 'failed' } : m)),
        ),
    });
  }

  // Called by MessageComposer with the trimmed text (+ the "+" panel's edited
  // recipients/subject when present). Edit → PATCH; else send.
  function onSubmit(
    text: string,
    recipients?: ComposerRecipients,
    withUrlPreview?: boolean,
  ) {
    if (editing) {
      if (!text) return;
      // The 15-min window can lapse while the inline editor is open (native
      // throws .windowExpired on save) — re-check before committing the PATCH.
      if (editing.date && !withinEditWindow(editing.date)) {
        setEditing(null);
        toast('Edit window expired');
        return;
      }
      msgActions.edit.mutate({ messageId: editing.id, text });
      setEditing(null);
      return;
    }

    const dtos = att.readyDtos();
    if (!text && dtos.length === 0) return;
    const replyHeaderId = replyingTo?.headerId;
    const mentions = buildMentions(
      text,
      mentionParticipants,
      supportsMentionEveryone,
    );
    const localId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
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
        mentions: mentions.length ? mentions : undefined,
        withUrlPreview: withUrlPreview || undefined,
        attachments: dtos.length ? dtosToMailAttachments(dtos) : undefined,
        status: 'sending',
      },
    ]);
    att.clear();
    setReplyingTo(null);
    // Groups have no single recipient — address the message to every member
    // (minus me). Without this, the FIRST messages (before anyone has replied,
    // so there's no inbound sender to borrow) go out with an empty toList and the
    // backend rejects them (SendMessageDto.toList is ArrayMinSize(1)) → "Failed".
    const selfAddr = (currentUserAddress ?? '').toLowerCase();
    const groupTo = groupMembers
      .filter((m) => m.address && m.address.toLowerCase() !== selfAddr)
      .map((m) => ({ name: m.name, address: m.address as string }));
    const fallbackTo =
      isGroup && groupTo.length
        ? groupTo
        : recipient
        ? [{ address: recipient }]
        : groupTo;
    // The "+" panel's recipients win when set; otherwise the thread defaults.
    const toList = recipients?.toList?.length ? recipients.toList : fallbackTo;
    const ccList = recipients?.ccList?.length ? recipients.ccList : undefined;
    const bccList = recipients?.bccList?.length
      ? recipients.bccList
      : undefined;
    const subjectToSend = recipients?.subject?.trim()
      ? recipients.subject.trim()
      : isEmail && subject
      ? `Re: ${stripRe(subject)}`
      : undefined;
    doSend(localId, {
      refId: localId,
      text,
      attachments: dtos.length ? dtos : undefined,
      isEmail,
      isChat: !isEmail,
      subject: subjectToSend,
      topicId,
      threadId: id,
      toList,
      ccList,
      bccList,
      replyTo: replyHeaderId,
      mentions: mentions.length ? mentions : undefined,
      withUrlPreview: withUrlPreview || undefined,
    });
  }

  // Scroll to a message (by id) and flash it — used when tapping a reply quote.
  function jumpToMessage(targetId?: string) {
    if (!targetId) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(
      `[data-mid="${CSS.escape(targetId)}"]`,
    );
    if (!el) {
      toast("Original message isn't loaded yet");
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('bubble-flash');
    void el.offsetWidth; // restart the CSS animation
    el.classList.add('bubble-flash');
    window.setTimeout(() => el.classList.remove('bubble-flash'), 800);
  }

  function retryMessage(localId: string) {
    const payload = pendingPayloads.current.get(localId);
    if (payload) doSend(localId, payload);
  }

  // Call back from a call bubble — reuses the existing conversation.
  function callBack(video: boolean) {
    if (!myUserId) return;
    placeCall({
      topicId,
      recipientUsername: recipientAddress
        ? localPart(recipientAddress)
        : undefined,
      isVideo: video,
      peerName: title,
      peerAddress: recipientAddress,
      callerId: myUserId,
    }).catch(() => toast("Couldn't start the call", 'error'));
  }

  function onMessageAction(a: MsgAction, m: MailMessage) {
    switch (a) {
      case 'reply':
        setEditing(null);
        setReplyingTo(m);
        break;
      case 'copy':
        if (m.text)
          navigator.clipboard
            ?.writeText(m.text)
            .then(() => toast('Copied'))
            .catch(() => {});
        break;
      case 'edit':
        setReplyingTo(null);
        setEditing({ id: m.id, text: m.text ?? '', date: m.date });
        break;
      case 'forward':
        // Enter multi-select with this message picked; the user can add more,
        // then hit Forward in the selection bar.
        setSelectMode(true);
        setSelectedIds(new Set([m.id]));
        break;
      case 'info':
        setInfoForId(m.id);
        break;
      case 'deleteForMe':
        setConfirm({ kind: 'forMe', message: m });
        break;
      case 'deleteForAll':
        setConfirm({ kind: 'forAll', message: m });
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
        ? subject.toLowerCase().startsWith('fwd:')
          ? subject
          : `Fwd: ${subject}`
        : '';
    openCompose({
      mode: 'forward',
      forwardMessageIds: picked.map((m) => m.id),
      forwardPreviews: picked.map((m) => ({
        id: m.id,
        author: m.from.name,
        text: m.text?.trim() || (m.attachments?.length ? '📎 Attachment' : '…'),
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
    if (confirm.kind === 'forMe') {
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
    qc.setQueryData<MailMessage[]>(['messages', id], (list) =>
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

  const backHref = '/inbox';
  const is1to1 = !isEmail && !isGroup && Boolean(recipientAddress);

  return (
    <div
      className="relative flex h-full flex-col"
      onDragOver={(e) => {
        if (selectMode || !e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        if (!dragging) setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node))
          setDragging(false);
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
                {typingNames.length ? (
                  <span className="text-email">typing…</span>
                ) : online ? (
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
                people={(isGroup ? groupMembers : emailParticipants).map(
                  (m) => ({
                    name: m.name,
                    address: m.address,
                  }),
                )}
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
                    .join(', ')}
                >
                  <div className="truncate text-callout font-bold text-ink-strong">
                    {headerTitle}
                  </div>
                  <div className="truncate text-caption text-faint">
                    Subject: {subject?.trim() || '(no subject)'}
                  </div>
                </button>
              ) : (
                <>
                  <div className="truncate text-callout font-bold text-ink-strong">
                    {headerTitle}
                  </div>
                  {isGroup ? (
                    typingNames.length ? (
                      <div className="truncate text-caption text-email">
                        {typingNames[0]} is typing…
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setGroupPanelOpen(true)}
                        className="truncate text-left text-caption text-faint hover:text-ink"
                      >
                        {groupMembers.length
                          ? `${groupMembers.length} members · manage`
                          : 'Group chat'}
                      </button>
                    )
                  ) : null}
                </>
              )}
              {isEmail && emailPartsOpen && emailParticipants.length > 0 && (
                <div className="absolute left-0 top-full z-40 mt-1 max-h-72 w-72 overflow-y-auto rounded-xl border border-line-strong bg-surface-2 p-1 shadow-xl">
                  <div className="px-2 py-1 text-micro font-semibold uppercase tracking-wide text-faint">
                    {emailParticipants.length} participant
                    {emailParticipants.length > 1 ? 's' : ''}
                  </div>
                  {emailParticipants.map((p) => (
                    <div
                      key={p.address}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5"
                    >
                      <UserAvatar
                        name={p.name || localPart(p.address ?? '')}
                        address={p.address}
                        isEmail
                        size={28}
                        showBadge={false}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-footnote text-ink">
                          {p.name || localPart(p.address ?? '')}
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
            className={is1to1 ? 'ml-auto' : 'ml-1'}
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
          // Groups get roomier bubble spacing; 1:1 / email keep the tighter gap.
          className={cn(
            'flex min-h-full flex-col px-6 py-4',
            isGroup ? 'gap-3' : 'gap-2',
          )}
          onClick={() => {
            if (reactOpenId) setReactOpenId(null);
            if (menuOpenId) setMenuOpenId(null);
          }}
        >
          {loadingOlder && (
            <div className="flex justify-center py-2">
              <Loader2 className="h-4 w-4 animate-spin text-faint" />
            </div>
          )}
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
            rows.map(
              (
                { m, isOwn, showAvatar, showName, dayChanged, startsRun },
                i,
              ) => (
                // Key by refId when present so the optimistic bubble and its server
                // echo share a key (refId === the local id) — React reuses the DOM
                // node instead of remount→flicker on the sending→delivered swap.
                <div
                  key={m.refId || m.id}
                  // Group chats only: extra space above a new sender's run (or a
                  // >60s gap) so different people read clearly; one sender's
                  // consecutive messages stay grouped tighter. 1:1 is untouched.
                  className={cn(isGroup && startsRun && i > 0 && 'mt-2')}
                >
                  {dayChanged && (
                    <div className="my-2 text-center text-micro font-semibold uppercase tracking-wide text-faint">
                      {dayLabel(new Date(m.date))}
                    </div>
                  )}
                  {m.isCall ? (
                    <CallBubble message={m} onCallBack={callBack} />
                  ) : m.isInfoMessage ? (
                    <InfoRow message={m} />
                  ) : (
                    <Bubble
                      message={m}
                      replied={
                        m.replyTo ? byHeaderId.get(m.replyTo) : undefined
                      }
                      isOwn={isOwn}
                      isEmail={isEmail}
                      showAvatar={showAvatar}
                      showName={showName}
                      isGroup={isGroup}
                      isLastOutbound={m.id === lastOutboundId}
                      showTime={shownTimeId === m.id}
                      myUserId={myUserId}
                      selfAddress={currentUserAddress}
                      quickEmojis={quickEmojis}
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
                        recordReact(emoji);
                        toggleReaction(m, emoji);
                        setReactOpenId(null);
                      }}
                      onOpenPicker={() => {
                        setReactOpenId(null);
                        setPickerForId(m.id);
                      }}
                      onOpenReactors={() => setReactorsForId(m.id)}
                      onRetry={() => retryMessage(m.id)}
                      onJumpReply={() =>
                        jumpToMessage(
                          m.replyTo ? byHeaderId.get(m.replyTo)?.id : undefined,
                        )
                      }
                    />
                  )}
                </div>
              ),
            )
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
            key={id}
            threadId={id}
            isEmail={isEmail}
            att={att}
            editing={editing}
            replyingTo={replyingTo}
            initialTo={composerInitialTo}
            initialSubject={composerInitialSubject}
            mentionParticipants={mentionParticipants}
            supportsEveryone={supportsMentionEveryone}
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
          confirm?.kind === 'forAll'
            ? 'Unsend for everyone?'
            : confirm?.message.headerId
            ? 'Delete for you?'
            : 'Discard message?'
        }
        body={
          confirm?.kind === 'forAll'
            ? 'This message will be removed for everyone in the conversation.'
            : confirm?.message.headerId
            ? 'This removes the message from your view only.'
            : 'This unsent message will be discarded.'
        }
        confirmLabel={
          confirm?.kind === 'forAll'
            ? 'Unsend'
            : confirm?.message.headerId
            ? 'Delete'
            : 'Discard'
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
            if (m) {
              recordReact(emoji);
              toggleReaction(m, emoji);
            }
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
