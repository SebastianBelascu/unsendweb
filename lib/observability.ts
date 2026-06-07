/*
  Lightweight, dependency-free error reporting. Captures React-boundary errors
  (via error.tsx/global-error.tsx) plus uncaught errors and unhandled promise
  rejections. Forwards to an optional beacon endpoint when configured; otherwise
  logs. Swap reportError's body for Sentry.captureException once a DSN exists.
*/

const BEACON = process.env.NEXT_PUBLIC_ERROR_BEACON_URL;

type Meta = Record<string, unknown>;

function redact(input: string): string {
  // Avoid shipping obvious secrets in messages/stacks.
  return input
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]")
    .replace(/(token|password|otp|code)=([^&\s]+)/gi, "$1=[redacted]");
}

/** Best-effort message from anything that can be thrown/rejected. */
function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message || "";
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "";
}

// Browser noise that carries no actionable signal — never report or log it.
const BENIGN = [
  "ResizeObserver loop", // fires when an observer callback reflows; harmless
  "Script error.", // opaque cross-origin error with no usable detail
];

function isNoise(message: string): boolean {
  const text = message.trim();
  // Empty message = a signal-less event (was logged as `[observability] {}`).
  if (!text) return true;
  return BENIGN.some((p) => text.includes(p));
}

export function reportError(error: unknown, meta: Meta = {}): void {
  const message = messageOf(error);
  if (isNoise(message)) return;

  const err = error instanceof Error ? error : new Error(message);
  const payload = {
    message: redact(message),
    stack: err.stack ? redact(err.stack) : undefined,
    meta,
    url: typeof location !== "undefined" ? location.pathname : undefined,
  };

  // console.warn (not console.error) so Next's dev overlay doesn't pop a red
  // "Console Error" box for errors we've already handled and reported.
  if (process.env.NODE_ENV !== "production") {
    console.warn("[observability]", payload);
  }
  if (BEACON && typeof navigator !== "undefined" && "sendBeacon" in navigator) {
    try {
      navigator.sendBeacon(BEACON, JSON.stringify(payload));
    } catch {
      /* best-effort */
    }
  }
}

let installed = false;

/** Attach global handlers once (called from a client provider on mount). */
export function installGlobalErrorHandlers(): () => void {
  if (installed || typeof window === "undefined") return () => {};
  installed = true;
  const onError = (e: ErrorEvent) => {
    // Resource-load failures (img/script 404, e.g. an avatar that isn't there)
    // surface as an error Event on the element, not on window — ignore them.
    if (e.target && e.target !== window) return;
    reportError(e.error ?? e.message, { kind: "window.onerror" });
  };
  const onRejection = (e: PromiseRejectionEvent) =>
    reportError(e.reason, { kind: "unhandledrejection" });
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    installed = false;
  };
}
