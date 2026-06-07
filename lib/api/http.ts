import { getDeviceId } from "./device";
import { useRealtime } from "../realtime/store";

/*
  Client HTTP wrapper. All calls go to the same-origin BFF proxy (/api/backend),
  which attaches the access token server-side. On 401 we refresh once
  (single-flight) and retry. See context/04 + context/10.
*/

export class ApiError extends Error {
  constructor(
    public status: number,
    public data: unknown,
  ) {
    super(`API ${status}`);
    this.name = "ApiError";
  }
}

let refreshing: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId: getDeviceId() }),
    })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

async function parse(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const res = await fetch(`/api/backend${path}`, {
    ...init,
    headers: { accept: "application/json", ...(init.headers ?? {}) },
  });

  if (res.status === 401 && retry) {
    const ok = await refreshSession();
    if (ok) return apiFetch<T>(path, init, false);
  }

  const data = await parse(res);
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export const apiGet = <T>(path: string) => apiFetch<T>(path);

export const apiSend = <T>(path: string, method: string, body?: unknown) => {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  // Tag writes with our socket id so the backend can skip echoing to us.
  const socketId = useRealtime.getState().socket?.id;
  if (socketId) headers["x-socket-id"] = socketId;
  return apiFetch<T>(path, {
    method,
    headers: Object.keys(headers).length ? headers : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
};
