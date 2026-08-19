import { prisma } from "./db";
import { lastJobRuns } from "./assetService";
import { loadLatestScores, loadUniverseSnapshot } from "./universeSnapshot";
import { MODES } from "./modes";
import type { AssetType, Freshness, InvestmentMode } from "./types";

/**
 * Data untuk Unified Dashboard (Fase 2 PRD). Semua dari cache database.
 *
 * Perhitungan dilakukan sekali di sini dan dipakai oleh halaman maupun
 * endpoint /api/dashboard/overview, supaya keduanya tidak pernah berbeda angka.
 */

export interface MoverRow {
  ticker: string;
  name: string;
  assetType: AssetType;
  currency: string;
  price: number | null;
  change1d: number | null;
  change30d: number | null;
  score: number | null;
  confidence: number | null;
  stale: boolean;
  freshness: Freshness | null;
  lastPriceAt: Date | null;
}

export interface MarketSummary {
  assetType: AssetType;
  assetCount: number;
  withPriceData: number;
  advancing: number;
  declining: number;
  medianChange1d: number | null;
  avgScore: number | null;
  lastUpdated: Date | null;
  staleCount: number;
}

export interface Overview {
  mode: InvestmentMode;
  markets: MarketSummary[];
  topGainers: MoverRow[];
  topLosers: MoverRow[];
  topScores: MoverRow[];
  /** true kalau daftar skor tertinggi sudah disaring menurut ambang confidence */
  topScoresFiltered: boolean;
  /** berapa aset dikeluarkan dari daftar itu karena confidence di bawah ambang */
  excludedLowConfidence: number;
  confidenceFloor: number;
  watchlistChanges: {
    ticker: string;
    name: string;
    score: number | null;
    scoreDelta: number | null;
    change1d: number | null;
    currency: string;
    stale: boolean;
  }[];
  recentAlerts: {
    id: string;
    ticker: string;
    title: string;
    detail: string;
    explanation: string | null;
    severity: string;
    createdAt: Date;
  }[];
  jobs: { job: string; startedAt: Date; ok: number; failed: number; message: string | null }[];
  /** true kalau universe belum di-seed atau belum pernah ada job data */
  needsSetup: boolean;
  totalAssets: number;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export async function getOverview(mode: InvestmentMode): Promise<Overview> {
  // Satu pemuatan massal untuk seluruh universe, bukan satu snapshot per aset.
  // Lihat lib/universeSnapshot.ts untuk alasannya.
  const [universe, scoreByAsset] = await Promise.all([
    loadUniverseSnapshot(),
    loadLatestScores(mode),
  ]);
  const assets = universe.rows.map((r) => r.asset);

  if (assets.length === 0) {
    return {
      mode,
      markets: [],
      topGainers: [],
      topLosers: [],
      topScores: [],
      topScoresFiltered: false,
      excludedLowConfidence: 0,
      confidenceFloor: MODES[mode].confidenceFloor,
      watchlistChanges: [],
      recentAlerts: [],
      jobs: [],
      needsSetup: true,
      totalAssets: 0,
    };
  }

  const rows: MoverRow[] = [];
  const byType = new Map<AssetType, MoverRow[]>();

  for (const snapshot of universe.rows) {
    const asset = snapshot.asset;
    const score = scoreByAsset.get(asset.id);

    const row: MoverRow = {
      ticker: asset.ticker,
      name: asset.name,
      assetType: asset.assetType,
      currency: asset.currency,
      price: snapshot.technical.price,
      change1d: snapshot.technical.change1d,
      change30d: snapshot.technical.change30d,
      score: score?.overallScore ?? null,
      confidence: score?.confidence ?? null,
      stale: snapshot.stale,
      freshness: snapshot.freshness,
      lastPriceAt: snapshot.lastPriceAt,
    };

    rows.push(row);
    const bucket = byType.get(asset.assetType) ?? [];
    bucket.push(row);
    byType.set(asset.assetType, bucket);
  }

  const markets: MarketSummary[] = [...byType.entries()].map(([assetType, list]) => {
    const withPrice = list.filter((r) => r.price !== null);
    const changes = list.map((r) => r.change1d).filter((v): v is number => v !== null);
    const scores = list.map((r) => r.score).filter((v): v is number => v !== null);
    const timestamps = list
      .map((r) => r.lastPriceAt)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => b.getTime() - a.getTime());

    return {
      assetType,
      assetCount: list.length,
      withPriceData: withPrice.length,
      advancing: changes.filter((c) => c > 0).length,
      declining: changes.filter((c) => c < 0).length,
      medianChange1d: median(changes),
      avgScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
      lastUpdated: timestamps[0] ?? null,
      staleCount: list.filter((r) => r.stale).length,
    };
  });

