import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AT_COOKIE } from "@/lib/server/backend";

/*
  Returns a short-lived access token for the Socket.IO handshake. The socket
  needs a JS-readable token (the gateway reads handshake.auth.token after the
  backend fix), which httpOnly cookies can't provide — so we expose the current
  access token here only for the websocket. See context/04-auth-sessions-deviceid.md.
*/
export async function GET() {
  const jar = await cookies();
  const at = jar.get(AT_COOKIE)?.value;
  if (!at) return NextResponse.json({ token: null }, { status: 401 });
  return NextResponse.json({ token: at });
}
