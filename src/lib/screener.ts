import { z } from "zod";
import { loadLatestScores, loadUniverseSnapshot, type UniverseRow } from "./universeSnapshot";
import { METRIC_BY_KEY } from "./metrics";
import type { AssetType, InvestmentMode } from "./types";

/**
 * Mesin screener tunggal. Advanced Screener (UI filter) dan AI Screener
 * (bahasa natural) memakai fungsi yang SAMA — AI hanya menghasilkan objek
 * filter, lalu dieksekusi di sini (PRD §5 poin 3).
 *
 * Konsekuensi desain: apa pun yang diminta lewat bahasa natural tidak bisa
 * menghasilkan hasil yang tidak bisa dicapai lewat filter manual. Tidak ada
 * jalur data rahasia untuk AI.
 */

export const OPERATORS = ["gt", "gte", "lt", "lte", "eq", "between"] as const;
export type Operator = (typeof OPERATORS)[number];

export const filterSchema = z.object({
  metric: z.string(),
  operator: z.enum(OPERATORS),
  value: z.number(),
  value2: z.number().optional(),
});

export const screenerQuerySchema = z.object({
  assetTypes: z
    .array(z.enum(["us_stock", "idx_stock", "crypto", "gold"]))
    .optional()
    .default([]),
  filters: z.array(filterSchema).optional().default([]),
  sortBy: z.string().optional().default("overall_score"),
  sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
  limit: z.number().int().min(1).max(200).optional().default(50),
  search: z.string().optional(),
});

export type ScreenerQuery = z.infer<typeof screenerQuerySchema>;
export type ScreenerFilter = z.infer<typeof filterSchema>;

export interface ScreenerRow {
  ticker: string;
  name: string;
  assetType: AssetType;
  sector: string | null;
  currency: string;
  values: Record<string, number | null>;
  overallScore: number | null;
  confidence: number | null;
  stale: boolean;
  lastPriceAt: string | null;
  /** metrik yang diminta filter tapi tidak punya data untuk aset ini */
  missingMetrics: string[];
}

export interface ScreenerResult {
  rows: ScreenerRow[];
  total: number;
  /** aset yang tersaring keluar HANYA karena datanya tidak ada, bukan karena gagal filter */
  excludedForMissingData: number;
  appliedFilters: ScreenerFilter[];
  notes: string[];
}

/** Ambil semua nilai yang bisa difilter untuk satu aset. */
function extractValues(
  snapshot: UniverseRow,
  score: { overallScore: number; confidence: number } | null,
): Record<string, number | null> {
  const t = snapshot.technical;
  const f = snapshot.fundamentals;

  return {
    price: t.price,
    change1d: t.change1d,
    change7d: t.change7d,
    change30d: t.change30d,
    change90d: t.change90d,
    rsi14: t.rsi14,
    volatility: t.volatility === null ? null : t.volatility * 100,
    maxDrawdown: t.maxDrawdown === null ? null : t.maxDrawdown * 100,
    distanceFromHigh52w: t.distanceFromHigh52w,
    newsCount7d: snapshot.newsCount7d,
    overall_score: score?.overallScore ?? null,
    confidence: score ? score.confidence * 100 : null,
    revenue_growth: f.get("revenue_growth") ?? null,
    eps: f.get("eps") ?? null,
    eps_growth: f.get("eps_growth") ?? null,
    gross_margin: f.get("gross_margin") ?? null,
    net_margin: f.get("net_margin") ?? null,
    roe: f.get("roe") ?? null,
    debt_to_equity: f.get("debt_to_equity") ?? null,
    current_ratio: f.get("current_ratio") ?? null,
    per: f.get("per") ?? null,
    pbv: f.get("pbv") ?? null,
    dividend_yield: f.get("dividend_yield") ?? null,
  };
}

function passes(value: number | null, filter: ScreenerFilter): boolean | null {
  // null = tidak bisa dinilai. Dibedakan dari false supaya kita bisa melaporkan
  // "tersaring karena data tidak ada" secara terpisah (PRD §14: jujur soal data).
  if (value === null || !Number.isFinite(value)) return null;
  switch (filter.operator) {
    case "gt":
      return value > filter.value;
    case "gte":
      return value >= filter.value;
    case "lt":
      return value < filter.value;
    case "lte":
      return value <= filter.value;
    case "eq":
      return Math.abs(value - filter.value) < 1e-9;
    case "between":
      return value >= filter.value && value <= (filter.value2 ?? filter.value);
  }
}

export async function runScreener(
  query: ScreenerQuery,
  mode: InvestmentMode,
): Promise<ScreenerResult> {
  const notes: string[] = [];

  const validFilters = query.filters.filter((f) => {
    if (!METRIC_BY_KEY.has(f.metric)) {
      notes.push(`Filter "${f.metric}" diabaikan — metrik tidak tersedia di MVP (lihat PRD §8).`);
      return false;
    }
    return true;
  });

  // Seluruh universe dimuat sekali (lihat lib/universeSnapshot.ts), lalu
  // penyaringan dilakukan di memori. Sebelumnya tiap aset memicu 4 query
  // sendiri, yang membuat screener butuh lebih dari seribu round-trip.
  const [universe, scoreByAsset] = await Promise.all([
    loadUniverseSnapshot(),
    loadLatestScores(mode),
  ]);

  const search = query.search?.trim().toLowerCase();
  const candidates = universe.rows.filter((row) => {
    if (query.assetTypes.length && !query.assetTypes.includes(row.asset.assetType)) return false;
    if (!search) return true;
    return (
      row.asset.ticker.toLowerCase().includes(search) ||
      row.asset.name.toLowerCase().includes(search)
    );
  });

  const rows: ScreenerRow[] = [];
  let excludedForMissingData = 0;

  for (const snapshot of candidates) {
    const asset = snapshot.asset;
    const values = extractValues(snapshot, scoreByAsset.get(asset.id) ?? null);

    let failed = false;
    const missingMetrics: string[] = [];

    for (const filter of validFilters) {
      const verdict = passes(values[filter.metric] ?? null, filter);
      if (verdict === null) {
        missingMetrics.push(filter.metric);
        failed = true;
      } else if (!verdict) {
        failed = true;
      }
    }

    if (failed) {
      if (missingMetrics.length > 0) excludedForMissingData++;
      continue;
    }

    const score = scoreByAsset.get(asset.id);
    rows.push({
      ticker: asset.ticker,
      name: asset.name,
      assetType: asset.assetType,
      sector: asset.sector,
      currency: asset.currency,
      values,
      overallScore: score?.overallScore ?? null,
      confidence: score?.confidence ?? null,
      stale: snapshot.stale,
      lastPriceAt: snapshot.lastPriceAt?.toISOString() ?? null,
      missingMetrics,
    });
  }

  const sortKey = query.sortBy;
  rows.sort((a, b) => {
    const av = sortKey === "overall_score" ? a.overallScore : (a.values[sortKey] ?? null);
    const bv = sortKey === "overall_score" ? b.overallScore : (b.values[sortKey] ?? null);
    // Nilai kosong selalu di bawah, apa pun arah sortirnya.
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return query.sortDir === "asc" ? av - bv : bv - av;
  });

  if (excludedForMissingData > 0) {
    notes.push(
      `${excludedForMissingData} aset tidak masuk hasil karena metrik yang difilter tidak punya data (umumnya saham IDX & kripto untuk filter fundamental — lihat PRD §4).`,
    );
  }

  return {
    rows: rows.slice(0, query.limit),
    total: rows.length,
    excludedForMissingData,
    appliedFilters: validFilters,
    notes,
  };
}
