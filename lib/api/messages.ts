import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiSend } from "./http";
import { mapMessage } from "./mappers";
import { bumpThread, insertNewThreadRow } from "../realtime/threadCache";
import type { MessagesResponse } from "./backend-types";
import type { AttachmentDto } from "./attachments";
import type { MailMessage } from "../types";

export async function fetchThreadMessages(
  threadId: string,
  page = 1,
  size = 50,
): Promise<MailMessage[]> {
  const res = await apiGet<MessagesResponse>(
    `/messages/thread/${threadId}/page/${page}/size/${size}`,
  );
  const list = (res?.data ?? []).map(mapMessage);
  // Oldest first for the reading/conversation view.
  return list.sort((a, b) => +new Date(a.date) - +new Date(b.date));
}

/**
 * Older messages strictly before `beforeMessageId` (cursor back-scroll). Returns
 * them oldest-first plus whether more history exists. Used to lazy-load history
 * on scroll-up without disturbing the flat ["messages", threadId] cache.
 */
export async function fetchOlderMessages(
  threadId: string,
  beforeMessageId: string,
  size = 30,
): Promise<{ messages: MailMessage[]; hasMore: boolean }> {
  const res = await apiGet<{ data?: unknown; hasMore?: boolean }>(
    `/messages/thread/${threadId}/before/${beforeMessageId}/size/${size}`,
  );
  const rows = Array.isArray(res?.data)
    ? (res.data as Parameters<typeof mapMessage>[0][])
    : [];
  const messages = rows
    .map(mapMessage)
    .sort((a, b) => +new Date(a.date) - +new Date(b.date));
  return { messages, hasMore: Boolean(res?.hasMore) };
}

export function useThreadMessages(threadId: string) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["messages", threadId],
    queryFn: async () => {
      const fresh = await fetchThreadMessages(threadId);
      const cached = qc.getQueryData<MailMessage[]>(["messages", threadId]);
      if (!cached?.length) return fresh;
      // Merge so back-scrolled older history (and socket-applied rows) survive
      // the poll; the fresh newest-page wins on overlap (receipts/edits).
      const map = new Map(cached.map((m) => [m.id, m]));
      for (const m of fresh) map.set(m.id, m);
      return [...map.values()].sort(
        (a, b) => +new Date(a.date) - +new Date(b.date),
      );
    },
    enabled: Boolean(threadId),
    // Polling stand-in for realtime (the socket gateway can't be reached from a
    // browser without a backend change — see context/03 + sockets.service.ts).
    refetchInterval: 15_000,
  });
}

/** One row in the mentions inbox: a message you were @mentioned in + its thread. */
export interface MentionInboxItem {
  message: MailMessage;
  threadId?: string;
}

/**
 * Mentions inbox — messages where the caller is targeted by a user-type mention,
 * newest first (GET /messages/mentions). Returns a bare array of messages; the
 * thread id rides along so the UI can deep-link into the conversation. User-type
 * mentions are validated against chat participants, so these are always chats.
 */
export function useMentionsInbox(enabled = true) {
  return useQuery({
    queryKey: ["mentions"],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await apiGet<unknown>("/messages/mentions?limit=50");
      const rows = Array.isArray(res)
        ? (res as Parameters<typeof mapMessage>[0][])
        : [];
      return rows.map<MentionInboxItem>((r) => ({
        message: mapMessage(r),
        threadId: r.threadId,
      }));
    },
  });
}

export interface SendRecipient {
  name?: string;
  address: string;
}

export interface SendMessageInput {
  refId?: string;
  toList: SendRecipient[];
  ccList?: SendRecipient[];
  bccList?: SendRecipient[];
  text: string;
  subject?: string;
  isEmail?: boolean;
  isChat?: boolean;
  isGroup?: boolean;
  topicId?: string;
  threadId?: string;
  replyTo?: string;
  attachments?: AttachmentDto[];
  mentions?: import("../mentions").MentionDto[];
  withUrlPreview?: boolean;
}

export async function sendMessage(input: SendMessageInput): Promise<unknown> {
  // The backend reads payload.ccList.map / bccList.map without a null-check,
  // so these MUST always be arrays (chat sends would otherwise 500).
  return apiSend("/messages", "POST", {
    ...input,
    ccList: input.ccList ?? [],
    bccList: input.bccList ?? [],
    attachments: input.attachments ?? [],
  });
}

/** Mark a voice note as listened (PATCH /messages/voice-listened/:messageId). */
export async function markVoiceListened(messageId: string): Promise<unknown> {
  return apiSend(`/messages/voice-listened/${messageId}`, "PATCH");
}

export interface ForwardMessageInput {
  toList: SendRecipient[];
  ccList?: SendRecipient[];
  bccList?: SendRecipient[];
  /** Backend DTO field is literally `messagesIds` (plural, camelCase typo). */
  messagesIds: string[];
  subject?: string;
  text?: string;
  isEmail?: boolean;
  isChat?: boolean;
  isGroup?: boolean;
  topicId?: string;
  threadId?: string;
  attachments?: AttachmentDto[];
}

