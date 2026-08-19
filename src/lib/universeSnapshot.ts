import { prisma } from "./db";
import { buildTechnicalSnapshot, type Candle, type TechnicalSnapshot } from "./indicators";
import type { AssetRow } from "./assetService";
import type { AssetType, Freshness } from "./types";

/**
 * Pemuat massal untuk seluruh universe.
 *
 * Versi pertama dashboard dan screener memanggil `buildSnapshot()` di dalam loop
 * per aset. Tiap panggilan melakukan 4 query, sehingga satu kunjungan halaman
 * menghasilkan sekitar 1.000 round-trip database. Di SQLite lokal itu tidak
 * terasa (semuanya panggilan fungsi in-process), tapi begitu database pindah ke
 * Postgres terkelola setiap round-trip menjadi perjalanan jaringan 50-100 ms —
 * dashboard butuh 6 detik saat hangat dan jauh lebih lama saat dingin, yang
 * membuatnya terasa menggantung setiap kali pengguna kembali ke halaman itu.
 *
 * Di sini semuanya diambil dalam EMPAT query, berapa pun jumlah asetnya:
 *   1. bar harga (dibatasi 252 bar terakhir per aset lewat window function)
 *   2. seluruh metrik fundamental
 *   3. jumlah berita 7 hari per aset
 *   4. skor terbaru per aset untuk mode aktif
 *
 * Sisanya perhitungan murni di memori.
 */

/** 252 hari bursa ≈ 1 tahun; cukup untuk SMA 200, RSI, dan rentang 52 minggu. */
const BARS_PER_ASSET = 252;

/**
 * Hasil dianggap masih segar selama ini. Data hanya berubah ketika job berjalan,
 * jadi menahannya sebentar membuat perpindahan antar-halaman terasa instan tanpa
 * pernah menampilkan angka yang berbeda dari yang tersimpan.
 */
const CACHE_TTL_MS = 60_000;

export interface UniverseRow {
  asset: AssetRow;
  technical: TechnicalSnapshot;
  fundamentals: Map<string, number>;
  fundamentalSource: string | null;
  newsCount7d: number;
  lastPriceAt: Date | null;
  priceAgeHours: number | null;
  source: string | null;
  freshness: Freshness | null;
  stale: boolean;
}

export interface UniverseSnapshot {
  rows: UniverseRow[];
  byTicker: Map<string, UniverseRow>;
  loadedAt: Date;
}

/**
 * Prisma mengembalikan kolom DateTime dari query mentah dalam bentuk berbeda
 * per provider: objek Date di Postgres, angka epoch milidetik di SQLite.
 */
function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  return new Date(String(value));
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

interface RawBar {
  asset_id: string;
  timestamp: unknown;
  close: unknown;
  high: unknown;
  low: unknown;
  volume: unknown;
  source: string | null;
  freshness: string | null;
}

let cache: { snapshot: UniverseSnapshot; expiresAt: number } | null = null;

/** Dipanggil setelah job menulis data baru, supaya UI tidak menampilkan yang lama. */
export function invalidateUniverseCache(): void {
  cache = null;
}

