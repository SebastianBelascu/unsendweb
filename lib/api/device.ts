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
