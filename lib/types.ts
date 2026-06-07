/*
  Web-facing view types for the mail surface. These are a pragmatic subset of
  the backend entities (see context/05-data-models.md). Once the backend is
  reachable, generate the full typed client from /docs-json
  (see context/14-setup-and-running.md) and map those into these view types.
*/

export type MailFilter = "inbox" | "bookmarks" | "spam" | "deleted";

export const MAIL_FILTERS: { key: MailFilter; label: string }[] = [
  { key: "inbox", label: "Inbox" },
  { key: "bookmarks", label: "Bookmarks" },
  { key: "spam", label: "Spam" },
  { key: "deleted", label: "Deleted" },
];

export function isMailFilter(value: string): value is MailFilter {
  return MAIL_FILTERS.some((f) => f.key === value);
}

export interface ThreadParticipant {
  name: string;
  address?: string;
}

/** One row in the inbox / thread list. */
export interface ThreadListItem {
  id: string;
  topicId: string;
  subject?: string;
  participants: ThreadParticipant[];
  /** Stripped, single-line preview of the last message. */
  preview: string;
  /** ISO timestamp of the last activity. */
  updatedAt: string;
  isEmail: boolean;
  unread: boolean;
  isGroup?: boolean;
  isPinned?: boolean;
  isBookmarked?: boolean;
  isSilent?: boolean;
  isSpam?: boolean;
  isDeleted?: boolean;
  isPromotional?: boolean;
  /** Sender-domain favicon (promotional email senders). */
  favicon?: string;
  attachmentsCount?: number;
  isDraft?: boolean;
}

export interface MailAttachment {
  id: string;
  filename: string;
  /** Absolute, directly-loadable URL (S3/CDN) for <img>/<video>/<audio>. */
  url?: string;
  /** MIME type. */
  type?: string;
  sizeLabel?: string;
  /** Voice-note duration in seconds (from the backend `placeholder`). */
  durationSec?: number;
  orientation?: string;
}

export interface MailReaction {
  id: string;
  emoji: string;
  byUserId?: string;
  byName?: string;
}

/** A single message inside a thread/conversation. */
export interface MailMessage {
  id: string;
  /** Client idempotency key — reconciles an optimistic send with its server echo. */
  refId?: string;
  /** Backend headerId (used for reply-to resolution + removing reactions). */
  headerId?: string;
  /** headerId of the message this one replies to. */
  replyTo?: string | null;
  from: ThreadParticipant;
  to: ThreadParticipant[];
  cc?: ThreadParticipant[];
  bcc?: ThreadParticipant[];
  /** Email was forwarded / marked private (status labels). */
  forwarded?: boolean;
  isPrivate?: boolean;
  reactions?: MailReaction[];
  /** ISO timestamp. */
  date: string;
  /** Raw HTML body (rendered sandboxed + sanitized). */
  html?: string;
  /** Plain-text fallback when there is no HTML. */
  text?: string;
  /** Whether a full original HTML body exists (gates "See original"). */
  hasHtml?: boolean;
  /** System/info line (joined/left/added, unsent) — rendered centered, no bubble. */
  isInfoMessage?: boolean;
  /** Reaction reply-message — never shown in the thread (chip-only, like native). */
  isHidden?: boolean;
  outbound: boolean;
  /** Aggregate receipt flags (true when all recipients delivered/read). */
  isDelivered?: boolean;
  isRead?: boolean;
  /** Edited in place (shows an "edited" label). */
  edited?: boolean;
  /** Soft-deleted/unsent (rendered as a tombstone, body/attachments hidden). */
  isDeleted?: boolean;
  /** Client-only delivery state for optimistic outbound messages. */
  status?: "sending" | "failed";
  attachments?: MailAttachment[];
}

/** A thread plus its messages, as needed by the reading pane. */
export interface MailThread {
  topicId: string;
  subject?: string;
  isEmail: boolean;
  participants: ThreadParticipant[];
  messages: MailMessage[];
}
