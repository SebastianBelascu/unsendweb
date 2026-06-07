import { redirect } from "next/navigation";

export default function Home() {
  // The mail surface is the default landing for now (email-first).
  redirect("/mail/inbox");
}
