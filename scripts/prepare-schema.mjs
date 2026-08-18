import { readFileSync, writeFileSync } from "node:fs";
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
