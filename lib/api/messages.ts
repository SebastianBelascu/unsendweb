import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiSend } from "./http";
import { mapMessage } from "./mappers";
import type { MessagesResponse } from "./backend-types";
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
}

export async function sendMessage(input: SendMessageInput): Promise<unknown> {
  // The backend reads payload.ccList.map / bccList.map without a null-check,
  // so these MUST always be arrays (chat sends would otherwise 500).
  return apiSend("/messages", "POST", {
    ...input,
    ccList: input.ccList ?? [],
    bccList: input.bccList ?? [],
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: sendMessage,
    onSuccess: (_data, vars) => {
      if (vars.threadId) {
        qc.invalidateQueries({ queryKey: ["messages", vars.threadId] });
      }
      qc.invalidateQueries({ queryKey: ["threads"] });
      qc.invalidateQueries({ queryKey: ["chatThreads"] });
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
