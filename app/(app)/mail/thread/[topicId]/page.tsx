import { ConversationView } from "@/components/mail/ConversationView";

// Next.js 16: params/searchParams are async — see context/11-nextjs16-conventions.md.
// The [topicId] segment carries the per-user threadId. Email renders as a
// green chat-style conversation with a "See original" button per message.
export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ topicId: string }>;
  searchParams: Promise<{ s?: string; tid?: string }>;
}) {
  const { topicId } = await params;
  const { s, tid } = await searchParams;
  return (
    <ConversationView
      id={topicId}
      isEmail
      title={s && s.trim() ? s : "(no subject)"}
      subject={s}
      topicId={tid}
    />
  );
}
