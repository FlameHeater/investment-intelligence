import type { InvestmentMode } from "./types";

/// PRD §2: 8 mode PRD v1 diringkas jadi 4 mode MVP.
/// Bobot dinormalisasi ulang saat ada sub-skor yang null (lihat scoring/orchestrator.ts).
export interface ModeConfig {
  id: InvestmentMode;
  label: string;
  tagline: string;
  description: string;
  weights: {
    fundamental: number;
    technical: number;
    valuation: number;
    sentiment: number;
    risk: number;
  };
  /// ambang confidence di bawah mana UI menampilkan peringatan
  confidenceFloor: number;
}

export const MODES: Record<InvestmentMode, ModeConfig> = {
  beginner: {
    id: "beginner",
    label: "Beginner",
    tagline: "Aman & mudah dipahami",
    description:
      "Menekankan kualitas fundamental dan risiko rendah. Cocok kalau Anda baru mulai dan ingin menghindari aset yang bergerak liar.",
    weights: { fundamental: 0.3, technical: 0.1, valuation: 0.2, sentiment: 0.1, risk: 0.3 },
    confidenceFloor: 0.6,
  },
  investor: {
    id: "investor",
    label: "Investor",
    tagline: "Jangka panjang + fundamental",
    description:
      "Gabungan mode Long-Term Investor dan Fundamental Investor dari PRD v1. Fokus pada kesehatan bisnis dan harga wajar.",
    weights: { fundamental: 0.4, technical: 0.1, valuation: 0.3, sentiment: 0.05, risk: 0.15 },
    confidenceFloor: 0.5,
  },
  trader: {
    id: "trader",
    label: "Trader",
    tagline: "Momentum & swing",
    description:
      "Gabungan mode Trader dan Swing Trader. Fokus pada tren harga, momentum, dan berita jangka pendek.",
    weights: { fundamental: 0.1, technical: 0.45, valuation: 0.05, sentiment: 0.25, risk: 0.15 },
    confidenceFloor: 0.4,
  },
  crypto: {
    id: "crypto",
    label: "Crypto",
    tagline: "Tanpa laporan keuangan",
    description:
      "Aset kripto tidak punya laporan keuangan, jadi dimensi fundamental & valuasi tidak dipakai. Bobot dialihkan ke teknikal, sentimen, dan risiko.",
    weights: { fundamental: 0, technical: 0.45, valuation: 0, sentiment: 0.25, risk: 0.3 },
    confidenceFloor: 0.4,
  },
};

export const MODE_LIST = Object.values(MODES);

export function isInvestmentMode(v: unknown): v is InvestmentMode {
  return typeof v === "string" && v in MODES;
}

export const DEFAULT_MODE: InvestmentMode = "investor";
