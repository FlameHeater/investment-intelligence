import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Menyesuaikan `provider` di prisma/schema.prisma dengan DATABASE_URL.
 *
 * Kenapa ini perlu: Prisma tidak mengizinkan `provider` diisi dari env(), harus
 * berupa literal. Padahal proyek ini memang menargetkan dua lingkungan berbeda —
 * SQLite untuk pemakaian lokal single-user, Postgres untuk deployment serverless
 * (Vercel tidak punya filesystem yang bisa ditulis dan persisten, jadi SQLite
 * mustahil di sana).
 *
 * Skrip ini dijalankan sebelum `prisma generate` di dalam `npm run build`.
 * Tipe kolom yang dipakai skema ini sudah kompatibel di kedua provider, jadi
 * yang perlu ditukar hanya satu baris.
 */

const SCHEMA_PATH = path.join(process.cwd(), "prisma", "schema.prisma");

/**
 * Skrip ini dijalankan dengan `node` biasa, yang TIDAK membaca .env — sedangkan
 * Prisma CLI membacanya. Tanpa pemuatan manual di bawah, keduanya bisa melihat
 * DATABASE_URL yang berbeda: skrip ini menyimpulkan "sqlite" karena tidak
 * melihat apa-apa, lalu `prisma generate` membaca .env berisi URL Postgres dan
 * menolak dengan "the URL must start with the protocol file:".
 *
 * Di Vercel dan GitHub Actions hal ini tidak terjadi karena variabelnya ada di
 * environment proses, jadi bug-nya hanya muncul saat build lokal — tempat yang
 * paling tidak terduga.
 */
function loadDotEnv() {
  if (process.env.DATABASE_URL) return;

  for (const name of [".env.local", ".env"]) {
    const file = path.join(process.cwd(), name);
    if (!existsSync(file)) continue;

    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?DATABASE_URL\s*=\s*(.*)$/);
      if (!match) continue;
      const value = match[1].trim().replace(/^["']|["']$/g, "");
      if (value) {
        process.env.DATABASE_URL = value;
        return;
      }
    }
  }
}

loadDotEnv();

const url = process.env.DATABASE_URL ?? "";
const provider =
  url.startsWith("postgres://") || url.startsWith("postgresql://")
    ? "postgresql"
    : url.startsWith("mysql://")
      ? "mysql"
      : "sqlite";

const schema = readFileSync(SCHEMA_PATH, "utf8");
const current = schema.match(/datasource\s+db\s*\{[^}]*provider\s*=\s*"([^"]+)"/)?.[1];

if (current === provider) {
  console.log(`prepare-schema: provider sudah "${provider}", tidak ada perubahan.`);
} else {
  const updated = schema.replace(
    /(datasource\s+db\s*\{[^}]*provider\s*=\s*")[^"]+(")/,
    `$1${provider}$2`,
  );
  writeFileSync(SCHEMA_PATH, updated);
  console.log(`prepare-schema: provider diubah dari "${current}" menjadi "${provider}".`);
}
