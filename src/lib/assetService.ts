import { prisma } from "./db";
import { buildTechnicalSnapshot, type Candle, type TechnicalSnapshot } from "./indicators";
import type { ScoringContext } from "./scoring/orchestrator";
import type { AssetType, Freshness } from "./types";

/**
 * Semua pembacaan data untuk halaman & scoring lewat sini.
 *
 * PRD §7 poin 3: halaman TIDAK PERNAH memanggil provider API langsung.
 * Fungsi-fungsi di file ini hanya menyentuh database — kalau datanya belum ada,
 * yang dikembalikan adalah ketiadaan data, bukan panggilan jaringan darurat.
 */

export interface AssetRow {
  id: string;
  ticker: string;
  name: string;
  assetType: AssetType;
  exchange: string | null;
  currency: string;
  sector: string | null;
  providerSymbol: string | null;
}

export interface AssetSnapshot extends AssetRow {
  technical: TechnicalSnapshot;
  fundamentals: Map<string, number>;
  fundamentalSource: string | null;
  newsCount7d: number;
  lastPriceAt: Date | null;
  priceAgeHours: number | null;
  source: string | null;
  freshness: Freshness | null;
  /** true kalau data harga lebih tua dari 48 jam (PRD §7 poin 5) */
  stale: boolean;
}

const HISTORY_BARS = 400;

export async function loadCandles(assetId: string, limit = HISTORY_BARS): Promise<Candle[]> {
  const rows = await prisma.marketData.findMany({
    where: { assetId },
    orderBy: { timestamp: "desc" },
    take: limit,
    select: { close: true, high: true, low: true, volume: true, timestamp: true },
  });

  return rows
    .reverse()
    .filter((r): r is typeof r & { close: number } => r.close !== null)
    .map((r) => ({
      close: r.close,
      high: r.high,
      low: r.low,
      volume: r.volume,
      timestamp: r.timestamp,
    }));
}

export async function buildSnapshot(asset: AssetRow): Promise<AssetSnapshot> {
  const [candles, fundamentalRows, latest, newsCount7d] = await Promise.all([
    loadCandles(asset.id),
    prisma.fundamentalData.findMany({
      where: { assetId: asset.id },
      orderBy: { fetchedAt: "desc" },
    }),
    prisma.marketData.findFirst({
      where: { assetId: asset.id },
      orderBy: { timestamp: "desc" },
      select: { timestamp: true, source: true, freshness: true, fetchedAt: true },
    }),
    prisma.news.count({
      where: { assetId: asset.id, publishedAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
    }),
  ]);

  // Satu metrik bisa punya beberapa periode; ambil yang paling baru di-fetch.
  const fundamentals = new Map<string, number>();
  let fundamentalSource: string | null = null;
  for (const row of fundamentalRows) {
    if (row.value === null || fundamentals.has(row.metric)) continue;
    fundamentals.set(row.metric, row.value);
    fundamentalSource ??= row.source;
  }

  const lastPriceAt = latest?.timestamp ?? null;
  const priceAgeHours = lastPriceAt ? (Date.now() - lastPriceAt.getTime()) / 3_600_000 : null;

  return {
    ...asset,
    technical: buildTechnicalSnapshot(candles),
    fundamentals,
    fundamentalSource,
    newsCount7d,
    lastPriceAt,
    priceAgeHours,
    source: latest?.source ?? null,
    freshness: (latest?.freshness as Freshness) ?? null,
    stale: priceAgeHours !== null && priceAgeHours > 48,
  };
}

export async function buildScoringContext(asset: AssetRow): Promise<ScoringContext> {
  const snapshot = await buildSnapshot(asset);
  const news = await prisma.news.findMany({
    where: { assetId: asset.id },
    orderBy: { publishedAt: "desc" },
    take: 25,
    select: { title: true, sentiment: true, publishedAt: true, sourceType: true },
  });

  return {
    ticker: asset.ticker,
    assetType: asset.assetType,
    technical: snapshot.technical,
    fundamentals: snapshot.fundamentals,
    news,
    priceAgeHours: snapshot.priceAgeHours,
  };
}

export async function findAssetByTicker(ticker: string): Promise<AssetRow | null> {
  const asset = await prisma.asset.findFirst({
    where: { ticker: { equals: ticker.toUpperCase() } },
  });
  return asset ? (asset as AssetRow) : null;
}

/** Umur data per job, untuk badge "terakhir diperbarui" di UI. */
export async function lastJobRuns() {
  const rows = await prisma.jobRun.findMany({
    where: { status: "success" },
    orderBy: { startedAt: "desc" },
    take: 20,
  });
  const byJob = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!byJob.has(r.job)) byJob.set(r.job, r);
  return byJob;
}
