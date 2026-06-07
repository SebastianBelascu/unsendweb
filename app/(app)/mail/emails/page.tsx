import { Mail } from "lucide-react";

// The email-only inbox list is rendered by the mail layout (emailOnly); this is
// the right-pane placeholder shown on desktop until a conversation is opened.
export default function EmailsPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-faint">
      <Mail className="h-10 w-10" />
      <p className="text-[15px]">Select a conversation to read</p>
    </div>
  );
}
