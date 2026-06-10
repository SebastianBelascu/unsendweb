"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { clearPersistedQueryCache } from "@/lib/query-cache";
import { clearAllDrafts } from "@/lib/drafts";
import {
  Camera,
  Check,
  ChevronDown,
  LifeBuoy,
  Loader2,
  LogOut,
  Monitor,
  Phone,
  Share2,
  ShieldCheck,
  Trash2,
} from "lucide-react";

const SHARE_TEXT =
  "unsend is the future of communication. unlock your email experience & communicate with the people you love, send work emails all from one app. download now: https://apps.apple.com/eg/app/unsend-app/id6502881627";
const SUPPORT_ADDRESS = "support@unsend.app";
import { Avatar } from "@/components/mail/Avatar";
import { ConfirmDialog } from "@/components/mail/ConfirmDialog";
import { cn } from "@/lib/utils";
import { getStoredAvatar, uploadAvatar } from "@/lib/api/avatar";
import { selfAvatarUrl } from "@/lib/avatar-url";
import { useRealtime } from "@/lib/realtime/store";
import { useComposeModal } from "@/lib/compose-modal";
import { useTheme } from "@/lib/theme-store";
import { logout, type SessionUser } from "@/lib/api/auth";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0";
import {
  useChangePassword,
  useDeviceActions,
  useDevices,
  usePrivacy,
  useSendPhoneCode,
  useSession,
  useUpdatePrivacy,
  useUpdateProfile,
  useVerifyPhoneChange,
  type ProfileUpdate,
} from "@/lib/api/account";
import { toast } from "@/lib/toast";

/** Reactively read this device's stored avatar URL (updates after upload). */
function useStoredAvatar(username?: string): string | undefined {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("unsend:avatar", cb);
      window.addEventListener("storage", cb);
      return () => {
        window.removeEventListener("unsend:avatar", cb);
        window.removeEventListener("storage", cb);
      };
    },
    () => getStoredAvatar(username),
    () => undefined,
  );
}

/**
 * Collapsible settings section — collapsed by default so the whole page is a
 * compact list of headers; click one to expand and edit. Content stays mounted
 * (hidden via CSS) so in-progress form edits aren't lost on collapse.
 */
function Section({
  title,
  description,
  children,
  defaultOpen = false,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-surface"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-body font-bold text-ink-strong">{title}</span>
          {description && (
            <span className="mt-0.5 block text-footnote text-faint">
              {description}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "h-5 w-5 shrink-0 text-faint transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      <div className={cn("px-5 pb-5", !open && "hidden")}>{children}</div>
    </section>
  );
}

const inputCls =
  "h-[42px] w-full rounded-lg border border-line-strong bg-canvas px-3 text-body text-ink-strong outline-none placeholder:text-faint focus:border-muted";

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-email" : "bg-surface-3",
      )}
      aria-pressed={checked}
    >
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

