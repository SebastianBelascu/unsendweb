import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { RT_COOKIE } from "@/lib/server/backend";

export default async function LoginPage() {
  const jar = await cookies();
  if (jar.get(RT_COOKIE)?.value) redirect("/mail/inbox");
  return <LoginForm />;
}
