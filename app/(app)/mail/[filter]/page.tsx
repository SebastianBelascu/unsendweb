import { notFound, redirect } from "next/navigation";
import { isMailFilter } from "@/lib/types";

// Legacy mail-filter routes now map to the unified inbox chips.
export default async function MailFilterPage({
  params,
}: {
  params: Promise<{ filter: string }>;
}) {
  const { filter } = await params;
  if (!isMailFilter(filter)) notFound();
  redirect(`/inbox?view=${filter === "inbox" ? "all" : filter}`);
}
