import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { AT_COOKIE } from "@/lib/server/backend";

/*
  Link-preview BFF. The backend doesn't store OG metadata (only a
  `withUrlPreview` flag), so — like the native client — we fetch the page
  server-side (avoids browser CORS) and extract OpenGraph tags. Auth-gated and
  SSRF-guarded (blocks localhost / private ranges). 24h cache.
*/

function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h === "::1") return true;
  // IPv4 private / link-local / loopback ranges.
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  const m = h.match(/^172\.(\d+)\./);
  if (m && +m[1] >= 16 && +m[1] <= 31) return true;
  return false;
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#x2F;/g, "/")
    .trim();
}

export async function GET(req: NextRequest) {
  const jar = await cookies();
  if (!jar.get(AT_COOKIE)?.value)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const raw = req.nextUrl.searchParams.get("url") ?? "";
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "bad url" }, { status: 400 });
  }
  if (
    (target.protocol !== "http:" && target.protocol !== "https:") ||
    isBlockedHost(target.hostname)
  )
    return NextResponse.json({ error: "blocked" }, { status: 400 });

  const empty = { url: raw, domain: target.hostname.replace(/^www\./, "") };
  try {
    const res = await fetch(target.href, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; UnsendBot/1.0; +https://unsend.app)",
        accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
    });
    const ct = res.headers.get("content-type") || "";
    if (!res.ok || !ct.includes("text/html"))
      return NextResponse.json(empty);

    const html = (await res.text()).slice(0, 400_000);
    const finalUrl = res.url || target.href;
    const meta = (prop: string): string => {
      const a = new RegExp(
        `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`,
        "i",
      );
      const b = new RegExp(
        `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`,
        "i",
      );
      return html.match(a)?.[1] || html.match(b)?.[1] || "";
    };
    const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || "";
    let image = meta("og:image") || meta("twitter:image");
    if (image && !/^https?:\/\//i.test(image)) {
      try {
        image = new URL(image, finalUrl).href;
      } catch {
        image = "";
      }
    }
    return NextResponse.json(
      {
        url: raw,
        domain: new URL(finalUrl).hostname.replace(/^www\./, ""),
        title: decode(meta("og:title") || titleTag),
        description: decode(meta("og:description") || meta("description")),
        image: image || undefined,
      },
      { headers: { "cache-control": "public, max-age=86400" } },
    );
  } catch {
    return NextResponse.json(empty);
  }
}
