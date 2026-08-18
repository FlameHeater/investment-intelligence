import type { SubScore } from "../types";
import { combine, emptyScore, scale, type ScoringContext } from "./shared";

/**
 * Skor kesehatan bisnis, 0-100.
 *
 * Di-skip untuk kripto dan emas — keduanya tidak punya laporan keuangan, jadi
 * memberi mereka skor fundamental apa pun (termasuk 0) akan menyesatkan.
 * Untuk saham IDX, PRD §4 mencatat tidak ada sumber fundamental gratis yang
 * reliable, sehingga skor ini biasanya null dan confidence ikut turun.
 */
export function fundamentalScore(ctx: ScoringContext): SubScore {
  if (ctx.assetType === "crypto") {
    return emptyScore("Kripto tidak punya laporan keuangan — dimensi fundamental tidak dipakai.");
  }
  if (ctx.assetType === "gold") {
    return emptyScore("Emas adalah komoditas tanpa laporan keuangan — dimensi fundamental tidak dipakai.");
  }

  const f = ctx.fundamentals;
  const get = (k: string) => (f.has(k) ? f.get(k)! : null);

  const roe = get("roe");
  const netMargin = get("net_margin");
  const grossMargin = get("gross_margin");
  const revenueGrowth = get("revenue_growth");
  const epsGrowth = get("eps_growth");
  const de = get("debt_to_equity");
  const currentRatio = get("current_ratio");

  const components = [
    // ROE 0% buruk, 30% sangat baik
    { score: roe === null ? null : scale(roe, 0, 30), weight: 0.22 },
    // Margin bersih 0% buruk, 25% sangat baik
    { score: netMargin === null ? null : scale(netMargin, 0, 25), weight: 0.18 },
    { score: grossMargin === null ? null : scale(grossMargin, 15, 60), weight: 0.12 },
    // Pertumbuhan: -10% buruk, +25% sangat baik
    { score: revenueGrowth === null ? null : scale(revenueGrowth, -10, 25), weight: 0.18 },
    { score: epsGrowth === null ? null : scale(epsGrowth, -20, 30), weight: 0.15 },
    // D/E: Finnhub melaporkan dalam rasio (1.5 = 150%). 3.0 buruk, 0 terbaik.
    { score: de === null ? null : scale(de, 3, 0), weight: 0.1 },
    // Current ratio: 0,5 buruk, 2,0 sehat. Di atas 2 tidak diberi bonus tambahan.
    { score: currentRatio === null ? null : scale(Math.min(currentRatio, 2.5), 0.5, 2), weight: 0.05 },
  ];

  const { score, completeness } = combine(components);
  const notes: string[] = [];

  if (score === null) {
    notes.push(
      ctx.assetType === "idx_stock"
        ? "Data fundamental IDX tidak tersedia di sumber gratis (PRD §4). Skor fundamental sengaja dikosongkan, bukan diisi angka perkiraan."
        : "Belum ada data fundamental tersimpan. Isi FINNHUB_API_KEY lalu jalankan `npm run job:fundamentals`.",
    );
  } else if (completeness < 0.6) {
    notes.push(
      `Hanya ${Math.round(completeness * 100)}% bobot fundamental yang punya data. Skor ini dihitung dari sebagian metrik saja.`,
    );
  }

  return {
    score,
    dataCompleteness: completeness,
    inputs: {
      roe,
      net_margin: netMargin,
      gross_margin: grossMargin,
      revenue_growth: revenueGrowth,
      eps_growth: epsGrowth,
      debt_to_equity: de,
      current_ratio: currentRatio,
    },
    notes,
  };
}
