import { notFound } from "next/navigation";
import { Mail } from "lucide-react";
import { isMailFilter } from "@/lib/types";

// The list is rendered by the mail layout; this page is the right-pane
// placeholder shown on desktop until a conversation is opened.
export default async function MailFilterPage({
  params,
}: {
  params: Promise<{ filter: string }>;
}) {
  const { filter } = await params;
  if (!isMailFilter(filter)) notFound();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-faint">
      <Mail className="h-10 w-10" />
      <p className="text-[15px]">Select a conversation to read</p>
    </div>
  );
}
