import { Composer, type ComposerInitial } from "@/components/mail/Composer";

function ensurePrefix(prefix: string, subject: string): string {
  const s = subject.trim();
  if (!s) return prefix.trim();
  if (s.toLowerCase().startsWith(prefix.trim().toLowerCase())) return s;
  return prefix + s;
}

// Next.js 16: searchParams is async — see context/11-nextjs16-conventions.md.
export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<{
    mode?: string;
    s?: string;
    to?: string;
    threadId?: string;
    tid?: string;
    type?: string;
  }>;
}) {
  const sp = await searchParams;
  const mode =
    sp.mode === "reply" || sp.mode === "replyAll" || sp.mode === "forward"
      ? sp.mode
      : "new";
  const subject = typeof sp.s === "string" ? sp.s : "";
  const to = typeof sp.to === "string" ? sp.to : "";
  // Replies/forwards keep the thread's type (email here); a new message
  // defaults to email unless launched from "New chat" (?type=chat).
  const isEmail = mode === "new" ? sp.type !== "chat" : true;

  const initial: ComposerInitial = {
    mode,
    to: mode === "forward" ? "" : to,
    cc: "",
    subject:
      mode === "forward"
        ? ensurePrefix("Fwd: ", subject)
        : mode === "new"
          ? subject
          : ensurePrefix("Re: ", subject),
    body: "",
    isEmail,
    threadId: typeof sp.threadId === "string" ? sp.threadId : undefined,
    topicId: typeof sp.tid === "string" ? sp.tid : undefined,
  };

  return <Composer initial={initial} />;
}
