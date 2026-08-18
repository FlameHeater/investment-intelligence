import { NextResponse, type NextRequest } from "next/server";

/**
 * Gerbang auth di edge. Memverifikasi tanda tangan cookie dengan Web Crypto
 * (node:crypto tidak tersedia di runtime middleware), memakai algoritma dan
 * secret yang sama dengan src/lib/auth.ts.
 *
 * Server component dan route handler tetap memverifikasi ulang — middleware ini
 * lapisan pertama, bukan satu-satunya.
 */

const SESSION_COOKIE = "ii_session";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/cron"];

async function verify(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (expected.length !== signature.length) return false;
  // Perbandingan waktu-tetap sederhana.
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  if (diff !== 0) return false;

  const expiresAt = Number(payload);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // Tanpa secret, tidak ada sesi yang bisa dipercaya — arahkan ke login yang
    // akan menampilkan pesan setup.
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("error", "setup");
    return NextResponse.redirect(url);
  }

  const authed = await verify(request.cookies.get(SESSION_COOKIE)?.value, secret);
  if (authed) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
