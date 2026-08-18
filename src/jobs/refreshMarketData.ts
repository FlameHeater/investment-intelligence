import { prisma } from "../lib/db";
import { fetchChart, YAHOO_FRESHNESS, YAHOO_SOURCE } from "../lib/providers/yahoo";
import {
  COINGECKO_FRESHNESS,
  COINGECKO_SOURCE,
  fetchCoinHistory,
  fetchTopCoins,
} from "../lib/providers/coingecko";
import { finish, progress, runJob } from "./_runner";
import type { Bar } from "../lib/providers/yahoo";

/**
 * Job utama pengisi cache harga (PRD §7 poin 2).
 *
 * Dijalankan tiap 15-30 menit saat jam bursa lewat `npm run cron`, atau manual
 * lewat `npm run job:market`. Halaman aplikasi TIDAK PERNAH memanggil provider —
 * mereka hanya membaca apa yang job ini simpan.
 *
 * Flag CLI:
 *   --full     ambil riwayat 2 tahun (default: 1 tahun; dipakai saat inisialisasi)
 *   --only=us,idx,crypto,gold   batasi kelas aset yang direfresh
 */

const args = process.argv.slice(2);
const FULL = args.includes("--full");
const onlyArg = args.find((a) => a.startsWith("--only="));
const ONLY = onlyArg ? onlyArg.slice("--only=".length).split(",") : null;

const TYPE_ALIAS: Record<string, string> = {
  us: "us_stock",
  idx: "idx_stock",
  crypto: "crypto",
  gold: "gold",
};

function wanted(assetType: string): boolean {
  if (!ONLY) return true;
  return ONLY.some((a) => (TYPE_ALIAS[a] ?? a) === assetType);
}

/**
 * Menyimpan bar tanpa duplikasi. Timestamp dinormalkan ke tengah malam UTC
 * supaya bar harian dari dua kali refresh di hari yang sama menimpa, bukan
 * menumpuk — kalau tidak, indikator akan menghitung hari yang sama berkali-kali.
 */
async function saveBars(
  assetId: string,
  bars: Bar[],
  source: string,
  freshness: string,
): Promise<number> {
  const fetchedAt = new Date();
  let saved = 0;

  for (const bar of bars) {
    const day = new Date(bar.timestamp);
    day.setUTCHours(0, 0, 0, 0);

    try {
      await prisma.marketData.upsert({
        where: { assetId_timestamp: { assetId, timestamp: day } },
        create: {
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
        },
        update: {
          price: bar.close,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume,
          source,
          freshness,
          fetchedAt,
        },
      });
      saved++;
    } catch {
      // Satu bar gagal tidak boleh menggagalkan seluruh ticker.
    }
  }
  return saved;
}

async function refresh() {
  let ok = 0;
  let failed = 0;
  const failures: string[] = [];

  // ── Aset berbasis Yahoo: saham AS, saham IDX, emas ──────────────────────
  const yahooAssets = await prisma.asset.findMany({
    where: { assetType: { in: ["us_stock", "idx_stock", "gold"] } },
    orderBy: { ticker: "asc" },
  });
  const yahooTargets = yahooAssets.filter((a) => wanted(a.assetType));

  if (yahooTargets.length > 0) {
    console.log(`   Yahoo Finance: ${yahooTargets.length} aset (jeda 1,2 detik/permintaan)`);
    let i = 0;
    for (const asset of yahooTargets) {
      i++;
      const chart = await fetchChart(asset.providerSymbol ?? asset.ticker, FULL ? "2y" : "1y");

      if (!chart || chart.bars.length === 0) {
        failed++;
        failures.push(asset.ticker);
        // PRD §7 poin 5: kegagalan provider TIDAK menghapus data lama dan tidak
        // menuliskan angka pengganti. Data lama tetap ada, dan umurnya yang
        // membuat UI menandainya basi.
      } else {
        await saveBars(asset.id, chart.bars, YAHOO_SOURCE, YAHOO_FRESHNESS);
        ok++;
      }
      progress(i, yahooTargets.length, "Yahoo");
    }
  }

  // ── Kripto: satu panggilan untuk harga terkini semua coin ────────────────
  if (wanted("crypto")) {
    const cryptoAssets = await prisma.asset.findMany({ where: { assetType: "crypto" } });

    if (cryptoAssets.length > 0) {
      console.log(`   CoinGecko: ${cryptoAssets.length} coin`);

      // Harga terkini: 1 panggilan untuk semuanya — jauh lebih hemat kuota.
      const markets = await fetchTopCoins(Math.max(cryptoAssets.length, 100));
      const bySymbol = new Map(markets.map((m) => [m.id, m]));
      const fetchedAt = new Date();
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      for (const asset of cryptoAssets) {
        const market = bySymbol.get(asset.providerSymbol ?? "");
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

      // Riwayat: hanya diambil untuk coin yang belum punya cukup bar, karena
      // endpoint history dipanggil per-coin dan boros kuota.
      let backfilled = 0;
      let j = 0;
      for (const asset of cryptoAssets) {
        j++;
        const barCount = await prisma.marketData.count({ where: { assetId: asset.id } });
        if (barCount >= 200 && !FULL) continue;

        const history = await fetchCoinHistory(asset.providerSymbol ?? "", FULL ? 730 : 365);
        if (history.length > 0) {
          await saveBars(asset.id, history, COINGECKO_SOURCE, COINGECKO_FRESHNESS);
          backfilled++;
        }
        progress(j, cryptoAssets.length, "CoinGecko history");
      }
      if (backfilled > 0) console.log(`   Riwayat kripto diisi untuk ${backfilled} coin.`);
    }
  }

  const message =
    failures.length > 0
      ? `Gagal mengambil ${failures.length} aset: ${failures.slice(0, 15).join(", ")}${failures.length > 15 ? ", ..." : ""}. Data lama dipertahankan dan akan ditandai basi di UI.`
      : "Semua aset berhasil diperbarui.";

  return { ok, failed, message };
}

runJob("refreshMarketData", refresh).finally(finish);
