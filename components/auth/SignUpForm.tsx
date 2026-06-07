"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  registerUser,
  resendVerificationCode,
  sendCode,
  verifyRegistration,
} from "@/lib/api/auth";
import { ApiError } from "@/lib/api/http";

const inputCls =
  "h-[44px] w-full rounded-lg border border-line-strong bg-canvas px-3 text-body text-ink-strong outline-none placeholder:text-faint focus:border-muted";

// Mirror the backend validation so the user gets feedback before submitting.
const USERNAME_RE = /^[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*$/;
const PHONE_RE = /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{4}[-\s.]?[0-9]{4,6}$/;

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

function toDDMMYYYY(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}-${m}-${y}` : iso;
}

export function SignUpForm({ initialInvite = "" }: { initialInvite?: string }) {
  const [step, setStep] = useState<"form" | "code" | "done">("form");
  const [f, setF] = useState({
    invitationCode: initialInvite,
    firstName: "",
    lastName: "",
    username: "",
    phone: "",
    password: "",
    birthDate: "",
  });
  const [code, setCode] = useState("");
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Resend cooldown countdown (decrements via timeout, not a render-time clock).
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((cur) => ({ ...cur, [k]: e.target.value }));

  const usernameError =
    f.username && (f.username.length < 3 || f.username.length > 30 || !USERNAME_RE.test(f.username))
      ? "3–30 letters/numbers; dots allowed (not leading, trailing, or doubled)."
      : "";
  const phoneError =
    f.phone && !PHONE_RE.test(f.phone.trim()) ? "Enter a valid phone number." : "";
  const passwordError =
    f.password && f.password.length < 8 ? "At least 8 characters." : "";

  const formValid =
    f.invitationCode.trim() &&
    f.firstName.trim() &&
    f.username.length >= 3 &&
    f.username.length <= 30 &&
    USERNAME_RE.test(f.username) &&
    PHONE_RE.test(f.phone.trim()) &&
    f.password.length >= 8 &&
    f.birthDate;

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await registerUser({
        firstName: f.firstName.trim(),
        lastName: f.lastName.trim(),
        gender: "male",
        birthDate: toDDMMYYYY(f.birthDate),
        username: f.username.trim().toLowerCase(),
        phone: f.phone.trim(),
        password: f.password,
        invitationCode: f.invitationCode.trim(),
      });
      await sendCode(f.phone.trim()).catch(() => {});
      setStep("code");
      setCooldown(30);
    } catch (err) {
      setError(errMsg(err, "Couldn't create your account."));
    }
    setBusy(false);
  }

  async function resend() {
    if (cooldown > 0 || busy) return;
    setError(null);
    try {
      await resendVerificationCode(f.username.trim().toLowerCase());
      setCooldown(30);
    } catch (err) {
      setError(errMsg(err, "Couldn't resend the code."));
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!terms) return setError("Please accept the terms to continue.");
    setBusy(true);
    try {
      await verifyRegistration(f.phone.trim(), code.trim(), f.password);
      setStep("done");
    } catch (err) {
      setError(errMsg(err, "Invalid code."));
    }
    setBusy(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface-card p-8">
        <h1 className="mb-1 text-[22px] font-bold text-ink-strong">
          {step === "done" ? "You're in 🎉" : "Create your account"}
        </h1>
        <p className="mb-6 text-footnote text-faint">
          {step === "form" && "Unsend is invite-only — enter your code to start."}
          {step === "code" && "Enter the 6-digit code we sent by SMS."}
          {step === "done" && "Your account is verified."}
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-footnote text-accent">
            {error}
          </div>
        )}

        {step === "form" && (
          <form onSubmit={submitForm} className="flex flex-col gap-3">
            <input value={f.invitationCode} onChange={set("invitationCode")} placeholder="Invitation code" className={inputCls} />
            <div className="grid grid-cols-2 gap-3">
              <input value={f.firstName} onChange={set("firstName")} placeholder="First name" className={inputCls} />
              <input value={f.lastName} onChange={set("lastName")} placeholder="Last name" className={inputCls} />
            </div>
            <div>
              <input value={f.username} onChange={set("username")} placeholder="Username" autoCapitalize="none" className={inputCls} />
              {usernameError && (
                <p className="mt-1 text-caption text-accent">{usernameError}</p>
              )}
            </div>
            <div>
              <input value={f.phone} onChange={set("phone")} placeholder="Phone (e.g. +15551234567)" inputMode="tel" className={inputCls} />
              {phoneError && (
                <p className="mt-1 text-caption text-accent">{phoneError}</p>
              )}
            </div>
            <label className="block">
              <span className="mb-1 block text-caption text-faint">Birth date</span>
              <input type="date" value={f.birthDate} onChange={set("birthDate")} className={inputCls} />
            </label>
            <div>
              <input type="password" value={f.password} onChange={set("password")} placeholder="Password (min 8)" autoComplete="new-password" className={inputCls} />
              {passwordError && (
                <p className="mt-1 text-caption text-accent">{passwordError}</p>
              )}
            </div>
            <button
              type="submit"
              disabled={busy || !formValid}
              className="mt-1 flex h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-accent text-body font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Continue
            </button>
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
            <button
              type="button"
              onClick={resend}
              disabled={cooldown > 0 || busy}
              className="self-start text-footnote text-link hover:underline disabled:text-faint disabled:no-underline"
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
            </button>
            <label className="flex items-start gap-2 text-footnote text-muted">
              <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5" />
              <span>
                I agree to the{" "}
                <a href="https://unsend.app/terms-of-service" target="_blank" rel="noopener noreferrer" className="text-link hover:underline">terms</a>{" "}
                and{" "}
                <a href="https://unsend.app/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-link hover:underline">privacy policy</a>.
              </span>
            </label>
            <button
              type="submit"
              disabled={busy || code.length !== 6 || !terms}
              className="flex h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-accent text-body font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Verify & finish
            </button>
          </form>
        )}

        {step === "done" && (
          <Link
            href="/login"
            className="flex h-[44px] w-full items-center justify-center rounded-lg bg-accent text-body font-semibold text-white"
          >
            Sign in
          </Link>
        )}

        {step !== "done" && (
          <p className="mt-4 text-center text-footnote text-faint">
            Already have an account?{" "}
            <Link href="/login" className="text-link hover:underline">Sign in</Link>
          </p>
        )}
      </div>
    </div>
  );
}
