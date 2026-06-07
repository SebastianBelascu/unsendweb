import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { RT_COOKIE } from "@/lib/server/backend";

export default async function ForgotPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const jar = await cookies();
  if (jar.get(RT_COOKIE)?.value) redirect("/mail/inbox");
  const sp = await searchParams;
  return (
    <ForgotPasswordForm
      initialToken={typeof sp.token === "string" ? sp.token : ""}
    />
  );
}
