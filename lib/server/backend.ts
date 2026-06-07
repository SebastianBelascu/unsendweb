import "server-only";

/*
  Server-only BFF helpers. The browser never talks to the backend directly:
  Route Handlers under app/api/* proxy to BACKEND_API_BASE and attach the
  access token from an httpOnly cookie. See context/04-auth-sessions-deviceid.md.
*/

export const BACKEND_BASE =
  process.env.BACKEND_API_BASE ?? "https://api.unsend.app/api/v1";

export const AT_COOKIE = "un_at";
export const RT_COOKIE = "un_rt";
export const USER_COOKIE = "un_user";

const isProd = process.env.NODE_ENV === "production";

interface CookieJar {
  set(name: string, value: string, options?: Record<string, unknown>): unknown;
  delete(name: string): unknown;
}

export interface BackendTokens {
  accessToken: string;
  refreshToken: string;
}

export function setAuthCookies(
  jar: CookieJar,
  tokens: BackendTokens,
  user?: unknown,
): void {
  const base = {
    httpOnly: true as const,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
  };
  // Access token: short-lived (mirrors JWT_EXPIRE ~1h). On expiry the client
  // hits 401 and refreshes.
  jar.set(AT_COOKIE, tokens.accessToken, { ...base, maxAge: 60 * 60 });
  jar.set(RT_COOKIE, tokens.refreshToken, { ...base, maxAge: 60 * 60 * 24 * 30 });
  if (user !== undefined) {
    jar.set(USER_COOKIE, JSON.stringify(user), {
      ...base,
      maxAge: 60 * 60 * 24 * 30,
    });
  }
}

export function clearAuthCookies(jar: CookieJar): void {
  jar.delete(AT_COOKIE);
  jar.delete(RT_COOKIE);
  jar.delete(USER_COOKIE);
}

/** Call a backend endpoint server-side. `path` starts with "/". */
export async function callBackend(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${BACKEND_BASE}${path}`, { ...init, cache: "no-store" });
}
