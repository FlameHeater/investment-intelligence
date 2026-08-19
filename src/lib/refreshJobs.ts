import { prisma } from "./db";
import { fetchChart, YAHOO_FRESHNESS, YAHOO_SOURCE, type Bar } from "./providers/yahoo";
import {
  COINGECKO_FRESHNESS,
  COINGECKO_SOURCE,
  fetchCoinHistory,
  fetchTopCoins,
} from "./providers/coingecko";
import { fetchCompanyNews, fetchMetrics, finnhubEnabled, FINNHUB_SOURCE } from "./providers/finnhub";
import { fetchIdxNews } from "./providers/googleNewsId";
import { classifySentiment } from "./scoring/sentiment";
import { invalidateUniverseCache } from "./universeSnapshot";
import type { NewsItem } from "./providers/finnhub";
import type { JobOutcome } from "./jobRunners";

/**
 * Job yang memanggil provider eksternal.
 *
 * Sebelumnya logika ini tinggal di dalam skrip CLI di src/jobs/, sehingga hanya
 * bisa dijalankan dari terminal. Dipindah ke lib supaya tombol "Perbarui data"
 * di UI dan skrip CLI menjalankan kode yang PERSIS SAMA — kalau tidak, keduanya
 * akan pelan-pelan berbeda perilaku dan bug hanya muncul di salah satunya.
 */

export type AssetScope = "us" | "idx" | "crypto" | "gold";

const TYPE_BY_SCOPE: Record<AssetScope, string> = {
  us: "us_stock",
  idx: "idx_stock",
  crypto: "crypto",
  gold: "gold",
};

export interface RefreshOptions {
  /** batasi kelas aset; kosong berarti semuanya */
  only?: AssetScope[];
  /** ambil riwayat 2 tahun, bukan 1 */
  full?: boolean;
  /** dipanggil tiap beberapa aset supaya UI bisa menampilkan progres */
  onProgress?: (done: number, total: number, label: string) => void;
}

/** 252 hari bursa; window function membatasi per aset, bukan global. */
const INSERT_CHUNK = 500;

/**
 * Menyimpan bar tanpa duplikasi. Timestamp dinormalkan ke tengah malam UTC
 * supaya dua refresh di hari yang sama menimpa, bukan menumpuk.
 *
 * Strategi: SATU query membaca timestamp yang ada, SATU createMany untuk bar
 * baru, SATU upsert untuk bar terakhir. Versi awal melakukan upsert per bar,
 * yang di Postgres terkelola turun ke ~1 bar/detik (12 jam untuk satu universe).
 * Bar historis yang sudah tutup tidak berubah, jadi melewatkan yang sudah ada
 * aman; hanya bar terakhir yang perlu ditulis ulang.
 */
export async function saveBars(
  assetId: string,
  bars: Bar[],
  source: string,
  freshness: string,
): Promise<number> {
  if (bars.length === 0) return 0;
  const fetchedAt = new Date();

  const normalized = bars.map((bar) => {
    const day = new Date(bar.timestamp);
    day.setUTCHours(0, 0, 0, 0);
    return {
      assetId,
      timestamp: day,
      price: bar.close,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
      source,
      freshness,
      fetchedAt,
    };
  });

  const existing = await prisma.marketData.findMany({
    where: { assetId },
    select: { timestamp: true },
  });
  const known = new Set(existing.map((r) => r.timestamp.getTime()));

  const latest = normalized.at(-1)!;
  const fresh = normalized.slice(0, -1).filter((row) => !known.has(row.timestamp.getTime()));

  let saved = 0;
  for (let i = 0; i < fresh.length; i += INSERT_CHUNK) {
    try {
      const result = await prisma.marketData.createMany({ data: fresh.slice(i, i + INSERT_CHUNK) });
      saved += result.count;
    } catch {
      // Satu potongan gagal tidak boleh menggagalkan seluruh ticker.
    }
  }

  try {
    const { assetId: _a, timestamp: _t, ...updatable } = latest;
    await prisma.marketData.upsert({
      where: { assetId_timestamp: { assetId, timestamp: latest.timestamp } },
      create: latest,
      update: updatable,
    });
    saved++;
  } catch {
    // idem
  }

  return saved;
}