/** Forward one or more messages to new/existing recipients (POST /messages/forward). */
export async function forwardMessages(
  input: ForwardMessageInput,
): Promise<unknown> {
  return apiSend("/messages/forward", "POST", {
    ...input,
    ccList: input.ccList ?? [],
    bccList: input.bccList ?? [],
  });
}

export function useForwardMessages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: forwardMessages,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["threads"] });
      qc.invalidateQueries({ queryKey: ["chatThreads"] });
    },
  });
}

/** Edit a message's text for everyone (PATCH /messages/message/:id). */
export async function editMessage(
  messageId: string,
  text: string,
): Promise<unknown> {
  return apiSend(`/messages/message/${messageId}`, "PATCH", { text });
}

/** Unsend a message for everyone (DELETE /messages/message/:id). */
export async function deleteMessageForAll(messageId: string): Promise<unknown> {
  return apiSend(`/messages/message/${messageId}`, "DELETE");
}

/** Delete messages from your own view only (DELETE /messages/forMe). Keyed by headerId. */
export async function deleteMessagesForMe(headerIds: string[]): Promise<unknown> {
  return apiSend(`/messages/forMe`, "DELETE", { headerIds });
}

/** Edit / delete mutations for a thread, all invalidating that thread's cache. */
export function useMessageActions(threadId: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["messages", threadId] });
    qc.invalidateQueries({ queryKey: ["threads"] });
    qc.invalidateQueries({ queryKey: ["chatThreads"] });
  };
  const edit = useMutation({
    mutationFn: ({ messageId, text }: { messageId: string; text: string }) =>
      editMessage(messageId, text),
    onSuccess: invalidate,
  });
  const deleteForAll = useMutation({
    mutationFn: (messageId: string) => deleteMessageForAll(messageId),
    onSuccess: invalidate,
  });
  const deleteForMe = useMutation({
    mutationFn: (headerIds: string[]) => deleteMessagesForMe(headerIds),
    onSuccess: invalidate,
  });
  return { edit, deleteForAll, deleteForMe };
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: sendMessage,
    // Bump the thread row the moment you hit send (WhatsApp-instant): preview +
    // order update optimistically, and markBumped shields them from any refetch
    // landing before the backend commits updatedAt.
    onMutate: (vars) => {
      bumpThread(qc, {
        threadId: vars.threadId,
        topicId: vars.topicId,
        preview: vars.text,
        outbound: true,
      });
    },
    onSuccess: (data, vars) => {
      const r = (data ?? {}) as {
        threadId?: string;
        _id?: string;
        topicId?: string;
      };
      const threadId = r.threadId ?? r._id ?? vars.threadId;
      const topicId = r.topicId ?? vars.topicId;
      if (threadId) qc.invalidateQueries({ queryKey: ["messages", threadId] });
      // Re-bump with the server's ids (covers sends where vars had no thread id
      // yet). Only refetch the lists for a brand-new conversation (row absent).
      const found = bumpThread(qc, {
        threadId,
        topicId,
        preview: vars.text,
        outbound: true,
      });
      if (!found) {
        // Brand-new conversation (compose's first send): drop a correct row in
        // at the top NOW so the inbox updates instantly, then refetch to heal.
        if (threadId || topicId) {
          insertNewThreadRow(qc, {
            id: threadId ?? topicId!,
            topicId: topicId ?? threadId!,
            subject: vars.isEmail ? vars.subject : undefined,
            participants: (vars.toList ?? []).map((p) => ({
              name: p.name || p.address,
              address: p.address,
            })),
            preview:
              vars.text || (vars.attachments?.length ? "📎 Attachment" : ""),
            updatedAt: new Date().toISOString(),
            isEmail: Boolean(vars.isEmail),
            unread: false,
            isGroup: Boolean(vars.isGroup),
            groupName: !vars.isEmail && vars.subject ? vars.subject : undefined,
          });
        }
        qc.invalidateQueries({ queryKey: ["threads"] });
        qc.invalidateQueries({ queryKey: ["chatThreads"] });
      }
    },
  });
}

/** Mark all messages in a thread as seen (clears the unread state). */
export async function markThreadSeen(threadId: string): Promise<unknown> {
  return apiSend(`/messages/thread/${threadId}/seen`, "PATCH");
}

export function useReactToMessage(threadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      apiSend(
        `/messages/message/${messageId}/reaction/${encodeURIComponent(emoji)}`,
        "POST",
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["messages", threadId] }),
  });
}

export function useRemoveReaction(threadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      headerId,
      reactionId,
    }: {
      headerId: string;
      reactionId: string;
    }) =>
      apiSend(`/messages/header/${headerId}/reaction/${reactionId}`, "DELETE"),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["messages", threadId] }),
  });
}

/** Fetch the original full HTML of a single message (for "See original"). */
export async function fetchMessageHtml(
  messageId: string,
): Promise<string | null> {
  const res = await apiGet<{ html?: string; message?: { html?: string } }>(
    `/messages/message/${messageId}`,
  );
  if (!res) return null;
  if (typeof res.html === "string") return res.html;
  if (res.message && typeof res.message.html === "string") return res.message.html;
  return null;
}
