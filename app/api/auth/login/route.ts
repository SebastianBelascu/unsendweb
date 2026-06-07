import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { callBackend, setAuthCookies } from "@/lib/server/backend";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  const res = await callBackend("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data?.accessToken) {
    return NextResponse.json(data ?? { message: "Login failed" }, {
      status: res.status || 400,
    });
  }

  const jar = await cookies();
  setAuthCookies(
    jar,
    { accessToken: data.accessToken, refreshToken: data.refreshToken },
    data.user,
  );

  return NextResponse.json({ user: data.user });
}
