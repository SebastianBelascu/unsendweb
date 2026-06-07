import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AT_COOKIE, RT_COOKIE, USER_COOKIE } from "@/lib/server/backend";

export async function GET() {
  const jar = await cookies();
  const rt = jar.get(RT_COOKIE)?.value;
  if (!rt) {
    return NextResponse.json({ user: null, authenticated: false }, {
      status: 401,
    });
  }
  const userRaw = jar.get(USER_COOKIE)?.value;
  let user: unknown = null;
  try {
    user = userRaw ? JSON.parse(userRaw) : null;
  } catch {
    user = null;
  }
  return NextResponse.json({
    user,
    authenticated: Boolean(jar.get(AT_COOKIE)?.value || rt),
  });
}
