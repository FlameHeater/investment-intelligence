import { MODES } from "../modes";
import type { InvestmentMode, ScoreBreakdown } from "../types";
import { fundamentalScore } from "./fundamental";
import { technicalScore } from "./technical";
import { valuationScore } from "./valuation";
import { sentimentScore } from "./sentiment";
import { riskScore } from "./risk";
import type { ScoringContext } from "./shared";

export type { ScoringContext } from "./shared";

/**
 * Orchestrator — fungsi TypeScript biasa, bukan sistem multi-agent (PRD §6.3).
 *
 * Dua keputusan penting di sini:
 *
 * 1. Bobot dinormalisasi ulang ketika sebuah sub-skor null. Kalau kripto tidak
 *    punya skor fundamental, bobot 0,4 milik fundamental TIDAK diperlakukan
 *    sebagai skor 0 — bobot itu dikeluarkan dan sisanya dinormalkan. Tanpa ini,
 *    setiap aset dengan data tidak lengkap akan otomatis terlihat buruk.
 *
 * 2. Confidence dihitung dari kelengkapan data yang benar-benar dipakai, jadi
 *    aset dengan data bolong (mis. saham IDX tanpa fundamental) akan punya
 *    confidence rendah — dan UI wajib menampilkannya (PRD §14).
 */

export interface ScoreResult {
  mode: InvestmentMode;
  breakdown: ScoreBreakdown;
  overallScore: number;
  confidence: number;
  /** bobot efektif setelah normalisasi ulang, untuk ditampilkan di UI */
  effectiveWeights: Record<keyof ScoreBreakdown, number>;
  warnings: string[];
}

export function computeScore(ctx: ScoringContext, mode: InvestmentMode): ScoreResult {
  const config = MODES[mode];

  const breakdown: ScoreBreakdown = {
    fundamental: fundamentalScore(ctx),
    technical: technicalScore(ctx),
    valuation: valuationScore(ctx),
    sentiment: sentimentScore(ctx),
    risk: riskScore(ctx),
  };

  const keys = Object.keys(breakdown) as (keyof ScoreBreakdown)[];

  // Langkah 1: sisihkan dimensi yang datanya tidak ada.
  const usable = keys.filter((k) => breakdown[k].score !== null && config.weights[k] > 0);
  const declaredWeight = keys.reduce((a, k) => a + config.weights[k], 0);
  const usableWeight = usable.reduce((a, k) => a + config.weights[k], 0);

  const effectiveWeights = Object.fromEntries(
    keys.map((k) => [k, usable.includes(k) && usableWeight > 0 ? config.weights[k] / usableWeight : 0]),
  ) as Record<keyof ScoreBreakdown, number>;

  // Langkah 2: rata-rata terbobot dari dimensi yang tersedia.
  const overallScore =
    usableWeight > 0
      ? usable.reduce((a, k) => a + breakdown[k].score! * effectiveWeights[k], 0)
      : 0;

  // Langkah 3: confidence = seberapa besar porsi bobot mode yang benar-benar
  // terisi data, dikalikan rata-rata kelengkapan data di dalam tiap dimensi.
  const coverage = declaredWeight > 0 ? usableWeight / declaredWeight : 0;
  const depth =
    usable.length > 0
      ? usable.reduce((a, k) => a + breakdown[k].dataCompleteness * effectiveWeights[k], 0)
      : 0;
  const confidence = Math.max(0, Math.min(1, coverage * (0.5 + 0.5 * depth)));

  const warnings: string[] = [];
  if (usableWeight === 0) {
    warnings.push(
      "Tidak ada satu pun dimensi yang punya data untuk mode ini. Skor tidak bisa dianggap bermakna.",
    );
  }
  if (confidence < config.confidenceFloor) {
    warnings.push(
      `Confidence ${(confidence * 100).toFixed(0)}% di bawah ambang mode ${config.label} (${(config.confidenceFloor * 100).toFixed(0)}%). Perlakukan skor ini sebagai indikasi kasar, bukan kesimpulan.`,
    );
  }
  for (const k of keys) {
    if (config.weights[k] > 0 && breakdown[k].score === null) {
      warnings.push(`Dimensi ${k} tidak punya data; bobotnya dialihkan ke dimensi lain.`);
    }
  }

  return {
    mode,
    breakdown,
    overallScore: Math.round(overallScore * 10) / 10,
    confidence: Math.round(confidence * 100) / 100,
    effectiveWeights,
    warnings,
  };
}

/** Label kualitatif untuk skor — dipakai di UI supaya angka punya konteks. */
export function scoreLabel(score: number): { label: string; tone: "good" | "neutral" | "bad" } {
  if (score >= 70) return { label: "Kuat", tone: "good" };
  if (score >= 55) return { label: "Cukup Baik", tone: "good" };
  if (score >= 45) return { label: "Netral", tone: "neutral" };
  if (score >= 30) return { label: "Lemah", tone: "bad" };
  return { label: "Sangat Lemah", tone: "bad" };
}
