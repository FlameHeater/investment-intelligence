/**
 * Perbedaan perilaku antar-provider yang harus ditangani eksplisit.
 *
 * `contains` di Prisma bersifat case-insensitive pada SQLite (karena LIKE di
 * SQLite memang begitu untuk ASCII), tapi case-SENSITIVE pada Postgres. Tanpa
 * penyesuaian ini, mencari "bitcoin" di deployment Postgres tidak akan menemukan
 * "Bitcoin" — regresi yang tidak kelihatan saat pengembangan lokal.
 */

const isPostgres = () => {
  const url = process.env.DATABASE_URL ?? "";
  return url.startsWith("postgres://") || url.startsWith("postgresql://");
};

/**
 * Sebarkan ke dalam filter string Prisma untuk menyamakan perilaku di kedua
 * provider. Di SQLite menghasilkan objek kosong; di Postgres menambahkan
 * `mode: "insensitive"`.
 *
 * Cast diperlukan karena tipe `mode` hanya ada di client yang di-generate untuk
 * Postgres, sedangkan pengembangan lokal memakai client SQLite.
 */
export function caseInsensitive(): Record<string, unknown> {
  return isPostgres() ? { mode: "insensitive" } : {};
}
