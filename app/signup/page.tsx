import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { RT_COOKIE } from "@/lib/server/backend";

export default async function SignUpPage() {
  const jar = await cookies();
  if (jar.get(RT_COOKIE)?.value) redirect("/mail/inbox");
  return <SignUpForm />;
}
