import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { RT_COOKIE } from "@/lib/server/backend";

export default async function ForgotPage() {
  const jar = await cookies();
  if (jar.get(RT_COOKIE)?.value) redirect("/mail/inbox");
  return <ForgotPasswordForm />;
}
