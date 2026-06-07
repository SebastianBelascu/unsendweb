"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  requestPasswordReset,
  resetPassword,
  verifyResetCode,
} from "@/lib/api/auth";
import { ApiError } from "@/lib/api/http";

const inputCls =
  "h-[44px] w-full rounded-lg border border-line-strong bg-canvas px-3 text-body text-ink-strong outline-none placeholder:text-faint focus:border-muted";

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    const m = (e.data as { message?: string | string[] })?.message;
    if (typeof m === "string") return m;
    if (Array.isArray(m) && m.length) {
      const first = m[0] as unknown;
      if (typeof first === "string") return first;
      if (first && typeof first === "object")
        return String(Object.values(first)[0] ?? fallback);
    }
  }
  return fallback;
}

type Step = "id" | "code" | "pw" | "done";

export function ForgotPasswordForm({
  initialToken = "",
}: {
  initialToken?: string;
}) {
  // A reset deep link (?token=) jumps straight to choosing a new password.
  const [step, setStep] = useState<Step>(initialToken ? "pw" : "id");
  const [userData, setUserData] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitId(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await requestPasswordReset(userData.trim());
      if (!res?.phone) {
        // Neutral wording — don't confirm whether an account exists.
        setError("We couldn't start a reset. Check your username, email, or phone and try again.");
      } else {
        setPhone(res.phone);
        setStep("code");
      }
    } catch {
      setError("We couldn't start a reset. Check your username, email, or phone and try again.");
    }
    setBusy(false);
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await verifyResetCode(phone, code.trim());
      setToken(res.token);
      setStep("pw");
    } catch (err) {
      setError(errMsg(err, "Invalid code."));
    }
    setBusy(false);
  }

  async function submitPw(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token)
      return setError("Reset link is invalid or expired. Start the reset again.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    setBusy(true);
    try {
      await resetPassword(token, password);
      setStep("done");
    } catch (err) {
      setError(errMsg(err, "Couldn't reset password."));
    }
    setBusy(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface-card p-8">
        <h1 className="mb-1 text-[22px] font-bold text-ink-strong">
          Reset password
        </h1>
        <p className="mb-6 text-footnote text-faint">
          {step === "id" && "Enter your username, email, or phone."}
          {step === "code" && "Enter the 6-digit code we sent by SMS."}
          {step === "pw" && "Choose a new password."}
          {step === "done" && "All set."}
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-footnote text-accent">
            {error}
          </div>
        )}

        {step === "id" && (
          <form onSubmit={submitId} className="flex flex-col gap-4">
            <input
              value={userData}
              onChange={(e) => setUserData(e.target.value)}
              autoFocus
              placeholder="Username, email, or phone"
              className={inputCls}
            />
            <SubmitButton busy={busy} disabled={!userData.trim()} label="Send code" />
          </form>
        )}

        {step === "code" && (
          <form onSubmit={submitCode} className="flex flex-col gap-4">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              autoFocus
              inputMode="numeric"
              placeholder="6-digit code"
              className={inputCls}
            />
            <SubmitButton busy={busy} disabled={code.length !== 6} label="Verify" />
          </form>
        )}

        {step === "pw" && (
          <form onSubmit={submitPw} className="flex flex-col gap-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              placeholder="New password"
              autoComplete="new-password"
              className={inputCls}
            />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm new password"
              autoComplete="new-password"
              className={inputCls}
            />
            <SubmitButton busy={busy} disabled={!password || !confirm || !token} label="Update password" />
          </form>
        )}

        {step === "done" && (
          <Link
            href="/login"
            className="flex h-[44px] w-full items-center justify-center rounded-lg bg-accent text-body font-semibold text-white"
          >
            Back to sign in
          </Link>
        )}

        {step !== "done" && (
          <p className="mt-4 text-center text-footnote text-faint">
            <Link href="/login" className="text-link hover:underline">
              Back to sign in
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

function SubmitButton({
  busy,
  disabled,
  label,
}: {
  busy: boolean;
  disabled: boolean;
  label: string;
}) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className="flex h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-accent text-body font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {label}
    </button>
  );
}