export async function refreshMarketData(options: RefreshOptions = {}): Promise<JobOutcome> {
  const wanted = (assetType: string) =>
    !options.only?.length || options.only.some((s) => TYPE_BY_SCOPE[s] === assetType);

  let ok = 0;
  let failed = 0;
  const failures: string[] = [];

  // ── Yahoo: saham AS, saham IDX, emas ────────────────────────────────────
  const yahooAssets = (
    await prisma.asset.findMany({
      where: { assetType: { in: ["us_stock", "idx_stock", "gold"] } },
      orderBy: { ticker: "asc" },
    })
  ).filter((a) => wanted(a.assetType));

  let done = 0;
  const totalSteps = yahooAssets.length;

  for (const asset of yahooAssets) {
    const chart = await fetchChart(asset.providerSymbol ?? asset.ticker, options.full ? "2y" : "1y");

    if (!chart || chart.bars.length === 0) {
      failed++;
      failures.push(asset.ticker);
      // Kegagalan provider TIDAK menghapus data lama dan tidak menulis angka
      // pengganti. Data lama tetap ada, dan umurnya yang membuat UI menandainya
      // basi — itu informasi yang jujur, bukan kekosongan.
    } else {
      await saveBars(asset.id, chart.bars, YAHOO_SOURCE, YAHOO_FRESHNESS);
      ok++;
    }

    done++;
    options.onProgress?.(done, totalSteps, `Harga ${asset.ticker}`);
  }

  // ── CoinGecko: kripto ───────────────────────────────────────────────────
  if (wanted("crypto")) {
    const cryptoAssets = await prisma.asset.findMany({ where: { assetType: "crypto" } });

    if (cryptoAssets.length > 0) {
      // Harga terkini seluruh coin dalam SATU panggilan — jauh lebih hemat kuota
      // daripada satu panggilan per coin.
      const markets = await fetchTopCoins(Math.max(cryptoAssets.length, 100));
      const byId = new Map(markets.map((m) => [m.id, m]));
      const fetchedAt = new Date();
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      for (const asset of cryptoAssets) {
        const market = byId.get(asset.providerSymbol ?? "");
        if (!market?.currentPrice) {
          failed++;
          failures.push(asset.ticker);
          continue;
        }

        await prisma.marketData.upsert({
          where: { assetId_timestamp: { assetId: asset.id, timestamp: today } },
          create: {
            assetId: asset.id,
            timestamp: today,
            price: market.currentPrice,
            open: null,
            high: market.high24h,
            low: market.low24h,
            close: market.currentPrice,
            volume: market.totalVolume,
            source: COINGECKO_SOURCE,
            freshness: COINGECKO_FRESHNESS,
            fetchedAt,
          },
          update: {
            price: market.currentPrice,
            high: market.high24h,
            low: market.low24h,
            close: market.currentPrice,
            volume: market.totalVolume,
            source: COINGECKO_SOURCE,
            freshness: COINGECKO_FRESHNESS,
            fetchedAt,
          },
        });
        ok++;
      }

      options.onProgress?.(cryptoAssets.length, cryptoAssets.length, "Harga kripto terkini");

      // Riwayat diambil per coin (boros kuota), jadi hanya untuk yang belum
      // punya cukup bar.
      let i = 0;
      for (const asset of cryptoAssets) {
        i++;
        const barCount = await prisma.marketData.count({ where: { assetId: asset.id } });
        if (barCount >= 200 && !options.full) continue;

        const history = await fetchCoinHistory(asset.providerSymbol ?? "", options.full ? 730 : 365);
        if (history.length > 0) {
          await saveBars(asset.id, history, COINGECKO_SOURCE, COINGECKO_FRESHNESS);
        }
        options.onProgress?.(i, cryptoAssets.length, `Riwayat ${asset.ticker}`);
      }
    }
  }

  invalidateUniverseCache();

  return {
    ok,
    failed,
    message:
      failures.length > 0
        ? `Gagal mengambil ${failures.length} aset: ${failures.slice(0, 15).join(", ")}${failures.length > 15 ? ", ..." : ""}. Data lama dipertahankan dan ditandai basi di UI.`
        : "Semua aset berhasil diperbarui.",
  };
}

/**
 * Fundamental hanya untuk saham AS. Saham IDX tidak punya sumber gratis yang
 * reliable, dan kripto/emas memang tidak punya laporan keuangan sama sekali.
 */
