import { redirect } from "next/navigation";

// The emails list is now the "Emails" chip in the unified inbox.
export default function EmailsPage() {
  redirect("/inbox?view=emails");
}
