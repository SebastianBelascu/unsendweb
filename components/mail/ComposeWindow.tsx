"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, MessageCircle, Mail } from "lucide-react";
import { MessageComposer } from "./MessageComposer";
import { threadUrlFromResponse } from "./Composer";
import { useComposerAttachments } from "./attachments";
import { useSendMessage } from "@/lib/api/messages";
import { updateChatName } from "@/lib/api/threads";
import { cn } from "@/lib/utils";
import type { Recipient } from "./RecipientInput";
import type { ComposerRecipients } from "./MessageComposer";

/**
 * New-message window — native `ComposeView` parity: an EMPTY conversation
 * screen whose only chrome is the composer pinned at the bottom. Recipients
 * (and the Chat/Email toggle) live inside the composer's expandable panel,
 * opened by default. Picking a recipient + sending creates the thread, then we
 * replace into the real conversation.
 */
export function ComposeWindow({
  initialIsEmail,
  initialTo,
}: {
  initialIsEmail: boolean;
  initialTo?: Recipient[];
}) {
  const router = useRouter();
  const [isEmail, setIsEmail] = useState(initialIsEmail);
  const att = useComposerAttachments();
  const send = useSendMessage();

  function onSubmit(text: string, recipients?: ComposerRecipients) {
    const toList = recipients?.toList ?? [];
    if (!toList.length || send.isPending) return;
    const dtos = att.readyDtos();
    // For a group chat the subject field carries the group name.
    const groupName = isEmail ? "" : (recipients?.subject ?? "").trim();
    send.mutate(
      {
        toList,
        ccList: isEmail && recipients?.ccList?.length ? recipients.ccList : undefined,
        bccList:
          isEmail && recipients?.bccList?.length ? recipients.bccList : undefined,
        subject: isEmail ? recipients?.subject : groupName || undefined,
        text,
        isEmail,
        isChat: !isEmail,
        isGroup: toList.length > 1,
        attachments: dtos.length ? dtos : undefined,
      },
      {
        onSuccess: (data) => {
          const tid = (data as { topicId?: string } | undefined)?.topicId;
          if (!isEmail && groupName && tid) {
            updateChatName(tid, groupName).catch(() => {});
          }
          const url = threadUrlFromResponse(data, toList);
          if (url) router.replace(url);
          else router.push("/inbox");
        },
      },
    );
    att.clear();
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Discard and go back"
          className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-headline font-bold text-ink-strong">New Message</h1>
      </header>

      {/* Empty conversation body — native shows a blank thread until the first
          message lands; a faint hint points the user at the composer below. */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-8 text-center text-faint">
        <span
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-full",
            isEmail ? "bg-email/15 text-email-light" : "bg-chat/20 text-chat-light",
          )}
        >
          {isEmail ? (
            <Mail className="h-6 w-6" />
          ) : (
            <MessageCircle className="h-6 w-6" />
          )}
        </span>
        <p className="text-subhead">
          {isEmail
            ? "Add a recipient and write your email below."
            : "Add a recipient and start the chat below."}
        </p>
      </div>

      <MessageComposer
        threadId="__compose__"
        isEmail={isEmail}
        att={att}
        editing={null}
        replyingTo={null}
        initialTo={initialTo ?? []}
        compose
        onToggleType={setIsEmail}
        onSubmit={onSubmit}
        onCancelEdit={() => {}}
        onCancelReply={() => {}}
        emitTyping={() => {}}
      />
    </div>
  );
}
