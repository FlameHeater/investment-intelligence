export type AssetType = "us_stock" | "idx_stock" | "crypto" | "gold";
export type Freshness = "realtime" | "delayed_15m" | "delayed_20m" | "eod";
export type SourceType = "official" | "media" | "social_unverified";
export type Sentiment = "positive" | "neutral" | "negative";
export type InvestmentMode = "beginner" | "investor" | "trader" | "crypto";

export const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  us_stock: "Saham AS",
  idx_stock: "Saham IDX",
  crypto: "Kripto",
  gold: "Emas",
};

export const FRESHNESS_LABEL: Record<Freshness, string> = {
  realtime: "Real-time",
  delayed_15m: "Delayed 15 menit",
  delayed_20m: "Delayed 20 menit",
  eod: "End of day",
};

/// Skor sub-dimensi. `null` = data tidak tersedia (BUKAN 0). Lihat PRD §4 & §14.
export interface SubScore {
  score: number | null;
  /// 0-1 seberapa lengkap data yang mendasari skor ini
  dataCompleteness: number;
  /// angka mentah yang dipakai, untuk ditampilkan di UI breakdown (PRD §14)
  inputs: Record<string, number | string | null>;
  notes: string[];
}

export interface ScoreBreakdown {
  fundamental: SubScore;
  technical: SubScore;
  valuation: SubScore;
  sentiment: SubScore;
  risk: SubScore;
}

export interface AiReasoning {
  summary: string;
  supportingFactors: string[];
  contradictingFactors: string[];
  dataGaps: string[];
  scenarios: {
    bull: string;
    base: string;
    bear: string;
  };
  generatedAt: string;
  model: string;
}
