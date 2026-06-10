import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { AT_COOKIE } from "@/lib/server/backend";

/*
  GIF BFF (Tenor). The backend has no GIF concept — a GIF is just an `image/gif`
  attachment — so this is a pure frontend feature: search Tenor server-side
  (keeps the key off the client) and proxy the chosen GIF's bytes (Tenor's CDN
  doesn't send CORS headers, so a client-side blob fetch would fail). Auth-gated.

  The key mirrors the native app's bundled Tenor key; override with TENOR_API_KEY.
*/
const TENOR_KEY =
  process.env.TENOR_API_KEY || "AIzaSyDPNNKTIR0Bweol5rRAlvA4YEbTjci-cUw";

function isTenorHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === "tenor.com" || h.endsWith(".tenor.com");
}

export async function GET(req: NextRequest) {
  const jar = await cookies();
  if (!jar.get(AT_COOKIE)?.value)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;

  // --- Download proxy: stream a chosen GIF's bytes (Tenor hosts only). ---
  const media = sp.get("media");
  if (media) {
    let url: URL;
    try {
      url = new URL(media);
    } catch {
      return NextResponse.json({ error: "bad url" }, { status: 400 });
    }
    if (url.protocol !== "https:" || !isTenorHost(url.hostname))
      return NextResponse.json({ error: "blocked" }, { status: 400 });
    try {
      const r = await fetch(url.href, { signal: AbortSignal.timeout(8000) });
      if (!r.ok)
        return NextResponse.json({ error: "fetch failed" }, { status: 502 });
      const buf = await r.arrayBuffer();
      return new NextResponse(buf, {
        headers: {
          "content-type": r.headers.get("content-type") || "image/gif",
          "cache-control": "public, max-age=86400",
        },
      });
    } catch {
      return NextResponse.json({ error: "fetch failed" }, { status: 502 });
    }
  }

  // --- Search (or trending when q is empty). ---
  const q = (sp.get("q") || "").trim();
  const pos = sp.get("pos") || "";
  const endpoint = q
    ? `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(q)}`
    : "https://tenor.googleapis.com/v2/featured?";
  const api =
    `${endpoint}&key=${TENOR_KEY}&client_key=unsendweb&limit=24` +
    `&media_filter=gif,mediumgif,tinygif&contentfilter=medium` +
    (pos ? `&pos=${encodeURIComponent(pos)}` : "");

  try {
    const r = await fetch(api, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return NextResponse.json({ results: [], next: "" });
    type TenorResult = {
      id?: string | number;
      content_description?: string;
      media_formats?: Record<string, { url?: string; dims?: number[] }>;
    };
    const data = (await r.json()) as { results?: TenorResult[]; next?: string };
    const results = (data.results ?? [])
      .map((g: TenorResult) => {
        const f = g.media_formats ?? {};
        return {
          id: String(g.id ?? ""),
          description: g.content_description || "GIF",
          preview: f.tinygif?.url || f.nanogif?.url || "",
          gif: f.mediumgif?.url || f.gif?.url || "",
          width: f.tinygif?.dims?.[0],
          height: f.tinygif?.dims?.[1],
        };
      })
      .filter((g: { preview: string; gif: string }) => g.preview && g.gif);
    return NextResponse.json({ results, next: data.next || "" });
  } catch {
    return NextResponse.json({ results: [], next: "" });
  }
}
