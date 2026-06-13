import { apiSend } from "./http";

const KEY = "unsend.web.deviceId";

/** Convert a URL-safe base64 string (VAPID public key) to a Uint8Array. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/**
 * Register the service worker and subscribe to Web Push.
 * Returns the PushSubscription or null if not supported / permission denied.
 */
async function subscribeToPush(): Promise<PushSubscription | null> {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator) || !("PushManager" in window))
    return null;

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });
    await navigator.serviceWorker.ready;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;

    // Fetch VAPID public key from backend
    const res = await fetch("/api/backend/devices/vapid-public-key");
    const { publicKey } = await res.json();
    if (!publicKey) return null;

    const existing = await registration.pushManager.getSubscription();
    if (existing) return existing;

    return await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  } catch (err) {
    console.warn("[push] subscribe failed:", err);
    return null;
  }
}

/**
 * Stable per-browser device id. The backend's JWT-with-device guard expects a
 * deviceId on login/refresh (see context/04-auth-sessions-deviceid.md).
 */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "web";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `web-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}

/** Best-effort browser/OS label from the user agent, e.g. "Chrome on Windows". */
function describeDevice(): { name: string; os: string; osVersion: string } {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  let os = "Unknown";
  let osVersion = "";
  if (/Windows NT ([0-9.]+)/.test(ua)) {
    os = "Windows";
    osVersion = RegExp.$1;
  } else if (/Mac OS X ([0-9_.]+)/.test(ua)) {
    os = "macOS";
    osVersion = RegExp.$1.replace(/_/g, ".");
  } else if (/Android ([0-9.]+)/.test(ua)) {
    os = "Android";
    osVersion = RegExp.$1;
  } else if (/(iPhone|iPad).+OS ([0-9_]+)/.test(ua)) {
    os = "iOS";
    osVersion = RegExp.$2.replace(/_/g, ".");
  } else if (/Linux/.test(ua)) {
    os = "Linux";
  }
  return { name: `${browser} on ${os}`, os, osVersion };
}

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0";

/**
 * Upsert this browser as a device and subscribe to Web Push notifications.
 * Idempotent (sparse upsert). When push permission is granted, the real
 * subscription endpoint replaces the legacy synthetic token so the backend
 * can deliver notifications via the Web Push API (VAPID).
 */
export async function registerDevice(): Promise<void> {
  const deviceId = getDeviceId();
  const { name, os, osVersion } = describeDevice();

  const subscription = await subscribeToPush();
  const sub = subscription?.toJSON() as
    | { endpoint: string; keys: { p256dh: string; auth: string } }
    | undefined;

  await apiSend("/devices", "POST", {
    deviceId,
    deviceToken: sub?.endpoint ?? `web-${deviceId}`,
    deviceName: name,
    deviceType: "web",
    deviceOs: os,
    deviceOsVersion: osVersion || undefined,
    deviceAppVersion: APP_VERSION,
    ...(sub
      ? {
          pushPlatform: "web",
          webPushSubscription: { endpoint: sub.endpoint, keys: sub.keys },
        }
      : {}),
  });
}

/** Heartbeat so the device's lastActiveAt stays fresh. Failure is non-critical. */
export async function pingDeviceActivity(): Promise<void> {
  await apiSend(`/devices/activity/device/${getDeviceId()}`, "PATCH");
}
