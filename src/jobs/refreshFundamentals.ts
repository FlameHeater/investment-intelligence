import { prisma } from "../lib/db";
import { fetchMetrics, finnhubEnabled, FINNHUB_SOURCE } from "../lib/providers/finnhub";
import { finish, progress, runJob } from "./_runner";

/**
 * Fundamental hanya untuk saham AS (PRD §4 & §8).
 *
 * Kenapa IDX tidak ada di sini: tidak ada API resmi IDX yang gratis dan stabil
 * untuk data fundamental. Alih-alih menambal dengan angka scraping tanpa jaminan,
 * MVP memilih menampilkan "tidak tersedia" di UI. Keputusan itu ada di PRD §4
 * dan konsekuensinya sudah dibangun ke dalam scorer & screener.
 *
 * Frekuensi: harian (PRD §7 poin 4) — laporan keuangan tidak berubah tiap jam.
 */
async function refresh() {
  if (!finnhubEnabled()) {
    return {
      ok: 0,
      failed: 0,
      message:
        "FINNHUB_API_KEY kosong — job dilewati. Skor fundamental & valuasi akan tetap kosong, dan UI menampilkannya apa adanya.",
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
  let i = 0;

  for (const asset of assets) {
    i++;
    const metrics = await fetchMetrics(asset.providerSymbol ?? asset.ticker);

    if (metrics.length === 0) {
      failed++;
      progress(i, assets.length, "Finnhub");
      continue;
    }

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
    progress(i, assets.length, "Finnhub");
  }

  return {
    ok,
    failed,
    message: `${ok} saham AS punya data fundamental terbaru. ${failed} tidak mengembalikan metrik apa pun.`,
  };
}

runJob("refreshFundamentals", refresh).finally(finish);
