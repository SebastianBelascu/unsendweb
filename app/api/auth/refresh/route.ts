import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  RT_COOKIE,
  callBackend,
  clearAuthCookies,
  setAuthCookies,
} from "@/lib/server/backend";

export async function POST(req: NextRequest) {
  const jar = await cookies();
  const rt = jar.get(RT_COOKIE)?.value;
  if (!rt) {
    return NextResponse.json({ message: "No session" }, { status: 401 });
  }

  const { deviceId } = await req.json().catch(() => ({}));

  const res = await callBackend("/auth/refresh-token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken: rt, deviceId }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data?.accessToken) {
    clearAuthCookies(jar);
    return NextResponse.json(data ?? { message: "Refresh failed" }, {
      status: res.status || 401,
    });
  }

  setAuthCookies(jar, {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
  });
  return NextResponse.json({ ok: true });
}
