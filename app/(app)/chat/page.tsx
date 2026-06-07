import { redirect } from "next/navigation";

// The chat list is now the "Chats" chip in the unified inbox.
export default function ChatPage() {
  redirect("/inbox?view=chats");
}
