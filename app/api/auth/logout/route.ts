import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { clearAuthCookies } from "@/lib/server/backend";

export async function POST() {
  const jar = await cookies();
  clearAuthCookies(jar);
  return NextResponse.json({ ok: true });
}
