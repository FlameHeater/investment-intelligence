import type { SubScore } from "../types";
import { combine, emptyScore, scale, type ScoringContext } from "./shared";

/**
 * Skor risiko, 0-100, dengan konvensi: SKOR TINGGI = RISIKO RENDAH.
 * Konvensi ini dipilih supaya kelima sub-skor searah (makin tinggi makin baik),
 * sehingga rata-rata terbobot di orchestrator tidak perlu membalik tanda.
 *
 * Termasuk komponen "kualitas data" — aset yang datanya bolong atau basi dinilai
 * lebih berisiko, karena memang begitu adanya bagi pengambil keputusan.
 */
export function riskScore(ctx: ScoringContext): SubScore {
  const t = ctx.technical;

  if (t.barCount < 30) {
    return emptyScore("Riwayat harga terlalu pendek untuk menilai risiko secara wajar.");
  }

  // Ambang volatilitas berbeda per kelas aset: 60%/tahun normal untuk kripto,
  // tapi sangat tinggi untuk saham blue chip. Memakai satu ambang untuk semua
  // akan membuat seluruh kripto tampak "sangat berisiko" secara seragam dan
  // menghapus perbedaan di antara mereka.
  const volBand: Record<string, [number, number]> = {
    us_stock: [70, 15],
    idx_stock: [80, 18],
    crypto: [150, 40],
    gold: [40, 8],
  };
  const [volWorst, volBest] = volBand[ctx.assetType] ?? [80, 15];

  const volScore = t.volatility === null ? null : scale(t.volatility * 100, volWorst, volBest);
  const ddScore = t.maxDrawdown === null ? null : scale(t.maxDrawdown * 100, 70, 10);

  // Likuiditas: hanya dinilai kalau volume tersedia. Nilai nominal volume tidak
  // sebanding lintas kelas aset, jadi yang dinilai adalah nilai transaksi kasar.
  const turnover =
    t.avgVolume30d !== null && t.price !== null ? t.avgVolume30d * t.price : null;
  const liquidityScore =
    turnover === null ? null : scale(Math.log10(Math.max(turnover, 1)), 4, 9);

  // Kesegaran data: harga berumur > 7 hari dianggap basi (PRD §7 poin 5).
  const freshnessScore =
    ctx.priceAgeHours === null ? null : scale(ctx.priceAgeHours, 168, 6);

  const components = [
    { score: volScore, weight: 0.4 },
    { score: ddScore, weight: 0.25 },
    { score: liquidityScore, weight: 0.2 },
    { score: freshnessScore, weight: 0.15 },
  ];

  const { score, completeness } = combine(components);
  const notes: string[] = [];

  if (ctx.priceAgeHours !== null && ctx.priceAgeHours > 48) {
    notes.push(
      `Data harga terakhir berumur ${Math.round(ctx.priceAgeHours)} jam. Jalankan \`npm run job:market\` untuk memperbarui.`,
    );
  }
  if (t.volatility !== null && t.volatility > 1) {
    notes.push(
      `Volatilitas tahunan ${(t.volatility * 100).toFixed(0)}% — pergerakan harga sangat lebar.`,
    );
  }
  if (turnover === null) {
    notes.push("Data volume tidak tersedia, sehingga likuiditas tidak ikut dinilai.");
  }

  return {
    score,
    dataCompleteness: completeness,
    inputs: {
      annualized_volatility_pct: t.volatility === null ? null : t.volatility * 100,
      max_drawdown_pct: t.maxDrawdown === null ? null : t.maxDrawdown * 100,
      avg_turnover_30d: turnover,
      price_age_hours: ctx.priceAgeHours,
    },
    notes,
  };
}
