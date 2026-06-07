import { apiSend } from "./http";

const KEY = "unsend.web.deviceId";

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
 * Upsert this browser as a device so Settings shows a real name instead of the
 * "Pending"/"unknown" stub the login flow creates. Idempotent (sparse upsert).
 * deviceToken is required by the DTO; the web has no push token, so a stable
 * synthetic value is sent (web never receives push).
 */
export async function registerDevice(): Promise<void> {
  const deviceId = getDeviceId();
  const { name, os, osVersion } = describeDevice();
  await apiSend("/devices", "POST", {
    deviceId,
    deviceToken: `web-${deviceId}`,
    deviceName: name,
    deviceType: "web",
    deviceOs: os,
    deviceOsVersion: osVersion || undefined,
    deviceAppVersion: APP_VERSION,
  });
}

/** Heartbeat so the device's lastActiveAt stays fresh. Failure is non-critical. */
export async function pingDeviceActivity(): Promise<void> {
  await apiSend(`/devices/activity/device/${getDeviceId()}`, "PATCH");
}
