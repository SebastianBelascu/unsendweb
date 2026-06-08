import { EmptyDetail } from "@/components/shell/EmptyDetail";
import { AutoOpenLatest } from "@/components/shell/AutoOpenLatest";

// The list lives in the shell (InboxShell); this is the right-pane default.
// On desktop it auto-opens the most recent conversation so it's never empty.
export default function InboxPage() {
  return (
    <>
      <AutoOpenLatest />
      <EmptyDetail />
    </>
  );
}
