import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DeviceRegistrar } from "@/components/DeviceRegistrar";
import { InboxShell } from "@/components/shell/InboxShell";
import { ComposeModal } from "@/components/mail/ComposeModal";
import { CallHost } from "@/components/calls/CallHost";
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
      <DeviceRegistrar />
      {/* useSearchParams in the shell needs a Suspense boundary. */}
      <Suspense fallback={null}>
        <InboxShell>{children}</InboxShell>
      </Suspense>
      <ComposeModal />
      <CallHost />
    </SocketProvider>
  );
}
