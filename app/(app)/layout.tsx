import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MailSidebar } from "@/components/mail/MailSidebar";
import { SocketProvider } from "@/lib/socket/SocketProvider";
import { RT_COOKIE } from "@/lib/server/backend";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jar = await cookies();
  if (!jar.get(RT_COOKIE)?.value) redirect("/login");

  return (
    <SocketProvider>
      <div className="flex h-screen overflow-hidden">
        <MailSidebar />
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </SocketProvider>
  );
}
