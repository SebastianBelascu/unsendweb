import type {
  BackendAttachment,
  BackendEmail,
  BackendMessage,
  BackendThread,
} from "./backend-types";
import type { MailMessage, ThreadListItem, ThreadParticipant } from "../types";

const displayName = (e?: BackendEmail): string =>
  e?.name?.trim() || e?.address || "Unknown";

const oneLine = (s?: string | null): string =>
  (s ?? "").replace(/\s+/g, " ").trim();

function humanSize(bytes?: number): string | undefined {
  if (!bytes || bytes <= 0) return undefined;
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function isVoice(a: BackendAttachment): boolean {
  const ct = (a.type || "").toLowerCase();
  const fn = (a.title || "").toLowerCase();
  return ct.startsWith("audio") || /\.(m4a|mp3|ogg|wav|webm|aac)$/.test(fn);
}

/** "🔊 voice message" / "2 images" / "1 video + 1 file" — mirrors native preview. */
function attachmentSummary(atts: BackendAttachment[]): string {
  if (atts.length === 1 && isVoice(atts[0])) return "🔊 voice message";
  let img = 0;
  let vid = 0;
  let file = 0;
  for (const a of atts) {
    const ct = (a.type || "").toLowerCase();
    if (ct.startsWith("image")) img++;
    else if (ct.startsWith("video")) vid++;
    else file++;
  }
  const parts: string[] = [];
  if (img) parts.push(`${img} image${img > 1 ? "s" : ""}`);
  if (vid) parts.push(`${vid} video${vid > 1 ? "s" : ""}`);
  if (file) parts.push(`${file} file${file > 1 ? "s" : ""}`);
  return parts.join(" + ") || `${atts.length} attachment${atts.length > 1 ? "s" : ""}`;
}

export function mapParticipant(e?: BackendEmail): ThreadParticipant {
  return { name: displayName(e), address: e?.address };
}

export function mapThread(t: BackendThread): ThreadListItem {
  const lm = t.lastMessage;

  let participants: ThreadParticipant[];
  if (t.participants?.length) {
    participants = t.participants.map(mapParticipant);
  } else if (lm) {
    const src = lm.outbound ? lm.to ?? [] : lm.from ? [lm.from] : [];
    participants = src.map(mapParticipant);
  } else {
    participants = [];
  }
  if (participants.length === 0) participants = [{ name: "Unknown" }];

  // Group name is carried separately (not as a synthetic participant) so the
  // real members — with addresses → avatars — survive for the member stack and
  // the call roster. Externally-created groups depend on this.
  const groupName = t.isGroup ? t.chatName || undefined : undefined;

  let preview = oneLine(lm?.reactionText || lm?.text || "");
  if (!preview && lm?.attachments?.length) {
    preview = attachmentSummary(lm.attachments);
  }
  preview = preview.replace(/^GROUP-PLACEHOLDER:/, "").trim();
  if (!preview) preview = "<no message>";

  return {
    id: t.threadId || t.topicId,
    topicId: t.topicId,
    subject: t.isEmail ? oneLine(t.subject) || undefined : undefined,
    participants,
    preview,
    updatedAt: t.updatedAt || lm?.createdAt || new Date(0).toISOString(),
    isEmail: Boolean(t.isEmail),
    isGroup: Boolean(t.isGroup),
    groupName,
    // Unseen when the last message is not ours and not explicitly seen
    // (undefined seen counts as unread, matching iOS). Muted threads never
    // contribute to the unread badge.
    unread: Boolean(lm && lm.seen !== true && !lm.outbound && !t.isSilent),
    isPinned: t.isPinned,
    isBookmarked: t.isBookmarked,
    isSilent: t.isSilent,
    isSpam: t.isSpam,
    isDeleted: t.isDeleted,
    isPromotional: t.isPromotional,
    favicon: t.favicon || undefined,
    attachmentsCount: lm?.attachments?.length || undefined,
    isDraft: t.isDraft,
  };
}

export function mapMessage(m: BackendMessage): MailMessage {
  return {
    id: m.messageId || m._id || `${m.createdAt ?? ""}-${oneLine(m.text).slice(0, 8)}`,
    refId: m.refId ?? undefined,
    headerId: m.headerId,
    replyTo: m.replyTo,
    from: mapParticipant(m.from),
    to: (m.to ?? []).map(mapParticipant),
    cc: (m.cc ?? []).map(mapParticipant),
    bcc: (m.bcc ?? []).map(mapParticipant),
    forwarded: Boolean(m.forwarded),
    isPrivate: Boolean(m.isPrivate),
    reactions: (m.reactions ?? []).map((r) => ({
      id: r.id,
      emoji: r.reaction,
      byUserId: r.byUser?.userId,
      byName: r.byUser?.name,
    })),
    date: m.createdAt || new Date(0).toISOString(),
    html: m.hasHtml && m.html ? m.html : undefined,
    hasHtml: Boolean(m.hasHtml || m.html),
    isInfoMessage: Boolean(m.isInfoMessage),
    isHidden: Boolean(m.isHidden),
    text: m.text || undefined,
    outbound: Boolean(m.outbound),
    isDelivered: Boolean(m.isDelivered),
    isRead: Boolean(m.isRead),
    edited: Boolean(m.edited),
    isDeleted: Boolean(m.isDeleted),
    attachments: (m.attachments ?? []).map((a, i) => {
      const title = a.title || "attachment";
      return {
        id: a.id || title || `att-${i}`,
        filename: title,
        url: a.url,
        type: a.type,
        sizeLabel: humanSize(a.size),
        durationSec:
          isVoice(a) && a.placeholder ? parseInt(a.placeholder, 10) : undefined,
        orientation: a.orientation ?? undefined,
      };
    }),
  };
}
