import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiSend } from "./http";
import { mapMessage } from "./mappers";
import { bumpThread } from "../realtime/threadCache";
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

export function useThreadMessages(threadId: string) {
  return useQuery({
    queryKey: ["messages", threadId],
    queryFn: () => fetchThreadMessages(threadId),
    enabled: Boolean(threadId),
    // Polling stand-in for realtime (the socket gateway can't be reached from a
    // browser without a backend change — see context/03 + sockets.service.ts).
    refetchInterval: 15_000,
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
    onSuccess: (data, vars) => {
      const r = (data ?? {}) as { threadId?: string; topicId?: string };
      const threadId = r.threadId ?? vars.threadId;
      if (threadId) qc.invalidateQueries({ queryKey: ["messages", threadId] });
      // Bump our own thread to the top instantly — the list endpoint reports a
      // stale order for a few seconds after a send (it commits updatedAt after
      // responding). Only refetch the lists for a brand-new conversation.
      const found = bumpThread(qc, {
        threadId,
        topicId: r.topicId ?? vars.topicId,
        preview: vars.text,
        outbound: true,
      });
      if (!found) {
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
