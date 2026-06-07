import { MessagesSquare } from "lucide-react";

/** iMessage-style empty right pane shown until a conversation is opened. */
export function EmptyDetail() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 text-faint">
        <MessagesSquare className="h-7 w-7" />
      </div>
      <p className="text-callout font-semibold text-muted">Select a conversation</p>
      <p className="text-subhead text-faint">
        Pick a chat or email from the list to start reading.
      </p>
    </div>
  );
}