function ProfileSection({ user }: { user: SessionUser | null }) {
  const update = useUpdateProfile();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const storedAvatar = useStoredAvatar(user?.username);
  const ownVersion = useRealtime((s) =>
    user?.username ? s.avatarVersions[user.username.toLowerCase()] : undefined,
  );
  // Prefer this device's freshly-uploaded URL; otherwise attempt the deterministic
  // self URL (shows the photo if it exists at S3 even when the version isn't
  // tracked; 404s fall back to the gradient).
  const avatarUrl =
    storedAvatar ?? selfAvatarUrl(user?.username, ownVersion);
  const name = `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() ||
    user?.username ||
    "You";

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user?.username) return;
    setAvatarError(false);
    setUploading(true);
    try {
      await uploadAvatar(file, user.username);
    } catch {
      setAvatarError(true);
    } finally {
      setUploading(false);
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const get = (k: string) => String(fd.get(k) ?? "").trim() || undefined;
    const dto: ProfileUpdate = {
      firstName: get("firstName"),
      lastName: get("lastName"),
      birthDate: get("birthDate"),
    };
    update.mutate(dto);
  }

  return (
    <Section title="Profile" defaultOpen>
      <div className="mb-5 flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || !user?.username}
          className="group relative shrink-0 rounded-full"
          aria-label="Change profile photo"
        >
          <Avatar
            name={name}
            seed={user?.username ? `${user.username}@unsend.app` : name}
            imageUrl={avatarUrl}
            isEmail={false}
            size={64}
            showBadge={false}
          />
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
            <Camera className="h-5 w-5 text-white" />
          </span>
          {uploading && (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45">
              <Loader2 className="h-5 w-5 animate-spin text-white" />
            </span>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={onPickAvatar}
        />
        <div className="min-w-0">
          <div className="truncate text-callout font-semibold text-ink-strong">
            {name}
          </div>
          <div className="truncate text-footnote text-faint">
            @{user?.username}
            {user?.phone ? ` · ${user.phone}` : ""}
          </div>
          {avatarError && (
            <div className="text-caption text-accent">Couldn&apos;t upload photo.</div>
          )}
        </div>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-footnote text-muted">First name</span>
            <input
              name="firstName"
              defaultValue={user?.firstName ?? ""}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-footnote text-muted">Last name</span>
            <input
              name="lastName"
              defaultValue={user?.lastName ?? ""}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-footnote text-muted">Birth date</span>
            <input
              name="birthDate"
              type="date"
              defaultValue={user?.birthDate ? user.birthDate.slice(0, 10) : ""}
              className={inputCls}
            />
          </label>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={update.isPending}
            className="flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-subhead font-semibold text-white transition-opacity disabled:opacity-50"
          >
            {update.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Save
          </button>
          {update.isSuccess && (
            <span className="flex items-center gap-1 text-footnote text-email">
              <Check className="h-4 w-4" /> Saved
            </span>
          )}
          {update.isError && (
            <span className="text-footnote text-accent">Couldn&apos;t save.</span>
          )}
        </div>
      </form>
    </Section>
  );
}

function AppearanceSection() {
  const theme = useTheme((s) => s.theme);
  const setTheme = useTheme((s) => s.setTheme);
  return (
    <Section title="Appearance">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-subhead text-ink">Dark mode</div>
          <div className="mt-0.5 text-footnote text-faint">
            Switch between the light and dark look.
          </div>
        </div>
        <Toggle
          checked={theme === "dark"}
          onChange={(v) => setTheme(v ? "dark" : "light")}
        />
      </div>
    </Section>
  );
}

function PrivacySection() {
  const { data: priv } = usePrivacy();
  const update = useUpdatePrivacy();
  const [onlineLocal, setOnlineLocal] = useState<boolean | null>(null);
  const [lastSeenLocal, setLastSeenLocal] = useState<boolean | null>(null);
  const online = onlineLocal ?? priv?.showOnlineStatus ?? true;
  const lastSeen = lastSeenLocal ?? priv?.showLastSeen ?? true;

  function apply(r?: { showOnlineStatus: boolean; showLastSeen: boolean }) {
    if (r) {
      setOnlineLocal(r.showOnlineStatus);
      setLastSeenLocal(r.showLastSeen);
    }
  }
  function setOnlineStatus(v: boolean) {
    setOnlineLocal(v);
    update.mutate(
      { showOnlineStatus: v },
      { onSuccess: apply, onError: () => setOnlineLocal(!v) },
    );
  }
  function setLastSeenStatus(v: boolean) {
    setLastSeenLocal(v);
    update.mutate(
      { showLastSeen: v },
      { onSuccess: apply, onError: () => setLastSeenLocal(!v) },
    );
  }

  return (
    <Section
      title="Privacy"
      description="Symmetric: hiding your online status also hides others' from you."
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-subhead text-ink">Show online status</div>
            <div className="text-caption text-faint">
              Let others see when you&apos;re active.
            </div>
          </div>
          <Toggle checked={online} onChange={setOnlineStatus} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-subhead text-ink">Show last seen</div>
            <div className="text-caption text-faint">
              Let others see your last-active time.
            </div>
          </div>
          <Toggle
            checked={lastSeen}
            onChange={setLastSeenStatus}
            disabled={!online}
          />
        </div>
      </div>
    </Section>
  );
}

function PhoneSection() {
  const sendCode = useSendPhoneCode();
  const verify = useVerifyPhoneChange();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [error, setError] = useState<string | null>(null);

  function onSend(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const p = phone.trim();
    if (!/^\+?[0-9]{7,15}$/.test(p)) {
      setError("Enter a valid number, e.g. +14155551234.");
      return;
    }
    sendCode.mutate(p, {
      onSuccess: () => {
        setStep("code");
        toast("Verification code sent");
      },
      onError: () =>
        setError("Couldn't send the code — the number may be in use."),
    });
  }

  function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    verify.mutate(
      { phone: phone.trim(), code: code.trim() },
      {
        onSuccess: () => {
          toast("Phone number updated");
          setStep("phone");
          setPhone("");
          setCode("");
        },
        onError: () => setError("Invalid or expired code."),
      },
    );
  }

  return (
    <Section title="Phone number">
      {step === "phone" ? (
        <form onSubmit={onSend} className="flex max-w-sm flex-col gap-3">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="New phone (e.g. +14155551234)"
            inputMode="tel"
            autoComplete="tel"
            className={inputCls}
          />
          {error && <span className="text-footnote text-accent">{error}</span>}
          <button
            type="submit"
            disabled={sendCode.isPending || !phone.trim()}
            className="flex items-center gap-2 self-start rounded-full bg-surface-2 px-5 py-2 text-subhead font-semibold text-ink hover:bg-surface-3 disabled:opacity-50"
          >
            {sendCode.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Phone className="h-4 w-4" />
            )}
            Send code
          </button>
        </form>
      ) : (
        <form onSubmit={onVerify} className="flex max-w-sm flex-col gap-3">
          <p className="text-footnote text-muted">
            We sent a code to {phone}.
          </p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="6-digit code"
            inputMode="numeric"
            maxLength={8}
            className={inputCls}
          />
          {error && <span className="text-footnote text-accent">{error}</span>}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={verify.isPending || !code.trim()}
              className="flex items-center gap-2 rounded-full bg-surface-2 px-5 py-2 text-subhead font-semibold text-ink hover:bg-surface-3 disabled:opacity-50"
            >
              {verify.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Verify &amp; update
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("phone");
                setError(null);
              }}
              className="text-footnote text-link hover:underline"
            >
              Change number
            </button>
          </div>
        </form>
      )}
    </Section>
  );
}

function PasswordSection() {
  const change = useChangePassword();
  const [oldPassword, setOld] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    change.mutate(
      { oldPassword, newPassword },
      {
        onSuccess: () => {
          setOld("");
          setNew("");
          setConfirm("");
        },
        onError: () => setError("Couldn't change password. Check your current one."),
      },
    );
  }

  return (
    <Section title="Password">
      <form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-3">
        <input
          type="password"
          value={oldPassword}
          onChange={(e) => setOld(e.target.value)}
          placeholder="Current password"
          autoComplete="current-password"
          className={inputCls}
        />
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNew(e.target.value)}
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
        {error && <span className="text-footnote text-accent">{error}</span>}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={change.isPending || !oldPassword || !newPassword}
            className="flex items-center gap-2 rounded-full bg-surface-2 px-5 py-2 text-subhead font-semibold text-ink hover:bg-surface-3 disabled:opacity-50"
          >
            {change.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Update password
          </button>
          {change.isSuccess && (
            <span className="flex items-center gap-1 text-footnote text-email">
              <Check className="h-4 w-4" /> Updated
            </span>
          )}
        </div>
      </form>
    </Section>
  );
}

function DevicesSection() {
  const { data: devices = [], isLoading } = useDevices();
  const { remove, signOutOthers } = useDeviceActions();
  const hasOthers = devices.some((d) => !d.isCurrent);

  return (
    <Section title="Devices & sessions">
      {isLoading ? (
        <div className="flex justify-center py-4 text-faint">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {devices.map((d) => (
            <div
              key={d.deviceId}
              className="flex items-center gap-3 rounded-lg border border-line bg-canvas px-3 py-2.5"
            >
              <Monitor className="h-5 w-5 shrink-0 text-faint" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-subhead text-ink">
                  {d.deviceName || d.deviceType || "Unknown device"}
                  {d.isCurrent && (
                    <span className="ml-2 rounded-full bg-email/15 px-2 py-0.5 text-micro font-semibold text-email-light">
                      This device
                    </span>
                  )}
                </div>
                <div className="truncate text-caption text-faint">
                  {[d.deviceOs, d.deviceAppVersion].filter(Boolean).join(" · ")}
                  {d.lastActiveAt
                    ? ` · active ${format(new Date(d.lastActiveAt), "d MMM, HH:mm")}`
                    : ""}
                </div>
              </div>
              {!d.isCurrent && (
                <button
                  type="button"
                  onClick={() => remove.mutate(d.deviceId)}
                  className="rounded-md p-1.5 text-faint hover:bg-surface-3 hover:text-accent"
                  aria-label="Remove device"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}

          {hasOthers && (
            <button
              type="button"
              onClick={() => signOutOthers.mutate()}
              disabled={signOutOthers.isPending}
              className="mt-2 self-start rounded-full bg-surface-2 px-4 py-2 text-footnote font-semibold text-ink hover:bg-surface-3 disabled:opacity-50"
            >
              Sign out all other devices
            </button>
          )}
        </div>
      )}
    </Section>
  );
}

function SupportSection() {
  const [copied, setCopied] = useState(false);
  const openCompose = useComposeModal((s) => s.open);
  async function invite() {
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ text: SHARE_TEXT });
        return;
      }
    } catch {
      /* user cancelled */
    }
    try {
      await navigator.clipboard.writeText(SHARE_TEXT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }
  return (
    <Section title="Help & more">
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => openCompose({ isEmail: false, to: SUPPORT_ADDRESS })}
          className="flex items-center gap-3 rounded-lg border border-line bg-canvas px-3 py-2.5 text-left text-subhead text-ink hover:bg-surface"
        >
          <LifeBuoy className="h-5 w-5 text-faint" /> Contact support
        </button>
        <button
          type="button"
          onClick={invite}
          className="flex items-center gap-3 rounded-lg border border-line bg-canvas px-3 py-2.5 text-left text-subhead text-ink hover:bg-surface"
        >
          <Share2 className="h-5 w-5 text-faint" />
          {copied ? "Invite copied to clipboard" : "Invite a friend"}
        </button>
      </div>
    </Section>
  );
}

function DangerSection({ onConfirm }: { onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <Section title="Danger zone">
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="flex items-center gap-2 rounded-full border border-accent/40 px-4 py-2 text-subhead font-semibold text-accent hover:bg-accent/10"
        >
          <Trash2 className="h-4 w-4" /> Delete account
        </button>
      ) : (
        <div className="rounded-lg border border-accent/40 bg-accent/10 p-4">
          <p className="text-subhead text-ink">
            Are you sure you want to delete your account? This action cannot be
            undone.
          </p>
          <p className="mt-1 text-footnote text-muted">
            The team will be notified and your account will be deleted.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-full bg-surface-2 px-4 py-2 text-footnote font-semibold text-ink hover:bg-surface-3"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="rounded-full bg-accent px-4 py-2 text-footnote font-semibold text-white hover:opacity-90"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}

export function SettingsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: user, isLoading } = useSession();
  const [loggingOut, setLoggingOut] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  async function onLogout() {
    setLoggingOut(true);
    await logout();
    // Drop this account's cached data so the next sign-in starts clean.
    qc.clear();
    clearPersistedQueryCache();
    clearAllDrafts();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-line px-6 py-4">
        <h1 className="text-title font-bold text-ink-strong">Settings</h1>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-5 p-6">
          {isLoading ? (
            <div className="flex justify-center py-10 text-faint">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <>
              <ProfileSection user={user ?? null} />
              <AppearanceSection />
              <PrivacySection />
              <PhoneSection />
              <PasswordSection />
              <DevicesSection />
              <SupportSection />
              <DangerSection onConfirm={onLogout} />
              <button
                type="button"
                onClick={() => setConfirmLogout(true)}
                disabled={loggingOut}
                className="flex items-center justify-center gap-2 self-start rounded-full border border-accent/40 px-5 py-2 text-subhead font-semibold text-accent hover:bg-accent/10 disabled:opacity-50"
              >
                {loggingOut ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="h-4 w-4" />
                )}
                Log out
              </button>

              <p className="mt-2 text-center text-caption text-faint">
                unsend web · v{APP_VERSION}
              </p>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmLogout}
        danger
        title="Log out of this device?"
        body="You'll need to sign in again to use unsend on this device."
        confirmLabel="Log out"
        onConfirm={() => {
          setConfirmLogout(false);
          onLogout();
        }}
        onCancel={() => setConfirmLogout(false)}
      />
    </div>
  );
}
