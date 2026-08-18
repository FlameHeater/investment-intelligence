import { NextResponse } from "next/server";
import { checkPassword, createToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

/** Jeda tetap untuk memperlambat percobaan password beruntun. */
const THROTTLE_MS = 400;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { password?: string };

  await new Promise((r) => setTimeout(r, THROTTLE_MS));

  try {
    if (!body.password || !checkPassword(body.password)) {
      return NextResponse.json({ error: "Password salah." }, { status: 401 });
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, createToken(), sessionCookieOptions);
  return response;
}
