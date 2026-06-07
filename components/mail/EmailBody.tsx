"use client";

import DOMPurify from "dompurify";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";

/*
  Safe HTML email rendering. Like the native clients, content images load by
  default — only tracking pixels are neutralized. The markup is DOMPurify-
  sanitized (no scripts/handlers) and rendered in a sandboxed iframe WITHOUT
  allow-scripts. The email keeps its own inline styles; we only add a dark
  background + link color. See context/07-feature-email.md.
*/

const FRAME_STYLES = `
  :root { color-scheme: dark; }
  html, body { margin: 0; padding: 0; }
  body {
    background: #121110; color: #f0f0f0;
    font-size: 15px; line-height: 1.5; word-wrap: break-word; overflow-wrap: anywhere;
  }
  a { color: #44BCFF; }
  img { max-width: 100%; height: auto; }
`;

function isTrackingPixel(el: Element): boolean {
  const src = el.getAttribute("src") || "";
  if (
    /beacon|pixel|1x1|open\.aspx|usermatch|ad_impression|\/track|\/wf\/open/i.test(
      src,
    )
  ) {
    return true;
  }
  const w = el.getAttribute("width");
  const h = el.getAttribute("height");
  if ((w === "1" || w === "0") && (h === "1" || h === "0")) return true;
  return false;
}

function sanitizeEmail(html: string): string {
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    const el = node as Element;
    if (el.tagName === "A") {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
    }
    if (el.tagName === "IMG" && isTrackingPixel(el)) {
      el.removeAttribute("src");
      el.removeAttribute("srcset");
    }
  });

  const clean = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["target"],
    // Keep the email's own <style>; drop only external/dangerous tags.
    FORBID_TAGS: ["script", "link", "meta", "base"],
  });

  DOMPurify.removeHook("afterSanitizeAttributes");
  return clean;
}

export function EmailBody({ html, text }: { html?: string; text?: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(160);

  // Client-only render guard (DOMPurify needs a DOM); avoids setState-in-effect.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const clean = useMemo(
    () => (mounted && html ? sanitizeEmail(html) : ""),
    [mounted, html],
  );

  const srcDoc = useMemo(() => {
    if (!clean) return "";
    const csp =
      "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src https: data:;";
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>${FRAME_STYLES}</style></head><body>${clean}</body></html>`;
  }, [clean]);

  function measure() {
    const doc = frameRef.current?.contentDocument;
    if (doc?.documentElement) setHeight(doc.documentElement.scrollHeight + 4);
  }

  if (!html) {
    return (
      <div className="whitespace-pre-wrap break-words text-body leading-relaxed text-ink">
        {text}
      </div>
    );
  }

  if (!mounted) {
    return <div className="h-40 animate-pulse rounded bg-surface-2" />;
  }

  return (
    <iframe
      ref={frameRef}
      title="Email content"
      sandbox="allow-same-origin allow-popups"
      srcDoc={srcDoc}
      onLoad={measure}
      style={{ width: "100%", height, border: "0" }}
    />
  );
}
