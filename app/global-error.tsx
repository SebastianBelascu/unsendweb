"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/observability";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, { boundary: "global", digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          background: "#121110",
          color: "#f0f0f0",
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 16,
          textAlign: "center",
          padding: 24,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Something went wrong</h2>
        <p style={{ color: "#a0a0a0", maxWidth: 360 }}>
          The app hit an unexpected error. Reloading usually fixes it.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            background: "#252320",
            color: "#fff",
            border: "none",
            borderRadius: 9999,
            padding: "8px 20px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
