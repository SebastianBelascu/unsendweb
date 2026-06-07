import { ConversationView } from "@/components/mail/ConversationView";

// Next.js 16: params/searchParams are async — see context/11-nextjs16-conventions.md.
// The [topicId] segment carries the per-user threadId.
export default async function ChatThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ topicId: string }>;
  searchParams: Promise<{ n?: string; t?: string; a?: string; g?: string }>;
}) {
  const { topicId } = await params;
  const { n, t, a, g } = await searchParams;
  return (
    <ConversationView
      id={topicId}
      isEmail={false}
      title={n && n.trim() ? n : "Chat"}
      topicId={t}
      recipientAddress={a}
      isGroup={g === "1"}
    />
  );
}
