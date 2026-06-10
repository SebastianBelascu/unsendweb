"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { login } from "@/lib/api/auth";
import { clearPersistedQueryCache } from "@/lib/query-cache";
import { clearAllDrafts } from "@/lib/drafts";

export function LoginForm() {
  const router = useRouter();
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(username.trim(), password);
      // Wipe any previous account's cached data (in-memory + persisted) so the
      // new account never sees the old one's threads/messages/drafts.
      qc.clear();
      clearPersistedQueryCache();
      clearAllDrafts();
      router.replace("/mail/inbox");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl border border-line bg-surface-card p-8"
      >
        <div className="mb-8 text-center">
          <span className="text-[28px] font-bold lowercase tracking-tight text-ink-strong">
            unsend
          </span>
          <p className="mt-1 text-footnote text-faint">
            Sign in to your account
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-footnote text-accent">
            {error}
            {/^.*verif/i.test(error) && (
              <>
                {" "}
                <Link href="/signup" className="font-semibold underline">
                  Finish verification
                </Link>
              </>
            )}
          </div>
        )}

        <label className="mb-4 block">
          <span className="mb-1 block text-footnote text-muted">
            Username or phone
          </span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            autoComplete="username"
            className="h-[44px] w-full rounded-lg border border-line-strong bg-canvas px-3 text-body text-ink-strong outline-none placeholder:text-faint focus:border-muted"
            placeholder="you"
          />
        </label>

        <label className="mb-6 block">
          <span className="mb-1 block text-footnote text-muted">Password</span>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="h-[44px] w-full rounded-lg border border-line-strong bg-canvas px-3 pr-10 text-body text-ink-strong outline-none placeholder:text-faint focus:border-muted"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-faint hover:text-ink"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </label>

        <button
          type="submit"
          disabled={busy || !username.trim() || !password}
          className="flex h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-accent text-body font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <div className="mt-4 flex items-center justify-between text-footnote">
          <Link href="/forgot" className="text-link hover:underline">
            Forgot password?
          </Link>
          <Link href="/signup" className="text-link hover:underline">
            Sign up
          </Link>
        </div>
      </form>
    </div>
  );
}
