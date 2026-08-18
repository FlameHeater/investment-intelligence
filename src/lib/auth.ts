import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Gerbang single-user (PRD §6.1) — sengaja BUKAN sistem multi-tenant.
 *
 * Satu password dari environment, satu cookie bertanda tangan HMAC. Tidak ada
 * tabel user, tidak ada RBAC, tidak ada reset password. Kalau nanti aplikasi ini
 * dibagikan ke orang lain, seluruh bagian ini harus diganti dengan auth sungguhan
 * (PRD §13) — bukan ditambal.
 */

export const SESSION_COOKIE = "ii_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 hari

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "SESSION_SECRET belum diisi (minimal 16 karakter). Salin .env.example menjadi .env lalu isi nilainya.",
    );
  }
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export function createToken(): string {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = String(expiresAt);
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const expected = sign(payload);
  // Panjang harus sama sebelum timingSafeEqual, kalau tidak ia melempar.
  if (expected.length !== signature.length) return false;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return false;

  const expiresAt = Number(payload);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

export function checkPassword(input: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    throw new Error("APP_PASSWORD belum diisi di .env — aplikasi menolak login demi keamanan.");
  }
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get(SESSION_COOKIE)?.value);
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};
