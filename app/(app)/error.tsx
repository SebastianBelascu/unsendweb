"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { reportError } from "@/lib/observability";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, { boundary: "app", digest: error.digest });
  }, [error]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <h2 className="text-[18px] font-bold text-ink-strong">
        Something went wrong
      </h2>
      <p className="max-w-sm text-[14px] text-muted">
        This screen hit an unexpected error. You can retry, or head back to your
        inbox.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="flex items-center gap-2 rounded-full bg-surface-2 px-5 py-2 text-[14px] font-semibold text-ink hover:bg-surface-3"
        >
          <RotateCcw className="h-4 w-4" /> Try again
        </button>
        <Link
          href="/mail/inbox"
          className="rounded-full border border-line-strong px-5 py-2 text-[14px] font-semibold text-muted hover:text-ink"
        >
          Go to inbox
        </Link>
      </div>
    </div>
  );
}
