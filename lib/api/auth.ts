import { apiSend } from "./http";
import { getDeviceId } from "./device";

export interface SessionUser {
  userId: string;
  firstName?: string;
  lastName?: string;
  username: string;
  phone?: string;
  gender?: string;
  birthDate?: string;
}

function messageFrom(data: unknown): string {
  if (data && typeof data === "object" && "message" in data) {
    const m = (data as { message: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "Invalid username or password";
}

export async function login(
  username: string,
  password: string,
): Promise<SessionUser> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password, deviceId: getDeviceId() }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(messageFrom(data));
  return data.user as SessionUser;
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

export async function fetchSession(): Promise<SessionUser | null> {
  const res = await fetch("/api/auth/session");
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  return (data.user as SessionUser) ?? null;
}

/* ----------------------------- Forgot password ----------------------------- */

export async function requestPasswordReset(userData: string) {
  return apiSend<{
    phone?: string;
    username?: string;
    success?: boolean;
    message?: string;
  }>("/auth/request-password-reset", "POST", { userData });
}

export async function verifyResetCode(phone: string, code: string) {
  return apiSend<{ success: boolean; message: string; token: string }>(
    "/auth/verify-reset-password-code",
    "POST",
    { phone, code },
  );
}

export async function resetPassword(token: string, password: string) {
  return apiSend<{ success: boolean; message: string }>(
    "/auth/reset-password",
    "PATCH",
    { token, password },
  );
}

/* --------------------------------- Sign up --------------------------------- */

export interface RegisterPayload {
  firstName: string;
  lastName: string;
  gender: string;
  birthDate: string; // DD-MM-YYYY
  username: string;
  phone: string;
  password: string;
  invitationCode: string;
}

export async function registerUser(payload: RegisterPayload) {
  return apiSend<{ success: boolean; message: string }>(
    "/auth/register",
    "POST",
    payload,
  );
}

export async function sendCode(phone: string) {
  return apiSend<{ success: boolean; message: string }>(
    "/auth/send-code",
    "POST",
    { phone },
  );
}

/** Re-send the signup OTP by username (POST /auth/resend-verification-code). */
export async function resendVerificationCode(username: string) {
  return apiSend<{ success: boolean; message: string }>(
    "/auth/resend-verification-code",
    "POST",
    { username },
  );
}

export async function verifyRegistration(
  phone: string,
  code: string,
  password?: string,
) {
  return apiSend<{ success: boolean; message: string }>("/auth/verify", "POST", {
    phone,
    code,
    password,
  });
}