export async function refreshFundamentals(options: RefreshOptions = {}): Promise<JobOutcome> {
  if (!finnhubEnabled()) {
    return {
      ok: 0,
      failed: 0,
      message:
        "FINNHUB_API_KEY kosong — dilewati. Skor fundamental & valuasi tetap kosong, dan UI menampilkannya apa adanya.",
    };
  }

  const assets = await prisma.asset.findMany({
    where: { assetType: "us_stock" },
    orderBy: { ticker: "asc" },
  });

  let ok = 0;
  let failed = 0;
  const period = `TTM-${new Date().toISOString().slice(0, 7)}`;
  const now = new Date();
  let done = 0;

  for (const asset of assets) {
    const metrics = await fetchMetrics(asset.providerSymbol ?? asset.ticker);

    if (metrics.length === 0) {
      failed++;
    } else {
      for (const m of metrics) {
        await prisma.fundamentalData.upsert({
          where: { assetId_metric_period: { assetId: asset.id, metric: m.metric, period } },
          create: {
            assetId: asset.id,
            metric: m.metric,
            value: m.value,
            period,
            source: FINNHUB_SOURCE,
            reportedAt: now,
            fetchedAt: now,
          },
          update: { value: m.value, fetchedAt: now },
        });
      }
      ok++;
    }

    done++;
    options.onProgress?.(done, assets.length, `Fundamental ${asset.ticker}`);
  }

  invalidateUniverseCache();

  return {
    ok,
    failed,
    message: `${ok} saham AS punya fundamental terbaru. ${failed} tidak mengembalikan metrik apa pun.`,
  };
}

export async function saveNews(assetId: string, items: NewsItem[]): Promise<number> {
  const fetchedAt = new Date();
  let saved = 0;

  for (const item of items) {
    if (!item.url) continue;
    try {
      await prisma.news.upsert({
        where: { assetId_url: { assetId, url: item.url } },
        create: {
          assetId,
          title: item.title,
          source: item.source,
          sourceType: item.sourceType,
          url: item.url,
          summary: item.summary,
          sentiment: classifySentiment(item.title, item.summary),
          publishedAt: item.publishedAt,
          fetchedAt,
        },
        update: { fetchedAt },
      });
      saved++;
    } catch {
      // Duplikat atau URL bermasalah — lewati satu item, jangan gagalkan job.
    }
  }
  return saved;
}

export async function refreshNews(options: RefreshOptions = {}): Promise<JobOutcome> {
  let ok = 0;
  let failed = 0;
  let totalItems = 0;

  // Saham AS lewat Finnhub; dilewati kalau keynya kosong.
  if (finnhubEnabled()) {
    const usAssets = await prisma.asset.findMany({
      where: { assetType: "us_stock" },
      orderBy: { ticker: "asc" },
    });

    let done = 0;
    for (const asset of usAssets) {
      const items = await fetchCompanyNews(asset.providerSymbol ?? asset.ticker, 7);
      if (items.length === 0) {
        failed++;
      } else {
        totalItems += await saveNews(asset.id, items);
        ok++;
      }
      done++;
      options.onProgress?.(done, usAssets.length, `Berita ${asset.ticker}`);
    }
  }

  // Emiten IDX lewat Google News RSS. Tidak butuh API key, dan tidak ada kuota
  // yang perlu dijaga — lihat providers/googleNewsId.ts untuk alasan pemilihan
  // sumber ini beserta peringatannya.
  const idxAssets = await prisma.asset.findMany({
    where: { assetType: "idx_stock" },
    orderBy: { ticker: "asc" },
  });

  let doneIdx = 0;
  for (const asset of idxAssets) {
    const items = await fetchIdxNews(asset.ticker);
    if (items.length === 0) {
      failed++;
    } else {
      totalItems += await saveNews(asset.id, items);
      ok++;
    }
    doneIdx++;
    options.onProgress?.(doneIdx, idxAssets.length, `Berita ${asset.ticker}`);
  }

  // Berita lebih tua dari 90 hari tidak dipakai scorer mana pun.
  const { count: pruned } = await prisma.news.deleteMany({
    where: { publishedAt: { lt: new Date(Date.now() - 90 * 86_400_000) } },
  });

  invalidateUniverseCache();

  return {
    ok,
    failed,
    message: `${totalItems} artikel tersimpan/diperbarui. ${pruned} artikel lama (>90 hari) dihapus.`,
  };
}