  // Top movers hanya dari aset yang datanya TIDAK basi — kalau tidak, "gainer
  // terbesar" bisa jadi sekadar aset yang datanya berhenti diperbarui.
  const fresh = rows.filter((r) => !r.stale && r.change1d !== null);
  const sortedByChange = [...fresh].sort((a, b) => (b.change1d ?? 0) - (a.change1d ?? 0));

  // "Skor tertinggi" hanya menampilkan aset yang confidence-nya memenuhi ambang
  // mode aktif. Tanpa penyaringan ini, daftar akan didominasi aset yang skornya
  // tinggi justru KARENA datanya tipis — stablecoin, misalnya, mendapat skor
  // risiko nyaris sempurna dari volatilitas mendekati nol, padahal 75% bobot
  // mode Investor (fundamental + valuasi) sama sekali tidak punya data.
  const floor = MODES[mode].confidenceFloor;
  const scored = rows.filter((r) => r.score !== null && !r.stale);
  const confident = scored.filter((r) => (r.confidence ?? 0) >= floor);
  const topScores = [...(confident.length > 0 ? confident : scored)]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 8);
  const topScoresFiltered = confident.length > 0;
  const excludedLowConfidence = scored.length - confident.length;

  const watchlist = await prisma.watchlistItem.findMany({ include: { asset: true } });
  const watchlistChanges = await Promise.all(
    watchlist.map(async (item) => {
      const history = await prisma.analysisScore.findMany({
        where: { assetId: item.assetId, investmentMode: mode },
        orderBy: { createdAt: "desc" },
        take: 2,
      });
      const row = rows.find((r) => r.ticker === item.asset.ticker);

      return {
        ticker: item.asset.ticker,
        name: item.asset.name,
        currency: item.asset.currency,
        score: history[0]?.overallScore ?? null,
        scoreDelta:
          history.length === 2 ? history[0].overallScore - history[1].overallScore : null,
        change1d: row?.change1d ?? null,
        stale: row?.stale ?? false,
      };
    }),
  );

  const recentAlerts = (
    await prisma.alertEvent.findMany({
      include: { asset: { select: { ticker: true } } },
      orderBy: { createdAt: "desc" },
      take: 6,
    })
  ).map((e) => ({
    id: e.id,
    ticker: e.asset.ticker,
    title: e.title,
    detail: e.detail,
    explanation: e.explanation,
    severity: e.severity,
    createdAt: e.createdAt,
  }));

  const jobRuns = await lastJobRuns();

  return {
    mode,
    markets: markets.sort((a, b) => a.assetType.localeCompare(b.assetType)),
    topGainers: sortedByChange.slice(0, 8),
    topLosers: sortedByChange.slice(-8).reverse(),
    topScores,
    topScoresFiltered,
    excludedLowConfidence,
    confidenceFloor: floor,
    watchlistChanges: watchlistChanges.sort(
      (a, b) => Math.abs(b.scoreDelta ?? 0) - Math.abs(a.scoreDelta ?? 0),
    ),
    recentAlerts,
    jobs: [...jobRuns.values()].map((j) => ({
      job: j.job,
      startedAt: j.startedAt,
      ok: j.ok,
      failed: j.failed,
      message: j.message,
    })),
    needsSetup: rows.every((r) => r.price === null),
    totalAssets: assets.length,
  };
}
