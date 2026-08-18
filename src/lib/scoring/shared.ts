import type { AssetType, SubScore } from "../types";
import type { TechnicalSnapshot } from "../indicators";

/** Input tunggal yang dipakai kelima scorer. Semuanya berasal dari DB, bukan panggilan API. */
export interface ScoringContext {
  ticker: string;
  assetType: AssetType;
  technical: TechnicalSnapshot;
  /** metrik fundamental terbaru per key (lihat lib/metrics.ts) */
  fundamentals: Map<string, number>;
  news: { title: string; sentiment: string | null; publishedAt: Date; sourceType: string }[];
  /** umur data harga terbaru dalam jam — dipakai riskScore untuk menghukum data basi */
  priceAgeHours: number | null;
}

/**
 * Memetakan sebuah nilai ke skala 0-100 secara linear di antara dua titik acuan.
 * `worst` boleh lebih besar dari `best` untuk metrik yang "kecil lebih baik".
 */
export function scale(value: number, worst: number, best: number): number {
  if (worst === best) return 50;
  const t = (value - worst) / (best - worst);
  return Math.max(0, Math.min(100, t * 100));
}

/** Skor puncak di titik `ideal`, turun ke 0 di jarak `tolerance`. */
export function bell(value: number, ideal: number, tolerance: number): number {
  const d = Math.abs(value - ideal) / tolerance;
  return Math.max(0, Math.min(100, (1 - d) * 100));
}

/**
 * Menggabungkan komponen bernilai (skor, bobot) menjadi satu sub-skor.
 * Komponen yang datanya tidak ada TIDAK dihitung sebagai 0 — bobotnya dikeluarkan
 * dari penyebut, dan kekurangan datanya tercermin di `dataCompleteness`.
 */
export function combine(
  components: { score: number | null; weight: number }[],
): { score: number | null; completeness: number } {
  const totalWeight = components.reduce((a, c) => a + c.weight, 0);
  if (totalWeight === 0) return { score: null, completeness: 0 };

  let weighted = 0;
  let usedWeight = 0;
  for (const c of components) {
    if (c.score === null) continue;
    weighted += c.score * c.weight;
    usedWeight += c.weight;
  }

  if (usedWeight === 0) return { score: null, completeness: 0 };
  return { score: weighted / usedWeight, completeness: usedWeight / totalWeight };
}

export function emptyScore(reason: string): SubScore {
  return { score: null, dataCompleteness: 0, inputs: {}, notes: [reason] };
}