export async function loadUniverseSnapshot(
  options: { force?: boolean } = {},
): Promise<UniverseSnapshot> {
  if (!options.force && cache && cache.expiresAt > Date.now()) {
    return cache.snapshot;
  }

  const assets = (await prisma.asset.findMany({ orderBy: { ticker: "asc" } })) as AssetRow[];

  if (assets.length === 0) {
    const empty: UniverseSnapshot = { rows: [], byTicker: new Map(), loadedAt: new Date() };
    cache = { snapshot: empty, expiresAt: Date.now() + CACHE_TTL_MS };
    return empty;
  }

  // ── 1. Bar harga: satu query untuk seluruh universe ─────────────────────
  // Window function membatasi jumlah bar PER ASET, bukan secara global —
  // tanpa itu, aset dengan riwayat panjang akan menyerap seluruh jatah baris.
  const rawBars = await prisma.$queryRaw<RawBar[]>`
    SELECT asset_id, timestamp, close, high, low, volume, source, freshness
    FROM (
      SELECT asset_id, timestamp, close, high, low, volume, source, freshness,
             ROW_NUMBER() OVER (PARTITION BY asset_id ORDER BY timestamp DESC) AS rn
      FROM market_data
      WHERE close IS NOT NULL
    ) ranked
    WHERE rn <= ${BARS_PER_ASSET}
    ORDER BY asset_id ASC, timestamp ASC
  `;

  const candlesByAsset = new Map<string, Candle[]>();
  const latestMetaByAsset = new Map<string, { source: string | null; freshness: string | null }>();

  for (const row of rawBars) {
    const close = toNumber(row.close);
    if (close === null) continue;

    const list = candlesByAsset.get(row.asset_id) ?? [];
    list.push({
      close,
      high: toNumber(row.high),
      low: toNumber(row.low),
      volume: toNumber(row.volume),
      timestamp: toDate(row.timestamp),
    });
    candlesByAsset.set(row.asset_id, list);
    // Baris terakhir yang terlihat per aset adalah yang paling baru (ORDER BY ASC).
    latestMetaByAsset.set(row.asset_id, { source: row.source, freshness: row.freshness });
  }

  // ── 2. Fundamental ──────────────────────────────────────────────────────
  const fundamentalRows = await prisma.fundamentalData.findMany({
    orderBy: { fetchedAt: "desc" },
    select: { assetId: true, metric: true, value: true, source: true },
  });

  const fundamentalsByAsset = new Map<string, Map<string, number>>();
  const fundamentalSourceByAsset = new Map<string, string>();

  for (const row of fundamentalRows) {
    if (row.value === null) continue;
    const map = fundamentalsByAsset.get(row.assetId) ?? new Map<string, number>();
    // Baris pertama yang ditemui adalah yang paling baru di-fetch.
    if (!map.has(row.metric)) map.set(row.metric, row.value);
    fundamentalsByAsset.set(row.assetId, map);
    if (!fundamentalSourceByAsset.has(row.assetId)) {
      fundamentalSourceByAsset.set(row.assetId, row.source);
    }
  }

  // ── 3. Jumlah berita 7 hari ─────────────────────────────────────────────
  const newsCounts = await prisma.news.groupBy({
    by: ["assetId"],
    where: { publishedAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
    _count: { _all: true },
  });
  const newsByAsset = new Map(newsCounts.map((n) => [n.assetId, n._count._all]));

  // ── Rakit ───────────────────────────────────────────────────────────────
  const rows: UniverseRow[] = assets.map((asset) => {
    const candles = candlesByAsset.get(asset.id) ?? [];
    const lastPriceAt = candles.at(-1)?.timestamp ?? null;
    const priceAgeHours = lastPriceAt ? (Date.now() - lastPriceAt.getTime()) / 3_600_000 : null;
    const meta = latestMetaByAsset.get(asset.id);

    return {
      asset,
      technical: buildTechnicalSnapshot(candles),
      fundamentals: fundamentalsByAsset.get(asset.id) ?? new Map(),
      fundamentalSource: fundamentalSourceByAsset.get(asset.id) ?? null,
      newsCount7d: newsByAsset.get(asset.id) ?? 0,
      lastPriceAt,
      priceAgeHours,
      source: meta?.source ?? null,
      freshness: (meta?.freshness as Freshness) ?? null,
      stale: priceAgeHours !== null && priceAgeHours > 48,
    };
  });

  const snapshot: UniverseSnapshot = {
    rows,
    byTicker: new Map(rows.map((r) => [r.asset.ticker, r])),
    loadedAt: new Date(),
  };

  cache = { snapshot, expiresAt: Date.now() + CACHE_TTL_MS };
  return snapshot;
}

/** Skor terbaru per aset untuk satu mode — satu query, bukan satu per aset. */
export async function loadLatestScores(
  mode: string,
): Promise<Map<string, { overallScore: number; confidence: number; createdAt: Date }>> {
  const rows = await prisma.analysisScore.findMany({
    where: { investmentMode: mode },
    orderBy: { createdAt: "desc" },
    select: { assetId: true, overallScore: true, confidence: true, createdAt: true },
  });

  const byAsset = new Map<string, { overallScore: number; confidence: number; createdAt: Date }>();
  for (const row of rows) {
    if (!byAsset.has(row.assetId)) byAsset.set(row.assetId, row);
  }
  return byAsset;
}

export type { AssetType };
