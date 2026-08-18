import type { SubScore } from "../types";
import { bell, combine, emptyScore, scale, type ScoringContext } from "./shared";

/**
 * Skor kondisi teknikal, 0-100. Berlaku untuk semua kelas aset yang punya
 * riwayat harga — termasuk emas dan kripto.
 *
 * Catatan desain: RSI dinilai dengan kurva lonceng (bell), bukan linear.
 * RSI 50-60 dianggap paling sehat; ekstrem di kedua ujung (jenuh beli maupun
 * jenuh jual) sama-sama menurunkan skor. Ini menghindari kesan bahwa "RSI makin
 * tinggi makin bagus", yang merupakan salah tafsir umum.
 */
export function technicalScore(ctx: ScoringContext): SubScore {
  const t = ctx.technical;

  if (t.barCount < 30) {
    return emptyScore(
      `Riwayat harga hanya ${t.barCount} bar — minimal 30 bar dibutuhkan untuk indikator teknikal.`,
    );
  }

  const priceVsSma50 =
    t.price !== null && t.sma50 !== null ? ((t.price - t.sma50) / t.sma50) * 100 : null;
  const priceVsSma200 =
    t.price !== null && t.sma200 !== null ? ((t.price - t.sma200) / t.sma200) * 100 : null;

  const trendScore =
    t.trend === "uptrend" ? 80 : t.trend === "sideways" ? 50 : t.trend === "downtrend" ? 25 : null;

  const macdScore =
    t.macd === null ? null : t.macd.histogram > 0 ? (t.macd.macd > 0 ? 80 : 65) : t.macd.macd < 0 ? 25 : 40;

  const components = [
    { score: trendScore, weight: 0.25 },
    { score: t.rsi14 === null ? null : bell(t.rsi14, 55, 45), weight: 0.2 },
    { score: macdScore, weight: 0.2 },
    // Momentum menengah: -20% buruk, +20% kuat
    { score: t.change30d === null ? null : scale(t.change30d, -20, 20), weight: 0.15 },
    { score: t.change90d === null ? null : scale(t.change90d, -35, 35), weight: 0.1 },
    // Posisi relatif terhadap SMA200: jauh di bawah buruk, sedikit di atas baik
    { score: priceVsSma200 === null ? null : scale(priceVsSma200, -30, 20), weight: 0.1 },
  ];

  const { score, completeness } = combine(components);
  const notes: string[] = [];

  if (t.sma200 === null) {
    notes.push("SMA 200 belum bisa dihitung (butuh 200 bar). Penilaian tren memakai SMA 50.");
  }
  if (t.rsi14 !== null && t.rsi14 > 70) {
    notes.push(`RSI ${t.rsi14.toFixed(1)} berada di area jenuh beli — harga sudah naik cepat belakangan ini.`);
  }
  if (t.rsi14 !== null && t.rsi14 < 30) {
    notes.push(`RSI ${t.rsi14.toFixed(1)} berada di area jenuh jual — tekanan jual sedang kuat.`);
  }

  return {
    score,
    dataCompleteness: completeness,
    inputs: {
      trend: t.trend,
      rsi14: t.rsi14,
      macd: t.macd?.macd ?? null,
      macd_histogram: t.macd?.histogram ?? null,
      sma20: t.sma20,
      sma50: t.sma50,
      sma200: t.sma200,
      price_vs_sma50_pct: priceVsSma50,
      price_vs_sma200_pct: priceVsSma200,
      change30d: t.change30d,
      change90d: t.change90d,
      bar_count: t.barCount,
    },
    notes,
  };
}
