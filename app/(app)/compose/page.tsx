import { ComposeWindow } from "@/components/mail/ComposeWindow";

// Native-style "new message" window (empty thread + bottom composer). Replaces
// the old centered compose modal for the New-message button.
// Next.js 16: searchParams is async — see context/11-nextjs16-conventions.md.
export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const isEmail = sp.type !== "chat";
  const initialTo =
    typeof sp.to === "string" && sp.to
      ? sp.to
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((address) => ({ address }))
      : undefined;

  return <ComposeWindow initialIsEmail={isEmail} initialTo={initialTo} />;
}
