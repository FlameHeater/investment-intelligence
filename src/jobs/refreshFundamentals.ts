import { refreshFundamentals } from "../lib/refreshJobs";
import { finish, progress, runJob } from "./_runner";

/**
 * Fundamental hanya untuk saham AS (PRD §4 & §8).
 *
 * Kenapa IDX tidak ada di sini: tidak ada API resmi IDX yang gratis dan stabil
 * untuk data fundamental. Alih-alih menambal dengan angka tanpa jaminan, MVP
 * memilih menampilkan "tidak tersedia" di UI.
 *
 * Frekuensi: harian — laporan keuangan tidak berubah tiap jam.
 */
runJob("refreshFundamentals", () =>
  refreshFundamentals({ onProgress: (d, t, l) => progress(d, t, l) }),
).finally(finish);
