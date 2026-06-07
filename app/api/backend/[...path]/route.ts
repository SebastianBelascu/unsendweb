import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { AT_COOKIE, BACKEND_BASE } from "@/lib/server/backend";

/*
  Catch-all BFF proxy: the browser calls /api/backend/<path> (same-origin) and
  this forwards to the real backend with the access token from the httpOnly
  cookie. On 401 the client refreshes (POST /api/auth/refresh) and retries.
  See context/04-auth-sessions-deviceid.md.
*/
async function handle(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path } = await ctx.params;
  const jar = await cookies();
  const at = jar.get(AT_COOKIE)?.value;

  const target = `${BACKEND_BASE}/${path.join("/")}${req.nextUrl.search}`;

  const headers: Record<string, string> = {};
  const ct = req.headers.get("content-type");
  if (ct) headers["content-type"] = ct;
  const accept = req.headers.get("accept");
  if (accept) headers["accept"] = accept;
  if (at) headers["authorization"] = `Bearer ${at}`;
  // Forward the originating socket id so the backend can suppress self-echo.
  const socketId = req.headers.get("x-socket-id");
  if (socketId) headers["x-socket-id"] = socketId;

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const body = hasBody ? await req.arrayBuffer() : undefined;

  const res = await fetch(target, {
    method: req.method,
    headers,
    body,
    cache: "no-store",
  });

  const buf = await res.arrayBuffer();
  return new NextResponse(buf, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") ?? "application/json",
    },
  });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
