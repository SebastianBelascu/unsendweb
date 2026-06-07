import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { AT_COOKIE, BACKEND_BASE } from "@/lib/server/backend";

/*
  BFF upload proxy. The browser can't PUT directly to the S3 presigned URL
  (cross-origin → blocked unless the bucket has CORS for our origin). So the
  browser POSTs the bytes here and the server: (1) fetches a presigned PUT URL
  from the backend, (2) PUTs the bytes to S3 server-side (no CORS), (3) returns
  the stable public URL (presigned minus its query). Used for avatars + message
  attachments. The presigned URL is obtained server-side (no SSRF risk).
*/
export async function POST(req: NextRequest) {
  const jar = await cookies();
  const at = jar.get(AT_COOKIE)?.value;
  if (!at) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const kind = req.headers.get("x-kind");
  const rawName = req.headers.get("x-filename") || "file";
  const filename = (() => {
    try {
      return decodeURIComponent(rawName);
    } catch {
      return rawName;
    }
  })();
  const contentType =
    req.headers.get("x-content-type") || "application/octet-stream";
  if (kind !== "avatar" && kind !== "attachment")
    return NextResponse.json({ error: "bad kind" }, { status: 400 });

  // 1. Presigned PUT URL from the backend (server-side, authed).
  const signPath =
    kind === "avatar"
      ? `/settings/profileImage/${encodeURIComponent(filename)}`
      : `/messages/attachment/${encodeURIComponent(filename)}`;
  const signRes = await fetch(`${BACKEND_BASE}${signPath}`, {
    headers: { accept: "application/json", authorization: `Bearer ${at}` },
    cache: "no-store",
  });
  if (!signRes.ok)
    return NextResponse.json({ error: "sign failed" }, { status: 502 });
  const signed = (await signRes.json()) as { url?: string; filename?: string };
  if (!signed?.url)
    return NextResponse.json({ error: "no signed url" }, { status: 502 });

  // 2. PUT bytes to S3 server-side (no browser CORS).
  const body = await req.arrayBuffer();
  const put = await fetch(signed.url, {
    method: "PUT",
    headers: { "content-type": contentType },
    body,
  });
  if (!put.ok)
    return NextResponse.json({ error: `s3 ${put.status}` }, { status: 502 });

  // 3. Stable public URL = presigned minus its signature query.
  return NextResponse.json({
    url: signed.url.split("?")[0],
    filename: signed.filename ?? filename,
  });
}
